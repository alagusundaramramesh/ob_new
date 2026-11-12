const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Every ledger account with its opening balance (debit positive, credit negative) and the difference the trial balance would show */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0, acc_id: 1, name: 1, group_code: 1, acc_code: 1, opening_balance: 1 } }).sort({ group_code: 1, name: 1 }).toArray();

        let rows = accounts.map(account => ({
            acc_id: account.acc_id, name: account.name, group_code: account.group_code,
            is_equity_account: account.acc_code === 'OPENING_EQUITY', opening_balance: account.opening_balance || 0
        }));
        let total_debit = UTILS.round2(rows.filter(row => row.opening_balance > 0).reduce((sum, row) => sum + row.opening_balance, 0));
        let total_credit = UTILS.round2(-rows.filter(row => row.opening_balance < 0).reduce((sum, row) => sum + row.opening_balance, 0));
        return res.send({ status: "S", data: { rows: rows, total_debit: total_debit, total_credit: total_credit, difference: UTILS.round2(total_debit - total_credit) } });
    }
    catch (err) {
        return sendError(res, err, 'opening_balance_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
