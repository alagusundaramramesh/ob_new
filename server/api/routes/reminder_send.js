const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REMINDER = require('../../classes/class.reminder');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Sends a reminder for one invoice now, whatever the schedule says */
router.post('/', async (req, res) => {
    const { c_id, trans_id, message } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let transaction = await dbobj.collection('ob_transactions').findOne({ c_id: c_id, trans_id: trans_id, stat: "A" });
        if (!transaction || !REMINDER.REMINDER_TYPES.includes(transaction.trans_type)) {
            return res.send({ status: "E", message: "Select a sales invoice or debit note" });
        }
        if (transaction.rec_amt >= transaction.tot_amount) {
            return res.send({ status: "E", message: "This invoice is already paid" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        let contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: transaction.con_id });
        let log_entry = await REMINDER.send(dbobj, company, transaction, contact, 'manual', message);
        return res.send({ status: "S", message: `Reminder sent to ${log_entry.sent_to}` });
    }
    catch (err) {
        return sendError(res, err, 'reminder_send');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
