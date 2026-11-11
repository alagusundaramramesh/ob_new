const express = require('express');
const router = express.Router();
const bcrypt = require("bcrypt");
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Adds a user to the company or changes the role / details of an existing one */
router.post('/', async (req, res) => {
    const { c_id, name, email, phone, password, role_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name || !email || !role_id) {
            return res.send({ status: "E", message: "Name, email and role are required" });
        }
        let role = await dbobj.collection('ob_roles').findOne({ c_id: c_id, role_id: role_id, stat: "A" });
        if (!role) {
            return res.send({ status: "E", message: "Role not found" });
        }
        let user_email = email.toLowerCase().trim();
        let user = await dbobj.collection('ob_users').findOne({ email: user_email });
        let company_user = user
            ? await dbobj.collection('ob_company_users').findOne({ user_id: user.user_id, c_id: c_id })
            : null;

        if (!user) {
            if (!password || password.length < 6) {
                return res.send({ status: "E", message: "Password must have at least 6 characters" });
            }
            let user_id = await UTILS.getNextId(dbobj, 'ob_users');
            user = {
                user_id: user_id,
                name: name,
                email: user_email,
                password: await bcrypt.hash(password, 10),
                phone: phone || '',
                default_c_id: c_id,
                is_prime_user: false,
                is_active: true,
                stat: CONFIG.STAT_ACTIVE,
                crd_on: new Date()
            };
            await dbobj.collection('ob_users').insertOne(user);
        } else if (company_user) {
            // Profile changes are only allowed for users who already work in this company.
            // An existing account of another company is only linked, its name and password stay as they are
            let user_changes = { name: name, phone: phone || '' };
            if (password) {
                user_changes.password = await bcrypt.hash(password, 10);
            }
            await dbobj.collection('ob_users').updateOne({ user_id: user.user_id }, { $set: user_changes });
        }

        // The primary user must keep the Admin role
        if (company_user && user.is_prime_user && role.role_code !== 'C') {
            return res.send({ status: "E", message: "The primary user must keep the Admin role" });
        }
        await dbobj.collection('ob_company_users').updateOne(
            { user_id: user.user_id, c_id: c_id },
            { $set: { role_id: role_id, stat: CONFIG.STAT_ACTIVE } },
            { upsert: true }
        );
        return res.send({ status: "S", message: company_user ? "User updated" : "User added", user_id: user.user_id });
    }
    catch (err) {
        return sendError(res, err, 'user_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
