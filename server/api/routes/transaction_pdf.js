const express = require('express');
const router = express.Router();
const PERMISSION = require('../../classes/class.permission');
const INVOICE_PDF = require('../../classes/class.invoice_pdf');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Returns the PDF of a document (application/pdf). On a problem it answers the usual JSON { status: "E" } */
router.post('/', async (req, res) => {
    const { c_id, auth_role_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let { transaction, company, contact } = await INVOICE_PDF.load(dbobj, c_id, trans_id);
        if (!await PERMISSION.can(dbobj, c_id, auth_role_id, PERMISSION.TRANS_TYPE_MODULES[transaction.trans_type])) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }
        let accounts = await INVOICE_PDF.getAccountNames(dbobj, c_id, transaction);
        let pdf_buffer = await INVOICE_PDF.build(transaction, company, contact, accounts);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${INVOICE_PDF.getFileName(transaction)}"`,
            'Content-Length': pdf_buffer.length
        });
        return res.end(pdf_buffer);
    }
    catch (err) {
        return sendError(res, err, 'transaction_pdf');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
