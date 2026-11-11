const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* MAIN SCRIPT STARTS */
/* Every purchase bill / supplier credit note / debit note of the period. Returns are shown as negative amounts */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let transactions = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, stat: "A", trans_date: { $gte: from, $lte: to }, trans_type: { $in: [TT.PURCHASE_INVOICE, TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE] } },
            { projection: { _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, trans_date: 1, con_name: 1, con_tax_no: 1, taxable_amount: 1, tot_tax: 1, tot_amount: 1 } }
        ).sort({ trans_date: 1, trans_id: 1 }).toArray();

        let rows = transactions.map(transaction => {
            let sign = transaction.trans_type === TT.PURCHASE_INVOICE ? 1 : -1;
            return {
                ...transaction,
                taxable_amount: transaction.taxable_amount * sign,
                tot_tax: transaction.tot_tax * sign,
                tot_amount: transaction.tot_amount * sign
            };
        });
        let sum_of = field => UTILS.round2(rows.reduce((sum, row) => sum + row[field], 0));

        return res.send({
            status: "S",
            data: { from_date: from, to_date: to, rows: rows, taxable_amount: sum_of('taxable_amount'), tot_tax: sum_of('tot_tax'), tot_amount: sum_of('tot_amount') }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_purchase_register');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
