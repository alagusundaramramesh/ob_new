const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Every transaction of the period in date order */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let transactions = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, stat: "A", trans_date: { $gte: from, $lte: to } },
            { projection: { _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, trans_date: 1, con_name: 1, tot_amount: 1, status: 1 } }
        ).sort({ trans_date: 1, trans_id: 1 }).toArray();

        return res.send({ status: "S", data: { from_date: from, to_date: to, rows: transactions } });
    }
    catch (err) {
        return sendError(res, err, 'report_daybook');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
