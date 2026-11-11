const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const GST_RETURN = require('../../classes/class.gst_return');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* GSTR-3B of a month (body.month = "2026-11"): the JSON for the GST portal, a summary and warnings */
router.post('/', async (req, res) => {
    const { c_id, month } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let gstr3b = await GST_RETURN.buildGstr3b(dbobj, company, month);
        return res.send({ status: "S", data: gstr3b });
    }
    catch (err) {
        return sendError(res, err, 'report_gstr3b');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
