const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, asset_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let asset = await dbobj.collection('ob_office_assets').findOne(
            { c_id: c_id, asset_id: asset_id, stat: "A" }, { projection: { _id: 0 } });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        let history = await dbobj.collection('ob_office_assignments').find(
            { c_id: c_id, asset_id: asset_id }, { projection: { _id: 0 } }).sort({ assignment_id: -1 }).toArray();
        return res.send({ status: "S", data: asset, history: history });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_details');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
