const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, search, assign_status, overdue_only } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let query_parameter = { c_id: c_id };
        if (assign_status) {
            query_parameter.assign_status = assign_status;
        }
        // Overdue: still with the employee and the expected return date is over
        if (overdue_only) {
            query_parameter.assign_status = "ACTIVE";
            query_parameter.to_date = { $lt: UTILS.toDate(new Date()) };
        }
        if (search) {
            let search_regex = { $regex: UTILS.escapeRegex(search), $options: "i" };
            query_parameter.$or = [{ assigned_to: search_regex }, { asset_tag: search_regex }, { asset_name: search_regex }, { department: search_regex }];
        }

        let total_count = await dbobj.collection('ob_office_assignments').countDocuments(query_parameter);
        let assignments = await dbobj.collection('ob_office_assignments').find(query_parameter, { projection: { _id: 0 } })
            .sort({ assignment_id: -1 }).skip(skip).limit(limit).toArray();
        return res.send({ status: "S", data: assignments, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'office_assignment_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
