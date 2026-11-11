const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const COMPANY_SETUP = require('../../classes/class.company_setup');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* A bank is a record with the bank details plus a ledger account in the "Bank Accounts" group */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!data.bank_name || !data.acc_name) {
            return res.send({ status: "E", message: "Bank name and account name are required" });
        }
        let bank_fields = {
            bank_name: data.bank_name,
            acc_name: data.acc_name,
            acc_number: data.acc_number || '',
            acc_type: data.acc_type || 'S', // S - savings, C - current, O - overdraft
            branch_name: data.branch_name || '',
            ifsc_code: (data.ifsc_code || '').toUpperCase(),
            upi_id: data.upi_id || '',
            mdy_on: new Date()
        };

        if (!data.bank_id) {
            let ledger_name = `${data.bank_name} - ${data.acc_number || data.acc_name}`;
            let acc_id = await COMPANY_SETUP.createAccount(dbobj, data.c_id, {
                name: ledger_name, group_code: data.acc_type === 'O' ? 'BO' : 'BA',
                opening_balance: UTILS.round2(data.opening_balance || 0), is_system: true
            });
            let bank_id = await UTILS.getNextId(dbobj, 'ob_banks');
            await dbobj.collection('ob_banks').insertOne({
                ...bank_fields, bank_id: bank_id, c_id: data.c_id, acc_id: acc_id, stat: "A", crd_on: new Date()
            });
            return res.send({ status: "S", message: "Bank added", bank_id: bank_id });
        }

        let bank = await dbobj.collection('ob_banks').findOne({ c_id: data.c_id, bank_id: data.bank_id, stat: "A" });
        if (!bank) {
            return res.send({ status: "E", message: "Bank not found" });
        }
        await dbobj.collection('ob_banks').updateOne({ c_id: data.c_id, bank_id: data.bank_id }, { $set: bank_fields });
        if (data.opening_balance !== undefined) {
            await dbobj.collection('ob_accounts').updateOne(
                { c_id: data.c_id, acc_id: bank.acc_id }, { $set: { opening_balance: UTILS.round2(data.opening_balance) } });
        }
        return res.send({ status: "S", message: "Bank updated", bank_id: data.bank_id });
    }
    catch (err) {
        return sendError(res, err, 'bank_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
