const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange({}, company); // current financial year
        let today = UTILS.toDate(new Date());

        let sales = await REPORT.getTransactionTotals(dbobj, c_id, [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE], from, to);
        let purchases = await REPORT.getTransactionTotals(dbobj, c_id, [TT.PURCHASE_INVOICE], from, to);

        // Receivables and payables: pending amount of the billed documents
        let get_pending = async (trans_types) => {
            let pending = await dbobj.collection('ob_transactions').aggregate([
                { $match: { c_id: c_id, stat: "A", trans_type: { $in: trans_types }, $expr: { $lt: ['$rec_amt', '$tot_amount'] } } },
                {
                    $group: {
                        _id: null,
                        pending: { $sum: { $subtract: ['$tot_amount', '$rec_amt'] } },
                        overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$due_date', null] }, { $lt: ['$due_date', today] }] }, { $subtract: ['$tot_amount', '$rec_amt'] }, 0] } }
                    }
                }
            ]).toArray();
            return pending.length ? { pending: UTILS.round2(pending[0].pending), overdue: UTILS.round2(pending[0].overdue) } : { pending: 0, overdue: 0 };
        };
        let receivables = await get_pending([TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE]);
        let payables = await get_pending([TT.PURCHASE_INVOICE]);

        // Cash and bank balance
        let cash_bank_accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, stat: "A", group_code: { $in: ['BA', 'CH'] } }, { projection: { acc_id: 1 } }).toArray();
        let balance_map = await REPORT.getAccountBalances(dbobj, c_id, cash_bank_accounts.map(account => account.acc_id));
        let cash_bank_balance = UTILS.round2(Object.values(balance_map).reduce((sum, balance) => sum + balance, 0));

        // Sales per month of the financial year
        let monthly_sales = await dbobj.collection('ob_transactions').aggregate([
            { $match: { c_id: c_id, stat: "A", trans_type: { $in: [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE] }, trans_date: { $gte: from, $lte: to } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$trans_date' } }, amount: { $sum: '$taxable_amount' } } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, month: '$_id', amount: 1 } }
        ]).toArray();

        let low_stock_items = await dbobj.collection('ob_items').find(
            { c_id: c_id, stat: "A", is_inventory: true, $expr: { $lte: ['$cur_stk', '$stk_level'] } },
            { projection: { _id: 0, item_id: 1, name: 1, cur_stk: 1, stk_level: 1 } }).limit(10).toArray();

        let recent_transactions = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, stat: "A" },
            { projection: { _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, trans_date: 1, con_name: 1, tot_amount: 1, status: 1 } }
        ).sort({ trans_id: -1 }).limit(8).toArray();

        return res.send({
            status: "S",
            data: {
                financial_year: { from_date: from, to_date: to },
                sales: sales, purchases: purchases, receivables: receivables, payables: payables,
                cash_bank_balance: cash_bank_balance, monthly_sales: monthly_sales,
                low_stock_items: low_stock_items, recent_transactions: recent_transactions
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'dashboard');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
