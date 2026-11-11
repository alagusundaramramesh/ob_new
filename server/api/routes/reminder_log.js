const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* History of the reminders that were sent (or failed). trans_id is optional: it limits the list to one invoice */
router.post('/', async (req, res) => {
    const { c_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let query_parameter = { c_id: c_id };
        if (trans_id) {
            query_parameter.trans_id = trans_id;
        }
        let reminders = await dbobj.collection('ob_reminders').find(query_parameter, { projection: { _id: 0 } })
            .sort({ sent_on: -1 }).limit(100).toArray();
        return res.send({ status: "S", data: reminders });
    }
    catch (err) {
        return sendError(res, err, 'reminder_log');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
