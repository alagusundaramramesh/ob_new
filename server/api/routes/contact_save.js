const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const COMPANY_SETUP = require('../../classes/class.company_setup');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Creates / updates a customer or supplier. Every contact gets its own ledger account (Sundry Debtors / Creditors) */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (data.cs_type !== 'C' && data.cs_type !== 'S') {
            return res.send({ status: "E", message: "cs_type must be C (customer) or S (supplier)" });
        }
        if (!data.name) {
            return res.send({ status: "E", message: "Name is required" });
        }
        let duplicate_contact = await dbobj.collection('ob_contacts').findOne({
            c_id: data.c_id, cs_type: data.cs_type, name: data.name, stat: "A", con_id: { $ne: data.con_id || 0 }
        });
        if (duplicate_contact) {
            return res.send({ status: "E", message: "A contact with this name already exists" });
        }

        // A customer uses a sales list (S), a supplier a purchase list (P)
        let price_list_id = parseInt(data.price_list_id) || 0;
        if (price_list_id) {
            let price_list = await dbobj.collection('ob_price_lists').findOne({ c_id: data.c_id, price_list_id: price_list_id, stat: "A" });
            if (!price_list || price_list.list_type !== (data.cs_type === 'C' ? 'S' : 'P')) {
                return res.send({ status: "E", message: "Select a price list of the right type" });
            }
        }

        let contact_fields = {
            price_list_id: price_list_id,
            reminders_off: !!data.reminders_off,
            name: data.name,
            company: data.company || '',
            email: data.email || '',
            phone: data.phone || '',
            contact_person: data.contact_person || '',
            tax_no: (data.tax_no || '').toUpperCase(),
            state_code: data.state_code || '',
            credit_days: parseInt(data.credit_days) || 0,
            discount: Number(data.discount) || 0,
            tds: Number(data.tds) || 0,
            addresses: Array.isArray(data.addresses) ? data.addresses : [],
            is_active: data.is_active !== false,
            mdy_on: new Date()
        };

        if (!data.con_id) {
            let group_code = data.cs_type === 'C' ? 'SD' : 'SC';
            let con_acc_id = await COMPANY_SETUP.createAccount(dbobj, data.c_id, {
                name: data.name, group_code: group_code, opening_balance: UTILS.round2(data.opening_balance || 0), is_system: true
            });
            let con_id = await UTILS.getNextId(dbobj, 'ob_contacts');
            await dbobj.collection('ob_contacts').insertOne({
                ...contact_fields,
                con_id: con_id,
                c_id: data.c_id,
                cs_type: data.cs_type,
                con_acc_id: con_acc_id,
                stat: "A",
                crd_on: new Date()
            });
            return res.send({ status: "S", message: "Contact added", con_id: con_id });
        }

        let contact = await dbobj.collection('ob_contacts').findOne({ c_id: data.c_id, con_id: data.con_id, stat: "A" });
        if (!contact) {
            return res.send({ status: "E", message: "Contact not found" });
        }
        await dbobj.collection('ob_contacts').updateOne({ c_id: data.c_id, con_id: data.con_id }, { $set: contact_fields });
        // The ledger account follows the contact name
        let account_changes = { name: data.name };
        if (data.opening_balance !== undefined) {
            account_changes.opening_balance = UTILS.round2(data.opening_balance);
        }
        await dbobj.collection('ob_accounts').updateOne({ c_id: data.c_id, acc_id: contact.con_acc_id }, { $set: account_changes });
        return res.send({ status: "S", message: "Contact updated", con_id: data.con_id });
    }
    catch (err) {
        return sendError(res, err, 'contact_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
