const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, trans_id, reason, remark, auth_email } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        await EINVOICE.cancelEwb(dbobj, company, trans_id, reason, remark, auth_email);
        return res.send({ status: "S", message: "E-way bill cancelled" });
    }
    catch (err) {
        return sendError(res, err, 'ewb_cancel');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
