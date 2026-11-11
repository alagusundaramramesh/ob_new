const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const EINVOICE = require('../../classes/class.einvoice');
const FORMATTER = require('../../classes/class.einvoice_formatter');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Settings of the screen. The password is never sent back, only whether one is saved */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let settings = EINVOICE.getSettings(company);
        let credentials = await dbobj.collection('ob_einvoice_credentials').findOne({ c_id: c_id });
        let provider = EINVOICE.getProvider();
        return res.send({
            status: "S",
            data: {
                enabled: settings.enabled, mode: settings.mode, ewb_only: settings.ewb_only,
                api_username: credentials ? credentials.api_username : '', has_password: !!(credentials && credentials.api_password_enc),
                provider: provider.name, provider_is_live: provider.is_live, gstin_is_valid: FORMATTER.isValidGstin(company.tax_no)
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_settings_get');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
