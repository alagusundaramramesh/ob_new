const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const SYS_DATA = require('../../common/sys_data');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, role_id, role_name, permissions } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!role_name || !Array.isArray(permissions)) {
            return res.send({ status: "E", message: "Role name and permissions are required" });
        }
        // Only known module codes are accepted
        let valid_mod_codes = SYS_DATA.SYS_MODULES.map(sys_module => sys_module[0]);
        let role_permissions = permissions.filter(mod_code => valid_mod_codes.includes(mod_code));

        if (role_id) {
            let role = await dbobj.collection('ob_roles').findOne({ c_id: c_id, role_id: role_id, stat: "A" });
            if (!role) {
                return res.send({ status: "E", message: "Role not found" });
            }
            if (role.role_code === 'C') {
                return res.send({ status: "E", message: "The Admin role can not be changed" });
            }
            await dbobj.collection('ob_roles').updateOne(
                { c_id: c_id, role_id: role_id },
                { $set: { role_name: role_name, permissions: role_permissions } });
            return res.send({ status: "S", message: "Role updated" });
        }

        let new_role_id = await UTILS.getNextId(dbobj, 'ob_roles');
        await dbobj.collection('ob_roles').insertOne({
            role_id: new_role_id, c_id: c_id, role_code: 'U', role_name: role_name,
            permissions: role_permissions, is_system: false, stat: "A"
        });
        return res.send({ status: "S", message: "Role added", role_id: new_role_id });
    }
    catch (err) {
        return sendError(res, err, 'role_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
