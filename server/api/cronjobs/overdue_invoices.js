const express = require('express');
const router = express.Router();
const CONFIG = require('../../common/inc.config');
const UTILS = require('../../utils/util.functions');

const TT = CONFIG.TRANS_TYPES;

/* Marks open invoices whose due date has passed as overdue (status O) */
async function run(dbobj) {
    let today = UTILS.toDate(new Date());
    let update_result = await dbobj.collection('ob_transactions').updateMany(
        {
            stat: CONFIG.STAT_ACTIVE,
            status: CONFIG.TRANS_STATUS.SENT,
            trans_type: { $in: [TT.SALES_INVOICE, TT.SALES_DEBIT_NOTE, TT.PURCHASE_INVOICE] },
            due_date: { $lt: today },
            $expr: { $lt: ['$rec_amt', '$tot_amount'] }
        },
        { $set: { status: CONFIG.TRANS_STATUS.OVERDUE } }
    );
    return { marked_overdue: update_result.modifiedCount };
}

/* MAIN SCRIPT STARTS */
/* Manual run: POST /overdue_invoices with the x-api-key header (see app_router) */
router.post('/', async (req, res) => {
    let dbobj = res.locals.dbobj;
    try {
        let summary = await run(dbobj);
        return res.send({ status: "S", ...summary });
    }
    catch (err) {
        console.error('overdue_invoices failed', err);
        return res.send({ status: "E", message: "Unable to process request" });
    }
})
router.run = run;
module.exports = router;
/* MAIN SCRIPT ENDS */
