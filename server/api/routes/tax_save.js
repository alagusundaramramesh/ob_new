const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const SYS_DATA = require('../../common/sys_data');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * A tax is a group of tax parts, for example GST 18% = CGST 9 + SGST 9 (inside the state) and IGST 18 (outside the state).
 * details: [{ tax_type_code, tax_rate, state_type }]
 */
router.post('/', async (req, res) => {
    const { c_id, tax_id, name, tax_code, details, is_default } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name || !Array.isArray(details) || details.length === 0) {
            return res.send({ status: "E", message: "Tax name and at least one tax rate are required" });
        }
        let valid_tax_types = SYS_DATA.TAX_TYPES.map(tax_type => tax_type[0]);
        for (const detail of details) {
            if (!valid_tax_types.includes(detail.tax_type_code)) {
                return res.send({ status: "E", message: `Invalid tax type ${detail.tax_type_code}` });
            }
            if (!(Number(detail.tax_rate) >= 0)) {
                return res.send({ status: "E", message: "Tax rate must be zero or more" });
            }
        }
        let duplicate_tax = await dbobj.collection('ob_taxes').findOne(
            { c_id: c_id, name: name, stat: "A", tax_id: { $ne: tax_id || 0 } });
        if (duplicate_tax) {
            return res.send({ status: "E", message: "A tax with this name already exists" });
        }

        let tax_details = details.map(detail => ({
            tax_type_code: detail.tax_type_code,
            tax_rate: Number(detail.tax_rate),
            state_type: detail.state_type || 'A'
        }));
        if (is_default) {
            await dbobj.collection('ob_taxes').updateMany({ c_id: c_id }, { $set: { is_default: false } });
        }

        if (!tax_id) {
            let new_tax_id = await UTILS.getNextId(dbobj, 'ob_taxes');
            await dbobj.collection('ob_taxes').insertOne({
                tax_id: new_tax_id, c_id: c_id, name: name, tax_code: tax_code || '', details: tax_details,
                is_default: !!is_default, is_active: true, stat: "A"
            });
            return res.send({ status: "S", message: "Tax added", tax_id: new_tax_id });
        }
        await dbobj.collection('ob_taxes').updateOne(
            { c_id: c_id, tax_id: tax_id },
            { $set: { name: name, tax_code: tax_code || '', details: tax_details, is_default: !!is_default } });
        return res.send({ status: "S", message: "Tax updated", tax_id: tax_id });
    }
    catch (err) {
        return sendError(res, err, 'tax_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
