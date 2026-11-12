const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let assigned_to = (data.assigned_to || '').trim();
        if (!assigned_to) {
            return res.send({ status: "E", message: "Employee name is required" });
        }
        let from_date = UTILS.toDate(data.from_date);
        if (!from_date) {
            return res.send({ status: "E", message: "From date is required" });
        }
        // To date is the expected return date. It can be empty when the asset is given without an end date
        let to_date = UTILS.toDate(data.to_date);
        if (to_date && to_date < from_date) {
            return res.send({ status: "E", message: "To date can not be before the from date" });
        }

        let asset = await dbobj.collection('ob_office_assets').findOne({ c_id: data.c_id, asset_id: data.asset_id, stat: "A" });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        if (asset.status === "ASSIGNED") {
            return res.send({ status: "E", message: `Asset is already with ${asset.current_holder}` });
        }
        if (asset.status !== "AVAILABLE") {
            return res.send({ status: "E", message: "Only an available asset can be assigned" });
        }

        let assignment_id = await UTILS.getNextId(dbobj, 'ob_office_assignments');
        await dbobj.collection('ob_office_assignments').insertOne({
            assignment_id: assignment_id,
            c_id: data.c_id,
            asset_id: asset.asset_id,
            asset_tag: asset.asset_tag,
            asset_name: asset.name,
            assigned_to: assigned_to,
            department: data.department || '',
            from_date: from_date,
            to_date: to_date,
            returned_on: null,
            assign_status: "ACTIVE",
            condition_out: data.condition_out || '',
            condition_in: '',
            remarks: data.remarks || '',
            crd_on: new Date()
        });
        // Only an AVAILABLE asset is updated, so two people can not take the same asset at the same time
        let update_result = await dbobj.collection('ob_office_assets').updateOne(
            { c_id: data.c_id, asset_id: asset.asset_id, status: "AVAILABLE" },
            { $set: { status: "ASSIGNED", current_assignment_id: assignment_id, current_holder: assigned_to, current_to_date: to_date, mdy_on: new Date() } });
        if (update_result.modifiedCount === 0) {
            await dbobj.collection('ob_office_assignments').deleteOne({ c_id: data.c_id, assignment_id: assignment_id });
            return res.send({ status: "E", message: "Asset was assigned to someone else just now" });
        }
        return res.send({ status: "S", message: "Asset assigned", assignment_id: assignment_id });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_assign');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
