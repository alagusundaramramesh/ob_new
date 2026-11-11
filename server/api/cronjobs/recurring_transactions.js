const express = require('express');
const router = express.Router();
const RECURRING = require('../../classes/class.recurring');

/* Creates the documents of all recurring profiles that are due. Called by class.cron.js every day */
async function run(dbobj) {
    return RECURRING.runDueProfiles(dbobj);
}

/* MAIN SCRIPT STARTS */
/* Manual run: POST /cron/recurring_transactions with the x-api-key header (see app_router) */
router.post('/', async (req, res) => {
    let dbobj = res.locals.dbobj;
    try {
        let summary = await run(dbobj);
        return res.send({ status: "S", ...summary });
    }
    catch (err) {
        console.error('recurring_transactions failed', err);
        return res.send({ status: "E", message: "Unable to process request" });
    }
})
router.run = run;
module.exports = router;
/* MAIN SCRIPT ENDS */
