const express = require('express');
const router = express.Router();
const bcrypt = require("bcrypt");
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { email, password } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!email || !password) {
            return res.send({ status: "E", message: "Email and password are required" });
        }
        let user = await dbobj.collection('ob_users').findOne({ email: email.toLowerCase().trim(), stat: "A" });
        if (!user || !user.password) {
            return res.send({ status: "E", message: "Incorrect email or password" });
        }
        let is_password_correct = await bcrypt.compare(password, user.password);
        if (!is_password_correct) {
            return res.send({ status: "E", message: "Incorrect email or password" });
        }
        if (!user.is_active) {
            return res.send({ status: "E", message: "Your account is inactive" });
        }

        // The company the user works in: the default one, otherwise the first company of the user
        let company_user = await dbobj.collection('ob_company_users').findOne(
            { user_id: user.user_id, c_id: user.default_c_id, stat: "A" });
        if (!company_user) {
            company_user = await dbobj.collection('ob_company_users').findOne({ user_id: user.user_id, stat: "A" });
        }
        if (!company_user) {
            return res.send({ status: "E", message: "No company is linked to this account" });
        }

        await dbobj.collection('ob_users').updateOne({ user_id: user.user_id }, { $set: { last_login: new Date() } });
        let token = UTILS.generateToken(user, company_user.c_id, company_user.role_id);
        return res.send({ status: "S", token: token, message: "Login successful" });
    }
    catch (err) {
        return sendError(res, err, 'login');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
