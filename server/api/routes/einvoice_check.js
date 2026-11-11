const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* What is wrong with the document for the IRP, and the JSON that would be sent */
router.post('/', async (req, res) => {
    const { c_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let check = await EINVOICE.check(dbobj, company, trans_id);
        return res.send({ status: "S", data: { errors: check.errors, payload: check.payload } });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_check');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
