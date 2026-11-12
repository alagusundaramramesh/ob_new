const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const GST_ANNUAL = require('../../classes/class.gst_annual');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Annual figures of a financial year (body.year = the year it starts, for example 2026 for 2026-27) */
router.post('/', async (req, res) => {
    const { c_id, year } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let annual_report = await GST_ANNUAL.buildGstr9(dbobj, company, year);
        return res.send({ status: "S", data: annual_report });
    }
    catch (err) {
        return sendError(res, err, 'report_gstr9');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
