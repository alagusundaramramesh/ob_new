const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Ledger of one account (or of a customer / supplier when con_id is sent) with a running balance */
router.post('/', async (req, res) => {
    const { c_id, con_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let acc_id = req.body.acc_id;
        if (con_id) {
            let contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: con_id });
            acc_id = contact ? contact.con_acc_id : 0;
        }
        let account = await dbobj.collection('ob_accounts').findOne({ c_id: c_id, acc_id: acc_id, stat: "A" }, { projection: { _id: 0 } });
        if (!account) {
            return res.send({ status: "E", message: "Account not found" });
        }

        // opening balance = opening entered in the account + everything before the from date
        let before_totals = await REPORT.getLedgerTotals(dbobj, c_id, { acc_ids: [acc_id], to: new Date(from.getTime() - 1) });
        let before = before_totals[acc_id] || { debit: 0, credit: 0 };
        let opening_balance = UTILS.round2((account.opening_balance || 0) + before.debit - before.credit);

        let entries = await dbobj.collection('ob_trans_acc').find(
            { c_id: c_id, acc_id: acc_id, trans_date: { $gte: from, $lte: to } }, { projection: { _id: 0 } }
        ).sort({ trans_date: 1, trans_id: 1 }).toArray();

        let running_balance = opening_balance;
        let ledger_rows = entries.map(entry => {
            running_balance = UTILS.round2(running_balance + entry.debit - entry.credit);
            return { ...entry, balance: running_balance };
        });
        let total_debit = UTILS.round2(entries.reduce((sum, entry) => sum + entry.debit, 0));
        let total_credit = UTILS.round2(entries.reduce((sum, entry) => sum + entry.credit, 0));

        return res.send({
            status: "S",
            data: {
                account: account, from_date: from, to_date: to, opening_balance: opening_balance,
                rows: ledger_rows, total_debit: total_debit, total_credit: total_credit, closing_balance: running_balance
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_ledger');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
