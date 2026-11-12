const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!data.name) {
            return res.send({ status: "E", message: "Company name is required" });
        }
        // Only these fields can be changed from the settings screen
        let company_changes = {
            name: data.name,
            address1: data.address1 || '',
            address2: data.address2 || '',
            city: data.city || '',
            zip: data.zip || '',
            state_code: data.state_code || '',
            country_code: data.country_code || 'IN',
            currency: data.currency || 'INR',
            email: data.email || '',
            phone: data.phone || '',
            tax_no: data.tax_no || '',
            fy_start: parseInt(data.fy_start) || 4,
            allow_negative_stock: data.allow_negative_stock !== false,
            locked_till: UTILS.toDate(data.locked_till),
            mdy_on: new Date()
        };
        // Composition scheme: no GST on sales, tax is paid as a percentage of the turnover (GSTR-4). Left as it is when the screen does not send it
        if (data.gst_scheme !== undefined) {
            if (!['REGULAR', 'COMPOSITION'].includes(data.gst_scheme)) {
                return res.send({ status: "E", message: "GST scheme must be REGULAR or COMPOSITION" });
            }
            company_changes.gst_scheme = data.gst_scheme;
            company_changes.composition_rate = Number(data.composition_rate) || 1;
        }
        await dbobj.collection('ob_companies').updateOne({ c_id: data.c_id }, { $set: company_changes });
        let company = await UTILS.getCompany(dbobj, data.c_id);
        return res.send({ status: "S", message: "Company updated", data: company });
    }
    catch (err) {
        return sendError(res, err, 'company_update');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
