const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let trial_balance_rows = await REPORT.getTrialBalanceRows(dbobj, c_id, from, to);
        // Only accounts which have a balance or a movement
        let rows = trial_balance_rows
            .filter(row => row.opening || row.debit || row.credit || row.closing)
            .map(row => ({
                ...row,
                closing_debit: row.closing > 0 ? row.closing : 0,
                closing_credit: row.closing < 0 ? -row.closing : 0
            }));
        // Every transaction is balanced, so a difference can only come from the opening balances entered by the user.
        // It is shown as one line (same as "Difference in opening balance" of the PHP version)
        let opening_difference = UTILS.round2(rows.reduce((sum, row) => sum + row.closing, 0));
        if (opening_difference) {
            rows.push({
                acc_id: 0, name: 'Difference in opening balance', group_code: '', group_name: '', acc_type: '',
                opening: 0, debit: 0, credit: 0, closing: -opening_difference,
                closing_debit: opening_difference < 0 ? -opening_difference : 0,
                closing_credit: opening_difference > 0 ? opening_difference : 0
            });
        }
        let total_debit = UTILS.round2(rows.reduce((sum, row) => sum + row.closing_debit, 0));
        let total_credit = UTILS.round2(rows.reduce((sum, row) => sum + row.closing_credit, 0));

        return res.send({
            status: "S",
            data: {
                from_date: from, to_date: to, rows: rows, total_debit: total_debit, total_credit: total_credit,
                opening_difference: opening_difference, is_balanced: total_debit === total_credit
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_trial_balance');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
