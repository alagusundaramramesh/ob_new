const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, acc_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let account = await dbobj.collection('ob_accounts').findOne({ c_id: c_id, acc_id: acc_id, stat: "A" });
        if (!account) {
            return res.send({ status: "E", message: "Account not found" });
        }
        if (account.is_system) {
            return res.send({ status: "E", message: "System accounts can not be deleted" });
        }
        let has_entries = await dbobj.collection('ob_trans_acc').findOne({ c_id: c_id, acc_id: acc_id });
        if (has_entries) {
            return res.send({ status: "E", message: "This account has transactions. Mark it inactive instead" });
        }
        let used_by_bank = await dbobj.collection('ob_banks').findOne({ c_id: c_id, acc_id: acc_id, stat: "A" });
        if (used_by_bank) {
            return res.send({ status: "E", message: "This account is used by a bank. Delete the bank first" });
        }
        await dbobj.collection('ob_accounts').updateOne({ c_id: c_id, acc_id: acc_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Account deleted" });
    }
    catch (err) {
        return sendError(res, err, 'account_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
