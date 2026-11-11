const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const SECRET = require('../../classes/class.secret');
const EINVOICE = require('../../classes/class.einvoice');
const FORMATTER = require('../../classes/class.einvoice_formatter');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, enabled, mode, ewb_only, api_username, api_password } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (mode !== 'sandbox' && mode !== 'production') {
            return res.send({ status: "E", message: "Mode must be sandbox or production" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        let provider = EINVOICE.getProvider();
        if (enabled && !FORMATTER.isValidGstin(company.tax_no)) {
            return res.send({ status: "E", message: "Enter a valid GSTIN of the company in Settings > Company first" });
        }
        if (enabled && mode === 'production' && !provider.is_live) {
            return res.send({ status: "E", message: "Production needs a real provider. Set EINV_PROVIDER=taxpro in the server .env" });
        }

        // The password is only replaced when a new one is typed
        let credential_changes = { api_username: String(api_username || '').trim(), updated_on: new Date() };
        if (api_password) {
            credential_changes.api_password_enc = SECRET.encrypt(api_password);
        }
        await dbobj.collection('ob_einvoice_credentials').updateOne({ c_id: c_id }, { $set: credential_changes }, { upsert: true });
        await dbobj.collection('ob_companies').updateOne(
            { c_id: c_id }, { $set: { einvoice_settings: { enabled: !!enabled, mode: mode, ewb_only: !!ewb_only } } });
        return res.send({ status: "S", message: "E-invoice settings saved" });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_settings_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
