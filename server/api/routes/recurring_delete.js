const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Stops and removes the profile. Documents that were already created stay */
router.post('/', async (req, res) => {
    const { c_id, recurring_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let update_result = await dbobj.collection('ob_recurring').updateOne(
            { c_id: c_id, recurring_id: recurring_id, stat: "A" }, { $set: { stat: "D", is_active: false } });
        if (update_result.matchedCount === 0) {
            return res.send({ status: "E", message: "Recurring invoice not found" });
        }
        return res.send({ status: "S", message: "Recurring invoice deleted" });
    }
    catch (err) {
        return sendError(res, err, 'recurring_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
