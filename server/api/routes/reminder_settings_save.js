const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, enabled, before_due_days, overdue_repeat_days, max_overdue_reminders } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let before_days = parseInt(before_due_days);
        let repeat_days = parseInt(overdue_repeat_days);
        let max_reminders = parseInt(max_overdue_reminders);
        if (!(before_days >= 0 && before_days <= 60) || !(repeat_days >= 0 && repeat_days <= 90) || !(max_reminders >= 1 && max_reminders <= 20)) {
            return res.send({ status: "E", message: "Days before due: 0-60, repeat every: 0-90 days, maximum overdue reminders: 1-20" });
        }
        let reminder_settings = {
            enabled: !!enabled,
            before_due_days: before_days,
            overdue_repeat_days: repeat_days,
            max_overdue_reminders: max_reminders
        };
        await dbobj.collection('ob_companies').updateOne({ c_id: c_id }, { $set: { reminder_settings: reminder_settings } });
        return res.send({ status: "S", message: "Reminder settings saved", data: reminder_settings });
    }
    catch (err) {
        return sendError(res, err, 'reminder_settings_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
