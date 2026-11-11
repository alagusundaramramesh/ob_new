const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, trans_id, auth_email } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let result = await EINVOICE.generateEwb(dbobj, company, trans_id, req.body, auth_email);
        return res.send({
            status: "S", message: `E-way bill ${result.ewb.ewb_no} generated`, warnings: result.warnings,
            data: { ewb_no: result.ewb.ewb_no, ewb_dt: result.ewb.ewb_dt, valid_till: result.ewb.valid_till, via: result.ewb.via, provider: result.ewb.provider }
        });
    }
    catch (err) {
        return sendError(res, err, 'ewb_generate');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
