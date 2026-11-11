const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Adds / changes a bank statement line. Set matched_trans_id to reconcile it with a ledger transaction */
router.post('/', async (req, res) => {
    const { c_id, bank_id, btr_id, btr_date, description, chq_no, debit, credit, matched_trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let statement_date = UTILS.toDate(btr_date);
        if (!statement_date) {
            return res.send({ status: "E", message: "Date is required" });
        }
        if (!Number(debit) && !Number(credit)) {
            return res.send({ status: "E", message: "Enter a debit or a credit amount" });
        }
        let bank = await dbobj.collection('ob_banks').findOne({ c_id: c_id, bank_id: bank_id, stat: "A" });
        if (!bank) {
            return res.send({ status: "E", message: "Bank not found" });
        }
        if (matched_trans_id) {
            let bank_entry = await dbobj.collection('ob_trans_acc').findOne(
                { c_id: c_id, acc_id: bank.acc_id, trans_id: matched_trans_id });
            if (!bank_entry) {
                return res.send({ status: "E", message: "The transaction is not in this bank account" });
            }
        }
        let line_fields = {
            btr_date: statement_date,
            description: description || '',
            chq_no: chq_no || '',
            debit: UTILS.round2(debit || 0),
            credit: UTILS.round2(credit || 0),
            matched_trans_id: matched_trans_id || 0,
            is_reconciled: !!matched_trans_id
        };

        if (!btr_id) {
            let new_btr_id = await UTILS.getNextId(dbobj, 'ob_bank_transactions');
            await dbobj.collection('ob_bank_transactions').insertOne({
                ...line_fields, btr_id: new_btr_id, c_id: c_id, bank_id: bank_id, stat: "A", crd_on: new Date()
            });
            return res.send({ status: "S", message: "Statement line added", btr_id: new_btr_id });
        }
        await dbobj.collection('ob_bank_transactions').updateOne({ c_id: c_id, bank_id: bank_id, btr_id: btr_id }, { $set: line_fields });
        return res.send({ status: "S", message: "Statement line updated", btr_id: btr_id });
    }
    catch (err) {
        return sendError(res, err, 'bank_transaction_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
