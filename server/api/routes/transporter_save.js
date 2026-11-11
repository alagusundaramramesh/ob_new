const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const FORMATTER = require('../../classes/class.einvoice_formatter');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Transporters used in the e-way bill. gstin = the transporter id of the portal */
router.post('/', async (req, res) => {
    const { c_id, tp_id, name, gstin } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let transporter_gstin = String(gstin || '').trim().toUpperCase();
        if (!name || !FORMATTER.isValidGstin(transporter_gstin)) {
            return res.send({ status: "E", message: "Name and a valid transporter GSTIN are required" });
        }
        let duplicate = await dbobj.collection('ob_transporters').findOne({ c_id: c_id, gstin: transporter_gstin, stat: "A", tp_id: { $ne: tp_id || 0 } });
        if (duplicate) {
            return res.send({ status: "E", message: `${duplicate.name} already has this GSTIN` });
        }
        if (!tp_id) {
            let new_tp_id = await UTILS.getNextId(dbobj, 'ob_transporters');
            await dbobj.collection('ob_transporters').insertOne({ tp_id: new_tp_id, c_id: c_id, name: name, gstin: transporter_gstin, stat: "A", crd_on: new Date() });
            return res.send({ status: "S", message: "Transporter added", tp_id: new_tp_id });
        }
        await dbobj.collection('ob_transporters').updateOne({ c_id: c_id, tp_id: tp_id }, { $set: { name: name, gstin: transporter_gstin } });
        return res.send({ status: "S", message: "Transporter updated", tp_id: tp_id });
    }
    catch (err) {
        return sendError(res, err, 'transporter_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
