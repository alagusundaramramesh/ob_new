const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * Saves the opening balances of several accounts together: body.balances = [{ acc_id, opening_balance }] (debit positive, credit negative).
 * With body.balance_to_equity the "Opening Balance Equity" account takes the difference, so the opening trial balance is equal.
 */
router.post('/', async (req, res) => {
    const { c_id, balances, balance_to_equity } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!Array.isArray(balances) || balances.length === 0) {
            return res.send({ status: "E", message: "Send the balances to save" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        if (company.locked_till) {
            return res.send({ status: "E", message: "The books are locked. Remove the lock date in Settings > Company before changing opening balances" });
        }

        let new_balances = {};
        for (const entry of balances) {
            let opening_balance = Number(entry.opening_balance);
            if (!Number.isFinite(opening_balance)) {
                return res.send({ status: "E", message: "Every opening balance must be a number" });
            }
            new_balances[entry.acc_id] = UTILS.round2(opening_balance);
        }

        let accounts = await dbobj.collection('ob_accounts').find({ c_id: c_id, stat: "A" }, { projection: { _id: 0, acc_id: 1, acc_code: 1, opening_balance: 1 } }).toArray();
        let known_ids = new Set(accounts.map(account => account.acc_id));
        let unknown_id = Object.keys(new_balances).find(acc_id => !known_ids.has(Number(acc_id)));
        if (unknown_id) {
            return res.send({ status: "E", message: `Account ${unknown_id} not found` });
        }

        // The balance of every account after this save
        let final_balances = {};
        accounts.forEach(account => {
            final_balances[account.acc_id] = new_balances[account.acc_id] !== undefined ? new_balances[account.acc_id] : (account.opening_balance || 0);
        });
        let equity_account = accounts.find(account => account.acc_code === 'OPENING_EQUITY');
        if (balance_to_equity) {
            if (!equity_account) {
                return res.send({ status: "E", message: "The Opening Balance Equity account was not found" });
            }
            let others = accounts.filter(account => account.acc_id !== equity_account.acc_id).reduce((sum, account) => sum + final_balances[account.acc_id], 0);
            final_balances[equity_account.acc_id] = UTILS.round2(-others);
            new_balances[equity_account.acc_id] = final_balances[equity_account.acc_id];
        }

        for (const acc_id of Object.keys(new_balances)) {
            await dbobj.collection('ob_accounts').updateOne({ c_id: c_id, acc_id: Number(acc_id) }, { $set: { opening_balance: new_balances[acc_id], mdy_on: new Date() } });
        }
        let difference = UTILS.round2(Object.values(final_balances).reduce((sum, value) => sum + value, 0));
        return res.send({ status: "S", message: difference === 0 ? "Opening balances saved" : `Opening balances saved. Debit and credit differ by ${Math.abs(difference)}`, difference: difference });
    }
    catch (err) {
        return sendError(res, err, 'opening_balance_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
