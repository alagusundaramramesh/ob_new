const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* Moves an asset that is not assigned between AVAILABLE, UNDER_REPAIR and RETIRED */
const ALLOWED_STATUS = ["AVAILABLE", "UNDER_REPAIR", "RETIRED"];

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, asset_id, status } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!ALLOWED_STATUS.includes(status)) {
            return res.send({ status: "E", message: "Invalid status" });
        }
        let asset = await dbobj.collection('ob_office_assets').findOne({ c_id: c_id, asset_id: asset_id, stat: "A" });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        if (asset.status === "ASSIGNED") {
            return res.send({ status: "E", message: `Asset is with ${asset.current_holder}. Return it first` });
        }
        await dbobj.collection('ob_office_assets').updateOne(
            { c_id: c_id, asset_id: asset_id }, { $set: { status: status, mdy_on: new Date() } });
        return res.send({ status: "S", message: "Status updated" });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_status');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
