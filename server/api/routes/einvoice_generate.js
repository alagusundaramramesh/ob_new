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
        let einvoice = await EINVOICE.generate(dbobj, company, trans_id, auth_email);
        return res.send({ status: "S", message: `IRN generated: ${einvoice.irn}`, data: { irn: einvoice.irn, ack_no: einvoice.ack_no, ack_dt: einvoice.ack_dt, provider: einvoice.provider } });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_generate');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
