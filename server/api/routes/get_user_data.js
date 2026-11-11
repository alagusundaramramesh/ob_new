const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Logged in user + current company + role permissions + the other companies of the user */
router.post('/', async (req, res) => {
    const { user_id, c_id, auth_role_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let user = await dbobj.collection('ob_users').findOne(
            { user_id: user_id, stat: "A" },
            { projection: { _id: 0, password: 0, reset_token_hash: 0, reset_expires: 0 } }
        );
        if (!user) {
            return res.send({ status: "UA", msg: "Your account has been logged out." });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        if (!company) {
            return res.send({ status: "E", message: "Company not found" });
        }
        let role = await dbobj.collection('ob_roles').findOne(
            { c_id: c_id, role_id: auth_role_id }, { projection: { _id: 0 } });

        // Admin role gets every module
        let permissions = role.permissions;
        if (role.role_code === 'C') {
            const SYS_DATA = require('../../common/sys_data');
            permissions = SYS_DATA.SYS_MODULES.map(sys_module => sys_module[0]);
        }

        let company_users = await dbobj.collection('ob_company_users').find({ user_id: user_id, stat: "A" }).toArray();
        let company_ids = company_users.map(company_user => company_user.c_id);
        let companies = await dbobj.collection('ob_companies').find(
            { c_id: { $in: company_ids }, stat: "A" }, { projection: { _id: 0, c_id: 1, name: 1 } }).toArray();

        return res.send({
            status: "S",
            data: {
                user: user,
                company: company,
                role: { role_id: role.role_id, role_code: role.role_code, role_name: role.role_name },
                permissions: permissions,
                companies: companies
            }
        });
    }
    catch (err) {
        return sendError(res, err, 'get_user_data');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
