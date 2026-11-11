const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let profiles = await dbobj.collection('ob_recurring').aggregate([
            { $match: { c_id: c_id, stat: "A" } },
            { $lookup: { from: 'ob_transactions', let: { source_id: '$source_trans_id' }, pipeline: [
                { $match: { $expr: { $and: [{ $eq: ['$trans_id', '$$source_id'] }, { $eq: ['$c_id', c_id] }] } } },
                { $project: { _id: 0, trans_no: 1, trans_type: 1, con_name: 1, tot_amount: 1 } }
            ], as: 'source' } },
            { $addFields: { source: { $arrayElemAt: ['$source', 0] } } },
            { $project: { _id: 0 } },
            { $sort: { next_date: 1 } }
        ]).toArray();
        return res.send({ status: "S", data: profiles });
    }
    catch (err) {
        return sendError(res, err, 'recurring_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
