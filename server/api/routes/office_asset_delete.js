const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, asset_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let asset = await dbobj.collection('ob_office_assets').findOne({ c_id: c_id, asset_id: asset_id, stat: "A" });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        if (asset.status === "ASSIGNED") {
            return res.send({ status: "E", message: `Asset is with ${asset.current_holder}. Return it first` });
        }
        let has_history = await dbobj.collection('ob_office_assignments').findOne(
            { c_id: c_id, asset_id: asset_id }, { projection: { assignment_id: 1 } });
        if (has_history) {
            return res.send({ status: "E", message: "Asset has assignment history. Mark it as Retired instead" });
        }
        await dbobj.collection('ob_office_assets').updateOne({ c_id: c_id, asset_id: asset_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Asset deleted" });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
