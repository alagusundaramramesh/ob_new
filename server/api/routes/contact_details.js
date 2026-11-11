const express = require('express');
const router = express.Router();
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, con_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: con_id, stat: "A" }, { projection: { _id: 0 } });
        if (!contact) {
            return res.send({ status: "E", message: "Contact not found" });
        }
        let account = await dbobj.collection('ob_accounts').findOne({ c_id: c_id, acc_id: contact.con_acc_id });
        let balance_map = await REPORT.getAccountBalances(dbobj, c_id, [contact.con_acc_id]);
        let recent_transactions = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, con_id: con_id, stat: "A" },
            { projection: { _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, trans_date: 1, tot_amount: 1, rec_amt: 1, status: 1 } }
        ).sort({ trans_date: -1, trans_id: -1 }).limit(10).toArray();

        return res.send({
            status: "S",
            data: {
                ...contact,
                opening_balance: account ? account.opening_balance : 0,
                balance: balance_map[contact.con_acc_id] || 0,
                recent_transactions: recent_transactions
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'contact_details');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
