const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * Profit & Loss with the trading part (gross profit). Income and expense accounts are taken from their
 * movement in the period. Opening / closing stock use the simple stock valuation of class.report.js
 */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let trial_balance_rows = await REPORT.getTrialBalanceRows(dbobj, c_id, from, to);
        let group_map = REPORT.getGroupMap();

        // Income accounts have credit balances, expense accounts debit balances
        let build_rows = (acc_type, rpt_type) => trial_balance_rows
            .filter(row => row.acc_type === acc_type && group_map[row.group_code].rpt_type === rpt_type)
            .map(row => ({
                acc_id: row.acc_id, name: row.name, group_name: row.group_name,
                amount: UTILS.round2(acc_type === 'I' ? row.credit - row.debit : row.debit - row.credit)
            }))
            .filter(row => row.amount);

        let direct_income = build_rows('I', 'T');
        let direct_expense = build_rows('E', 'T');
        let indirect_income = build_rows('I', 'P');
        let indirect_expense = build_rows('E', 'L');

        let opening_stock = await REPORT.getStockValue(dbobj, c_id, new Date(from.getTime() - 1));
        let closing_stock = await REPORT.getStockValue(dbobj, c_id, to);
        let sum_of = rows => UTILS.round2(rows.reduce((sum, row) => sum + row.amount, 0));

        let gross_profit = UTILS.round2(sum_of(direct_income) + closing_stock - sum_of(direct_expense) - opening_stock);
        let net_profit = UTILS.round2(gross_profit + sum_of(indirect_income) - sum_of(indirect_expense));

        return res.send({
            status: "S",
            data: {
                from_date: from, to_date: to,
                opening_stock: opening_stock, closing_stock: closing_stock,
                direct_income: direct_income, direct_expense: direct_expense,
                indirect_income: indirect_income, indirect_expense: indirect_expense,
                gross_profit: gross_profit, net_profit: net_profit
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_profit_loss');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
