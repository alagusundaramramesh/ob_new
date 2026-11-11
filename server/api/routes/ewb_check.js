const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Checks the transport details and the document for an e-way bill, nothing is sent */
router.post('/', async (req, res) => {
    const { c_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let check = await EINVOICE.checkEwb(dbobj, company, trans_id, req.body);
        return res.send({ status: "S", data: { errors: check.errors, warnings: check.warnings, via: check.has_irn ? 'irn' : 'direct' } });
    }
    catch (err) {
        return sendError(res, err, 'ewb_check');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
