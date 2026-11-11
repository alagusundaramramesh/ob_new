const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const TRANSACTION = require('../../classes/class.transaction');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Cancels the IRN. With also_delete the document is deleted too (what the PHP version did) */
router.post('/', async (req, res) => {
    const { c_id, trans_id, reason, remark, also_delete, auth_email } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        await EINVOICE.cancel(dbobj, company, trans_id, reason, remark, auth_email);
        if (also_delete) {
            await TRANSACTION.remove(dbobj, company, trans_id);
            return res.send({ status: "S", message: "E-invoice cancelled and the document deleted" });
        }
        return res.send({ status: "S", message: "E-invoice cancelled" });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_cancel');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
