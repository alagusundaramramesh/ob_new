const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* MAIN SCRIPT STARTS */
/* Quantity and value per item. side S (default) - item sales, side P - item purchases */
router.post('/', async (req, res) => {
    const { c_id, side } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);
        let is_sales = side !== 'P';
        let invoice_types = is_sales ? [TT.SALES_INVOICE, TT.SALES_RETAIL] : [TT.PURCHASE_INVOICE];
        let return_types = is_sales ? [TT.SALES_CREDIT_NOTE] : [TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE];

        let item_rows = await dbobj.collection('ob_transactions').aggregate([
            { $match: { c_id: c_id, stat: "A", trans_type: { $in: [...invoice_types, ...return_types] }, trans_date: { $gte: from, $lte: to } } },
            { $unwind: '$items' },
            { $addFields: { sign: { $cond: [{ $in: ['$trans_type', return_types] }, -1, 1] } } },
            {
                $group: {
                    _id: '$items.item_id',
                    item_name: { $first: '$items.item_name' },
                    qty: { $sum: { $multiply: ['$items.qty', '$sign'] } },
                    taxable_amount: { $sum: { $multiply: ['$items.taxable_amount', '$sign'] } },
                    item_total: { $sum: { $multiply: ['$items.item_total', '$sign'] } }
                }
            },
            { $project: { _id: 0, item_id: '$_id', item_name: 1, qty: 1, taxable_amount: 1, item_total: 1 } },
            { $sort: { taxable_amount: -1 } }
        ]).toArray();

        let rows = item_rows.map(row => ({
            ...row, taxable_amount: UTILS.round2(row.taxable_amount), item_total: UTILS.round2(row.item_total)
        }));
        return res.send({
            status: "S",
            data: { from_date: from, to_date: to, side: is_sales ? 'S' : 'P', rows: rows, taxable_amount: UTILS.round2(rows.reduce((sum, row) => sum + row.taxable_amount, 0)) }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_item_sales');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
