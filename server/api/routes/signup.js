const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const COMPANY_SETUP = require('../../classes/class.company_setup');
const EMAIL = require('../../utils/util.email_templates');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Creates the first user together with the first company (same as the PHP User::signup_post) */
router.post('/', async (req, res) => {
    const { name, email, password, phone, company_name, state_code, country_code, currency } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name || !email || !password || !company_name) {
            return res.send({ status: "E", message: "Name, email, password and company name are required" });
        }
        if (password.length < 6) {
            return res.send({ status: "E", message: "Password must have at least 6 characters" });
        }
        let user_email = email.toLowerCase().trim();
        let existing_user = await dbobj.collection('ob_users').findOne({ email: user_email });
        if (existing_user) {
            return res.send({ status: "E", message: "An account with this email already exists" });
        }

        let setup_result = await COMPANY_SETUP.createCompanyWithAdmin(
            dbobj,
            { name: company_name, state_code, country_code, currency, email: user_email, phone },
            { name, email: user_email, password, phone }
        );

        let welcome_mail = EMAIL.welcomeMail(name);
        EMAIL.sendMail(user_email, welcome_mail.subject, welcome_mail.html)
            .catch(mail_error => console.error('Welcome mail failed', mail_error.message));

        let token = UTILS.generateToken(setup_result.user, setup_result.c_id, setup_result.admin_role_id);
        return res.send({ status: "S", token: token, message: "Account created" });
    }
    catch (err) {
        return sendError(res, err, 'signup');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
