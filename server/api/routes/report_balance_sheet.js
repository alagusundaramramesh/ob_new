const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * Balance sheet as on a date. The profit of all years up to that date is shown as one line on the liabilities side,
 * and the closing stock on the assets side, so both sides always match.
 */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let as_on_date = UTILS.toDate(req.body.as_on_date) || UTILS.toDate(new Date());

        // from = null: balances since the beginning
        let trial_balance_rows = await REPORT.getTrialBalanceRows(dbobj, c_id, null, as_on_date);

        let assets = trial_balance_rows.filter(row => row.acc_type === 'A' && row.closing);
        let liabilities = trial_balance_rows.filter(row => row.acc_type === 'L' && row.closing);
        let income_expense = trial_balance_rows.filter(row => (row.acc_type === 'I' || row.acc_type === 'E'));

        let asset_rows = assets.map(row => ({ acc_id: row.acc_id, name: row.name, group_name: row.group_name, amount: row.closing }));
        let liability_rows = liabilities.map(row => ({ acc_id: row.acc_id, name: row.name, group_name: row.group_name, amount: UTILS.round2(-row.closing) }));

        let closing_stock = await REPORT.getStockValue(dbobj, c_id, as_on_date);
        if (closing_stock) {
            asset_rows.push({ acc_id: 0, name: 'Closing Stock', group_name: 'Stock-in-hand', amount: closing_stock });
        }
        // income has credit balance (negative closing), expense debit balance
        let accumulated_profit = UTILS.round2(closing_stock - income_expense.reduce((sum, row) => sum + row.closing, 0));
        liability_rows.push({ acc_id: 0, name: 'Profit & Loss (accumulated)', group_name: 'Capital', amount: accumulated_profit });

        let total_assets = UTILS.round2(asset_rows.reduce((sum, row) => sum + row.amount, 0));
        let total_liabilities = UTILS.round2(liability_rows.reduce((sum, row) => sum + row.amount, 0));

        // Opening balances entered by the user may not balance. Same as "Difference in opening balance" of the PHP version
        let opening_difference = UTILS.round2(total_assets - total_liabilities);
        if (opening_difference) {
            liability_rows.push({ acc_id: 0, name: 'Difference in opening balance', group_name: '', amount: opening_difference });
            total_liabilities = total_assets;
        }

        return res.send({
            status: "S",
            data: { as_on_date: as_on_date, assets: asset_rows, liabilities: liability_rows, total_assets: total_assets, total_liabilities: total_liabilities }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_balance_sheet');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
