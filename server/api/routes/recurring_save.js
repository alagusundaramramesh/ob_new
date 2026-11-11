const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const RECURRING = require('../../classes/class.recurring');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, recurring_id, name, source_trans_id, frequency, next_date, end_date, auto_email, is_active } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name) {
            return res.send({ status: "E", message: "Name is required" });
        }
        if (!RECURRING.isValidFrequency(frequency)) {
            return res.send({ status: "E", message: "Frequency must be W, M, Q or Y" });
        }
        let first_date = UTILS.toDate(next_date);
        let last_date = UTILS.toDate(end_date);
        if (!first_date) {
            return res.send({ status: "E", message: "Next date is required" });
        }
        if (last_date && last_date < first_date) {
            return res.send({ status: "E", message: "End date can not be before the next date" });
        }
        let source_trans = await dbobj.collection('ob_transactions').findOne({ c_id: c_id, trans_id: source_trans_id, stat: "A" });
        if (!source_trans || !RECURRING.RECURRING_TYPES.includes(source_trans.trans_type)) {
            return res.send({ status: "E", message: "Select a sales invoice or a purchase bill as the template" });
        }

        let profile_fields = {
            name: name, source_trans_id: source_trans_id, trans_type: source_trans.trans_type, frequency: frequency,
            next_date: first_date, end_date: last_date, auto_email: !!auto_email, is_active: is_active !== false, mdy_on: new Date()
        };
        if (!recurring_id) {
            let new_recurring_id = await UTILS.getNextId(dbobj, 'ob_recurring');
            await dbobj.collection('ob_recurring').insertOne({
                ...profile_fields, recurring_id: new_recurring_id, c_id: c_id, run_count: 0, last_error: '', stat: "A", crd_on: new Date()
            });
            return res.send({ status: "S", message: "Recurring invoice added", recurring_id: new_recurring_id });
        }
        let profile = await dbobj.collection('ob_recurring').findOne({ c_id: c_id, recurring_id: recurring_id, stat: "A" });
        if (!profile) {
            return res.send({ status: "E", message: "Recurring invoice not found" });
        }
        await dbobj.collection('ob_recurring').updateOne({ c_id: c_id, recurring_id: recurring_id }, { $set: { ...profile_fields, last_error: '' } });
        return res.send({ status: "S", message: "Recurring invoice updated", recurring_id: recurring_id });
    }
    catch (err) {
        return sendError(res, err, 'recurring_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
