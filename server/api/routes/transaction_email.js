const express = require('express');
const router = express.Router();
const PERMISSION = require('../../classes/class.permission');
const INVOICE_PDF = require('../../classes/class.invoice_pdf');
const EMAIL = require('../../utils/util.email_templates');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Mails the PDF of a document. "to" defaults to the email of the customer / supplier */
router.post('/', async (req, res) => {
    const { c_id, auth_role_id, trans_id, to, message } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!process.env.SMTP_HOST) {
            return res.send({ status: "E", message: "Email is not set up. Add the SMTP settings to the server .env" });
        }
        let { transaction, company, contact } = await INVOICE_PDF.load(dbobj, c_id, trans_id);
        if (!await PERMISSION.can(dbobj, c_id, auth_role_id, PERMISSION.TRANS_TYPE_MODULES[transaction.trans_type])) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }

        let recipient = (to || (contact && contact.email) || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            return res.send({ status: "E", message: "Enter a valid email address" });
        }

        let accounts = await INVOICE_PDF.getAccountNames(dbobj, c_id, transaction);
        let pdf_buffer = await INVOICE_PDF.build(transaction, company, contact, accounts);
        let mail = EMAIL.documentMail(company.name, transaction, message);
        await EMAIL.sendMail(recipient, mail.subject, mail.html, [
            { filename: INVOICE_PDF.getFileName(transaction), content: pdf_buffer, contentType: 'application/pdf' }
        ]);

        await dbobj.collection('ob_transactions').updateOne(
            { c_id: c_id, trans_id: trans_id }, { $set: { last_emailed_to: recipient, last_emailed_on: new Date() } });
        return res.send({ status: "S", message: `Sent to ${recipient}` });
    }
    catch (err) {
        return sendError(res, err, 'transaction_email');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
