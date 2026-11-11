const express = require('express');
const router = express.Router();
const SYS_DATA = require('../../common/sys_data');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Roles of the company and the list of all modules (for the permission screen) */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let roles = await dbobj.collection('ob_roles').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ role_id: 1 }).toArray();
        let modules = SYS_DATA.SYS_MODULES.map(sys_module => ({ mod_code: sys_module[0], mod_name: sys_module[1] }));
        return res.send({ status: "S", data: roles, modules: modules });
    }
    catch (err) {
        return sendError(res, err, 'role_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
