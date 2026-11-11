const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Changes the prefix, suffix or next number of a numbering series */
router.post('/', async (req, res) => {
    const { c_id, series_id, prefix, suffix, nxt_number } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let next_number = parseInt(nxt_number);
        if (!(next_number >= 1)) {
            return res.send({ status: "E", message: "Next number must be 1 or more" });
        }
        let series = await dbobj.collection('ob_series').findOne({ c_id: c_id, series_id: series_id, stat: "A" });
        if (!series) {
            return res.send({ status: "E", message: "Series not found" });
        }
        // The next number must not collide with a number that is already used
        let new_trans_no = `${prefix || ''}${next_number}${suffix || ''}`;
        let existing_trans = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, trans_type: series.trans_type, trans_no: new_trans_no, stat: "A" });
        if (existing_trans) {
            return res.send({ status: "E", message: `${new_trans_no} is already used` });
        }
        await dbobj.collection('ob_series').updateOne(
            { c_id: c_id, series_id: series_id },
            { $set: { prefix: prefix || '', suffix: suffix || '', nxt_number: next_number } });
        return res.send({ status: "S", message: "Series updated" });
    }
    catch (err) {
        return sendError(res, err, 'series_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
