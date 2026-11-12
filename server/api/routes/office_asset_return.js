const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let returned_on = UTILS.toDate(data.returned_on);
        if (!returned_on) {
            return res.send({ status: "E", message: "Return date is required" });
        }
        // After the return the asset is available again, or goes for repair when it came back damaged
        let next_status = data.send_to_repair ? "UNDER_REPAIR" : "AVAILABLE";

        let asset = await dbobj.collection('ob_office_assets').findOne({ c_id: data.c_id, asset_id: data.asset_id, stat: "A" });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        if (asset.status !== "ASSIGNED") {
            return res.send({ status: "E", message: "Asset is not assigned to anyone" });
        }
        let assignment = await dbobj.collection('ob_office_assignments').findOne(
            { c_id: data.c_id, assignment_id: asset.current_assignment_id, assign_status: "ACTIVE" });
        if (!assignment) {
            return res.send({ status: "E", message: "Active assignment not found" });
        }
        if (returned_on < assignment.from_date) {
            return res.send({ status: "E", message: "Return date can not be before the from date" });
        }

        await dbobj.collection('ob_office_assignments').updateOne(
            { c_id: data.c_id, assignment_id: assignment.assignment_id },
            { $set: { returned_on: returned_on, assign_status: "RETURNED", condition_in: data.condition_in || '' } });
        await dbobj.collection('ob_office_assets').updateOne(
            { c_id: data.c_id, asset_id: asset.asset_id },
            { $set: { status: next_status, current_assignment_id: 0, current_holder: '', current_to_date: null, last_user: assignment.assigned_to, mdy_on: new Date() } });
        return res.send({ status: "S", message: "Asset returned" });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_return');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
