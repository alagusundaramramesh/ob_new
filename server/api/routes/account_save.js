const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const SYS_DATA = require('../../common/sys_data');
const COMPANY_SETUP = require('../../classes/class.company_setup');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, acc_id, name, group_code, descr, opening_balance } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name || !group_code) {
            return res.send({ status: "E", message: "Account name and group are required" });
        }
        let is_valid_group = SYS_DATA.ACCOUNT_GROUPS.some(group => group[0] === group_code);
        if (!is_valid_group) {
            return res.send({ status: "E", message: "Invalid account group" });
        }
        // Customer and supplier accounts are created from the contact screen
        if (group_code === 'SD' || group_code === 'SC') {
            return res.send({ status: "E", message: "Create customers and suppliers from the Contacts screen" });
        }
        let duplicate_account = await dbobj.collection('ob_accounts').findOne(
            { c_id: c_id, name: name, stat: "A", acc_id: { $ne: acc_id || 0 } });
        if (duplicate_account) {
            return res.send({ status: "E", message: "An account with this name already exists" });
        }

        if (!acc_id) {
            let new_acc_id = await COMPANY_SETUP.createAccount(dbobj, c_id, {
                name: name, group_code: group_code, descr: descr, opening_balance: Number(opening_balance) || 0
            });
            return res.send({ status: "S", message: "Account added", acc_id: new_acc_id });
        }

        let account = await dbobj.collection('ob_accounts').findOne({ c_id: c_id, acc_id: acc_id, stat: "A" });
        if (!account) {
            return res.send({ status: "E", message: "Account not found" });
        }
        let account_changes = { name: name, descr: descr || '', opening_balance: UTILS.round2(opening_balance || 0) };
        // System accounts keep their group because the transaction engine depends on it
        if (!account.is_system) {
            account_changes.group_code = group_code;
        }
        await dbobj.collection('ob_accounts').updateOne({ c_id: c_id, acc_id: acc_id }, { $set: account_changes });
        return res.send({ status: "S", message: "Account updated" });
    }
    catch (err) {
        return sendError(res, err, 'account_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
