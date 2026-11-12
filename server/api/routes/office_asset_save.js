const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!data.asset_tag || !data.name || !data.category) {
            return res.send({ status: "E", message: "Asset tag, name and category are required" });
        }
        let duplicate_asset = await dbobj.collection('ob_office_assets').findOne(
            { c_id: data.c_id, asset_tag: data.asset_tag.trim(), stat: "A", asset_id: { $ne: data.asset_id || 0 } });
        if (duplicate_asset) {
            return res.send({ status: "E", message: "An asset with this tag already exists" });
        }

        // Status and the current holder are changed only by the assign, return and status endpoints
        let asset_fields = {
            asset_tag: data.asset_tag.trim(),
            name: data.name.trim(),
            category: data.category,
            brand: data.brand || '',
            model: data.model || '',
            serial_no: data.serial_no || '',
            purchase_date: UTILS.toDate(data.purchase_date),
            warranty_till: UTILS.toDate(data.warranty_till),
            purchase_cost: UTILS.round2(data.purchase_cost || 0),
            notes: data.notes || '',
            mdy_on: new Date()
        };

        if (!data.asset_id) {
            let asset_id = await UTILS.getNextId(dbobj, 'ob_office_assets');
            await dbobj.collection('ob_office_assets').insertOne({
                ...asset_fields,
                asset_id: asset_id,
                c_id: data.c_id,
                status: "AVAILABLE",
                current_assignment_id: 0,
                current_holder: '',
                current_to_date: null,
                last_user: '',
                stat: "A",
                crd_on: new Date()
            });
            return res.send({ status: "S", message: "Asset added", asset_id: asset_id });
        }

        let asset = await dbobj.collection('ob_office_assets').findOne({ c_id: data.c_id, asset_id: data.asset_id, stat: "A" });
        if (!asset) {
            return res.send({ status: "E", message: "Asset not found" });
        }
        await dbobj.collection('ob_office_assets').updateOne({ c_id: data.c_id, asset_id: data.asset_id }, { $set: asset_fields });
        return res.send({ status: "S", message: "Asset updated", asset_id: data.asset_id });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
