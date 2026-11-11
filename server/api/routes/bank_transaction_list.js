const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * Bank statement lines of a bank (PHP: ob_banktrans). They are compared with the bank ledger for reconciliation.
 * Returns the statement lines together with the ledger entries of the bank account that are not yet matched.
 */
router.post('/', async (req, res) => {
    const { c_id, bank_id } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let bank = await dbobj.collection('ob_banks').findOne({ c_id: c_id, bank_id: bank_id, stat: "A" });
        if (!bank) {
            return res.send({ status: "E", message: "Bank not found" });
        }
        let query_parameter = { c_id: c_id, bank_id: bank_id, stat: "A" };
        if (req.body.is_reconciled !== undefined) {
            query_parameter.is_reconciled = !!req.body.is_reconciled;
        }
        let total_count = await dbobj.collection('ob_bank_transactions').countDocuments(query_parameter);
        let statement_lines = await dbobj.collection('ob_bank_transactions').find(query_parameter, { projection: { _id: 0 } })
            .sort({ btr_date: -1, btr_id: -1 }).skip(skip).limit(limit).toArray();

        let matched_entry_ids = statement_lines.map(line => line.matched_trans_id).filter(trans_id => trans_id);
        let unmatched_ledger = await dbobj.collection('ob_trans_acc').find(
            { c_id: c_id, acc_id: bank.acc_id, trans_id: { $nin: matched_entry_ids } },
            { projection: { _id: 0 } }).sort({ trans_date: -1 }).limit(100).toArray();

        return res.send({ status: "S", data: statement_lines, unmatched_ledger: unmatched_ledger, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'bank_transaction_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
