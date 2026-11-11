const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const COMPANY_SETUP = require('../../classes/class.company_setup');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Adds one more company to the logged in user. Returns a token for the new company */
router.post('/', async (req, res) => {
    const { user_id, name, state_code, country_code, currency } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name) {
            return res.send({ status: "E", message: "Company name is required" });
        }
        let user = await dbobj.collection('ob_users').findOne({ user_id: user_id, stat: "A" });
        if (!user.is_prime_user) {
            return res.send({ status: "E", message: "Only the primary user can create a company" });
        }

        let c_id = await UTILS.getNextId(dbobj, 'ob_companies');
        await dbobj.collection('ob_companies').insertOne({
            c_id: c_id,
            name: name,
            address1: '', address2: '', city: '', zip: '',
            state_code: state_code || '',
            country_code: country_code || CONFIG.DEFAULT_COUNTRY_CODE,
            currency: currency || CONFIG.DEFAULT_CURRENCY,
            fy_start: CONFIG.DEFAULT_FY_START_MONTH,
            email: user.email,
            phone: user.phone || '',
            tax_no: '',
            locked_till: null,
            allow_negative_stock: true,
            stat: CONFIG.STAT_ACTIVE,
            crd_on: new Date()
        });
        let admin_role_id = await COMPANY_SETUP.createDefaults(dbobj, c_id);
        await dbobj.collection('ob_company_users').insertOne({
            user_id: user_id, c_id: c_id, role_id: admin_role_id, stat: CONFIG.STAT_ACTIVE
        });
        await dbobj.collection('ob_users').updateOne({ user_id: user_id }, { $set: { default_c_id: c_id } });

        let token = UTILS.generateToken(user, c_id, admin_role_id);
        return res.send({ status: "S", token: token, message: "Company created" });
    }
    catch (err) {
        return sendError(res, err, 'company_create');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
