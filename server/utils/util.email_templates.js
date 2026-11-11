const nodemailer = require('nodemailer');
const CONFIG = require('../common/inc.config');

/* Text typed by users goes into the HTML mail, so it is escaped */
function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/* Mail is optional. When SMTP_HOST is empty the mail is only written to the console (local development).
   attachments: [{ filename, content, contentType }] (nodemailer format) */
async function sendMail(to, subject, html, attachments) {
    if (!process.env.SMTP_HOST) {
        console.log(`[mail skipped - SMTP not configured] to=${to} subject=${subject}`);
        return false;
    }
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html, attachments: attachments || [] });
    return true;
}

module.exports = {
    sendMail,
    escapeHtml,

    welcomeMail(name) {
        return {
            subject: CONFIG.EMAIL_SUBJECTS.WELCOME,
            html: `<p>Hi ${escapeHtml(name)},</p><p>Your OutputBooks account is ready. You can now log in and set up your company.</p>`
        };
    },

    resetPasswordMail(name, reset_link) {
        return {
            subject: CONFIG.EMAIL_SUBJECTS.RESET_PASSWORD,
            html: `<p>Hi ${escapeHtml(name)},</p><p>Click <a href="${escapeHtml(reset_link)}">here</a> to reset your password. The link is valid for one hour.</p>`
        };
    },

    /* Payment reminder. kind: before (due soon), overdue, manual */
    reminderMail(company_name, transaction, kind, pending_amount, message) {
        let due_text = transaction.due_date ? new Date(transaction.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
        let subject = kind === 'before' ? `Reminder: ${transaction.trans_no} is due on ${due_text}`
            : kind === 'overdue' ? `Overdue: ${transaction.trans_no} was due on ${due_text}`
            : `Payment reminder: ${transaction.trans_no}`;
        let intro = kind === 'before' ? 'This is a friendly reminder that the invoice below will fall due soon.'
            : kind === 'overdue' ? 'Our records show that the invoice below is overdue.'
            : 'This is a reminder about the invoice below.';
        let note = message ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : '';
        return {
            subject: subject,
            html: `<p>Hello,</p><p>${intro}</p>${note}<p>Invoice: <strong>${escapeHtml(transaction.trans_no)}</strong><br>${due_text ? `Due date: ${due_text}<br>` : ''}Amount pending: <strong>Rs. ${Number(pending_amount).toFixed(2)}</strong></p><p>The invoice is attached. Please ignore this mail if the payment has already been made.</p><p>Regards,<br>${escapeHtml(company_name)}</p>`
        };
    },

    /* Mail that carries the PDF of an invoice, bill ... */
    documentMail(company_name, transaction, message) {
        let note = message ? `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : '';
        return {
            subject: `${transaction.trans_no} from ${company_name}`,
            html: `<p>Hello,</p>${note}<p>Please find <strong>${escapeHtml(transaction.trans_no)}</strong> attached (total Rs. ${Number(transaction.tot_amount).toFixed(2)}).</p><p>Regards,<br>${escapeHtml(company_name)}</p>`
        };
    }
};
