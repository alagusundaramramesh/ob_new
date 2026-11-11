const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const INVOICE_PDF = require('./class.invoice_pdf');
const EMAIL = require('../utils/util.email_templates');
const { BusinessError } = require('../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* Documents a customer can be reminded about */
const REMINDER_TYPES = [TT.SALES_INVOICE, TT.SALES_DEBIT_NOTE];

/* company.reminder_settings. before_due_days / overdue_repeat_days of 0 switch that kind of reminder off */
const DEFAULT_REMINDER_SETTINGS = {
    enabled: false,
    before_due_days: 3,        // one reminder this many days before the due date
    overdue_repeat_days: 7,    // after the due date: repeat every this many days
    max_overdue_reminders: 3   // ... but not more often than this
};

const DAY_MS = 86400000;

/*
 * Payment reminders (PHP: Obo/PaymentReminder). A daily job mails the customers whose invoice is about to fall due
 * or is overdue. Every mail is written to ob_reminders, so the same reminder is never sent twice.
 */
class Reminder {

    getSettings(company) {
        return { ...DEFAULT_REMINDER_SETTINGS, ...(company.reminder_settings || {}) };
    }

    /* Mails the reminder with the PDF of the invoice and writes the log. kind: before | overdue | manual */
    async send(dbobj, company, transaction, contact, kind, custom_message) {
        if (!process.env.SMTP_HOST) {
            throw new BusinessError('Email is not set up. Add the SMTP settings to the server .env', 'EMAIL_NOT_SET_UP');
        }
        if (!contact || !contact.email) {
            throw new BusinessError('The customer has no email address', 'NO_EMAIL');
        }
        let pending_amount = UTILS.round2(transaction.tot_amount - (transaction.rec_amt || 0));
        let log_entry = {
            reminder_id: await UTILS.getNextId(dbobj, 'ob_reminders'),
            c_id: company.c_id, trans_id: transaction.trans_id, trans_no: transaction.trans_no, kind: kind,
            sent_to: contact.email, pending_amount: pending_amount, sent_on: new Date()
        };
        try {
            let loaded = await INVOICE_PDF.load(dbobj, company.c_id, transaction.trans_id);
            let pdf_buffer = await INVOICE_PDF.build(loaded.transaction, loaded.company, loaded.contact, {});
            let mail = EMAIL.reminderMail(company.name, transaction, kind, pending_amount, custom_message);
            await EMAIL.sendMail(contact.email, mail.subject, mail.html, [
                { filename: INVOICE_PDF.getFileName(transaction), content: pdf_buffer, contentType: 'application/pdf' }
            ]);
            log_entry.status = 'sent';
        } catch (error) {
            log_entry.status = 'failed';
            log_entry.error = error.message;
            await dbobj.collection('ob_reminders').insertOne(log_entry);
            throw error;
        }
        await dbobj.collection('ob_reminders').insertOne(log_entry);
        return log_entry;
    }

    /* Which reminder (if any) is due today for an invoice. sent_logs are the reminders already sent for it */
    getDueKind(settings, transaction, sent_logs, today) {
        let days_to_due = Math.round((new Date(transaction.due_date).getTime() - today.getTime()) / DAY_MS);

        if (days_to_due >= 0) {
            // "within the last N days before the due date", so a day the server was off does not skip the reminder
            let is_sent = sent_logs.some(log => log.kind === 'before');
            return settings.before_due_days > 0 && days_to_due <= settings.before_due_days && !is_sent ? 'before' : '';
        }

        if (settings.overdue_repeat_days <= 0) {
            return '';
        }
        let overdue_logs = sent_logs.filter(log => log.kind === 'overdue').sort((a, b) => b.sent_on - a.sent_on);
        if (overdue_logs.length >= settings.max_overdue_reminders) {
            return '';
        }
        if (overdue_logs.length === 0) {
            return 'overdue';
        }
        let days_since_last = Math.floor((today.getTime() - UTILS.toDate(overdue_logs[0].sent_on).getTime()) / DAY_MS);
        return days_since_last >= settings.overdue_repeat_days ? 'overdue' : '';
    }

    /* One company. Returns { checked, sent, failed, no_email } */
    async runForCompany(dbobj, company, today) {
        let settings = this.getSettings(company);
        let summary = { checked: 0, sent: 0, failed: 0, no_email: 0 };

        let invoices = await dbobj.collection('ob_transactions').find({
            c_id: company.c_id, stat: CONFIG.STAT_ACTIVE, trans_type: { $in: REMINDER_TYPES }, con_id: { $gt: 0 },
            due_date: { $ne: null }, $expr: { $lt: ['$rec_amt', '$tot_amount'] }
        }).toArray();
        if (invoices.length === 0) {
            return summary;
        }

        let contacts = await dbobj.collection('ob_contacts').find(
            { c_id: company.c_id, con_id: { $in: invoices.map(invoice => invoice.con_id) } }).toArray();
        let contact_map = {};
        contacts.forEach(contact => { contact_map[contact.con_id] = contact; });
        let logs = await dbobj.collection('ob_reminders').find(
            { c_id: company.c_id, status: 'sent', trans_id: { $in: invoices.map(invoice => invoice.trans_id) } }).toArray();

        for (const invoice of invoices) {
            let contact = contact_map[invoice.con_id];
            if (!contact || contact.reminders_off) {
                continue;
            }
            let sent_logs = logs.filter(log => log.trans_id === invoice.trans_id);
            let kind = this.getDueKind(settings, invoice, sent_logs, today);
            if (!kind) {
                continue;
            }
            summary.checked++;
            if (!contact.email) {
                summary.no_email++;
                continue;
            }
            try {
                await this.send(dbobj, company, invoice, contact, kind);
                summary.sent++;
            } catch (error) {
                // logged in ob_reminders as failed; it is tried again at the next run
                console.error('Payment reminder failed', { c_id: company.c_id, trans_id: invoice.trans_id, reason: error.message });
                summary.failed++;
            }
        }
        return summary;
    }

    /* Every company that switched reminders on. Used by the daily job */
    async runAll(dbobj) {
        if (!process.env.SMTP_HOST) {
            return { skipped: 'Email is not set up' };
        }
        let today = UTILS.toDate(new Date());
        let companies = await dbobj.collection('ob_companies').find(
            { stat: CONFIG.STAT_ACTIVE, 'reminder_settings.enabled': true }).toArray();
        let total = { companies: companies.length, checked: 0, sent: 0, failed: 0, no_email: 0 };
        for (const company of companies) {
            let summary = await this.runForCompany(dbobj, company, today);
            Object.keys(summary).forEach(key => { total[key] += summary[key]; });
        }
        return total;
    }
}

module.exports = new Reminder();
module.exports.REMINDER_TYPES = REMINDER_TYPES;
module.exports.DEFAULT_REMINDER_SETTINGS = DEFAULT_REMINDER_SETTINGS;
