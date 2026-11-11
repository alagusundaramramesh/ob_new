const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Users of the current company with their role */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company_users = await dbobj.collection('ob_company_users').find({ c_id: c_id, stat: "A" }).toArray();
        let user_ids = company_users.map(company_user => company_user.user_id);
        let users = await dbobj.collection('ob_users').find(
            { user_id: { $in: user_ids }, stat: "A" },
            { projection: { _id: 0, user_id: 1, name: 1, email: 1, phone: 1, is_active: 1, is_prime_user: 1, last_login: 1 } }
        ).toArray();
        let roles = await dbobj.collection('ob_roles').find({ c_id: c_id }, { projection: { _id: 0, role_id: 1, role_name: 1 } }).toArray();

        let company_user_list = users.map(user => {
            let company_user = company_users.find(item => item.user_id === user.user_id);
            let role = roles.find(item => item.role_id === company_user.role_id);
            return { ...user, role_id: company_user.role_id, role_name: role ? role.role_name : '' };
        });
        return res.send({ status: "S", data: company_user_list });
    }
    catch (err) {
        return sendError(res, err, 'user_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
