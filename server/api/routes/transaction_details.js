const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const PERMISSION = require('../../classes/class.permission');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Full transaction for the edit screen and the print view: items, taxes, ledger entries, linked documents */
router.post('/', async (req, res) => {
    const { c_id, auth_role_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, trans_id: trans_id, stat: "A" }, { projection: { _id: 0 } });
        if (!transaction) {
            return res.send({ status: "E", message: "Transaction not found" });
        }
        // the request does not carry trans_type, so the permission is checked on the real document
        let mod_code = PERMISSION.TRANS_TYPE_MODULES[transaction.trans_type];
        if (!await PERMISSION.can(dbobj, c_id, auth_role_id, mod_code)) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }

        let company = await UTILS.getCompany(dbobj, c_id);
        let ledger_entries = await dbobj.collection('ob_trans_acc').aggregate([
            { $match: { c_id: c_id, trans_id: trans_id } },
            { $lookup: { from: 'ob_accounts', localField: 'acc_id', foreignField: 'acc_id', as: 'account' } },
            { $project: { _id: 0, acc_id: 1, debit: 1, credit: 1, desc: 1, acc_name: { $arrayElemAt: ['$account.name', 0] } } }
        ]).toArray();
        let linked_transactions = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, ref_id: trans_id, stat: "A" },
            { projection: { _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, tot_amount: 1 } }).toArray();
        let reminders = await dbobj.collection('ob_reminders').find(
            { c_id: c_id, trans_id: trans_id }, { projection: { _id: 0 } }).sort({ sent_on: -1 }).limit(5).toArray();
        let contact = transaction.con_id
            ? await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: transaction.con_id }, { projection: { _id: 0, addresses: 1, email: 1, phone: 1 } })
            : null;

        return res.send({
            status: "S",
            data: { ...transaction, ledger_entries: ledger_entries, linked_transactions: linked_transactions, reminders: reminders, contact: contact, company: company }
        });
    }
    catch (err) {
        return sendError(res, err, 'transaction_details');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
