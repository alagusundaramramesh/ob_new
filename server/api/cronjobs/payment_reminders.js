const express = require('express');
const router = express.Router();
const REMINDER = require('../../classes/class.reminder');

/* Mails the customers whose invoice is due soon or overdue. Called by class.cron.js every day */
async function run(dbobj) {
    return REMINDER.runAll(dbobj);
}

/* MAIN SCRIPT STARTS */
/* Manual run: POST /cron/payment_reminders with the x-api-key header (see app_router) */
router.post('/', async (req, res) => {
    let dbobj = res.locals.dbobj;
    try {
        let summary = await run(dbobj);
        return res.send({ status: "S", ...summary });
    }
    catch (err) {
        console.error('payment_reminders failed', err);
        return res.send({ status: "E", message: "Unable to process request" });
    }
})
router.run = run;
module.exports = router;
/* MAIN SCRIPT ENDS */
