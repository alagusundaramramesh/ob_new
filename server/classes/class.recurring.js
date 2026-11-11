const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const TRANSACTION = require('./class.transaction');
const INVOICE_PDF = require('./class.invoice_pdf');
const EMAIL = require('../utils/util.email_templates');
const { BusinessError } = require('../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* Documents that can repeat: the sales invoice and the purchase bill */
const RECURRING_TYPES = [TT.SALES_INVOICE, TT.PURCHASE_INVOICE];
const FREQUENCIES = { W: 'Weekly', M: 'Monthly', Q: 'Quarterly', Y: 'Yearly' };

// A profile that is behind (server was off) creates the missed documents, but never more than this in one run
const MAX_CATCH_UP_RUNS = 12;

/*
 * Recurring invoices (PHP: Obo/RecurringTransaction). A profile points to a "template" document.
 * On each due date a new document is created from the items of the template, and the next date moves ahead.
 */
class Recurring {

    isValidFrequency(frequency) {
        return Object.keys(FREQUENCIES).includes(frequency);
    }

    /* The date after `date` for the frequency. A month end is kept (31 Jan + 1 month = 28 Feb) */
    getNextDate(date, frequency) {
        let next = new Date(date);
        if (frequency === 'W') {
            next.setUTCDate(next.getUTCDate() + 7);
            return next;
        }
        let months = frequency === 'M' ? 1 : frequency === 'Q' ? 3 : 12;
        let day = next.getUTCDate();
        next.setUTCDate(1);
        next.setUTCMonth(next.getUTCMonth() + months);
        let last_day = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(day, last_day));
        return next;
    }

    /* Creates the document of one due date. Returns the saved transaction */
    async createDocument(dbobj, company, profile, source_trans, run_date) {
        let input = TRANSACTION.copyInput(source_trans, source_trans.trans_type, run_date);
        // A repeated document is not "converted from" the template, so the link and the reference are the profile name
        input.ref_id = 0;
        input.ref_trans_type = '';
        input.ref = profile.name;
        // the due date keeps the same distance from the document date as the template
        if (source_trans.due_date) {
            let credit_ms = new Date(source_trans.due_date).getTime() - new Date(source_trans.trans_date).getTime();
            input.due_date = new Date(run_date.getTime() + credit_ms);
        }
        return TRANSACTION.save(dbobj, company, input, 'recurring');
    }

    async emailDocument(dbobj, company, saved_trans) {
        let { transaction, contact } = await INVOICE_PDF.load(dbobj, company.c_id, saved_trans.trans_id);
        if (!contact || !contact.email) {
            throw new BusinessError('The contact has no email address');
        }
        let pdf_buffer = await INVOICE_PDF.build(transaction, company, contact, {});
        let mail = EMAIL.documentMail(company.name, transaction, '');
        let is_sent = await EMAIL.sendMail(contact.email, mail.subject, mail.html, [
            { filename: INVOICE_PDF.getFileName(transaction), content: pdf_buffer, contentType: 'application/pdf' }
        ]);
        if (!is_sent) {
            throw new BusinessError('Email is not set up');
        }
        await dbobj.collection('ob_transactions').updateOne(
            { c_id: company.c_id, trans_id: saved_trans.trans_id }, { $set: { last_emailed_to: contact.email, last_emailed_on: new Date() } });
    }

    /* Runs one profile until it is up to date. Returns how many documents were created */
    async runProfile(dbobj, profile, today) {
        let created_count = 0;
        let profile_changes = { last_error: '' };
        let company = await UTILS.getCompany(dbobj, profile.c_id);
        let source_trans = await dbobj.collection('ob_transactions').findOne(
            { c_id: profile.c_id, trans_id: profile.source_trans_id, stat: CONFIG.STAT_ACTIVE });

        if (!company || !source_trans) {
            // The template is gone: the profile stops instead of failing every day
            await dbobj.collection('ob_recurring').updateOne(
                { recurring_id: profile.recurring_id },
                { $set: { is_active: false, last_error: 'The template document was deleted. The profile was stopped' } });
            return 0;
        }

        let next_date = new Date(profile.next_date);
        let run_count = profile.run_count || 0;
        while (next_date <= today && created_count < MAX_CATCH_UP_RUNS) {
            if (profile.end_date && next_date > new Date(profile.end_date)) {
                profile_changes.is_active = false;
                break;
            }
            try {
                let saved_trans = await this.createDocument(dbobj, company, profile, source_trans, next_date);
                created_count++;
                run_count++;
                profile_changes.last_trans_id = saved_trans.trans_id;
                profile_changes.last_run_on = new Date();
                if (profile.auto_email) {
                    try {
                        await this.emailDocument(dbobj, company, saved_trans);
                    } catch (mail_error) {
                        // the document exists; only the mail failed, so the profile goes on
                        profile_changes.last_error = `${saved_trans.trans_no} created, email failed: ${mail_error.message}`;
                    }
                }
            } catch (error) {
                // locked books, stock, inactive contact ... the date does not move, it is tried again at the next run
                console.error('Recurring document failed', { recurring_id: profile.recurring_id, reason: error.message });
                profile_changes.last_error = error.message;
                break;
            }
            next_date = this.getNextDate(next_date, profile.frequency);
        }

        if (profile.end_date && next_date > new Date(profile.end_date)) {
            profile_changes.is_active = false;
        }
        profile_changes.next_date = next_date;
        profile_changes.run_count = run_count;
        await dbobj.collection('ob_recurring').updateOne({ recurring_id: profile.recurring_id }, { $set: profile_changes });
        return created_count;
    }

    /* All active profiles that are due (every company). Used by the daily cron job */
    async runDueProfiles(dbobj) {
        let today = UTILS.toDate(new Date());
        let due_profiles = await dbobj.collection('ob_recurring').find(
            { stat: CONFIG.STAT_ACTIVE, is_active: true, next_date: { $lte: today } }).toArray();
        let summary = { profiles: due_profiles.length, created: 0 };
        for (const profile of due_profiles) {
            summary.created += await this.runProfile(dbobj, profile, today);
        }
        return summary;
    }
}

module.exports = new Recurring();
module.exports.RECURRING_TYPES = RECURRING_TYPES;
module.exports.FREQUENCIES = FREQUENCIES;
