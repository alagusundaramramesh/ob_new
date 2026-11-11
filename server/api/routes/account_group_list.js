const express = require('express');
const router = express.Router();
const SYS_DATA = require('../../common/sys_data');

/* MAIN SCRIPT STARTS */
/* Account groups are the same for every company, they come from common/sys_data.js */
router.post('/', async (req, res) => {
    let account_groups = SYS_DATA.ACCOUNT_GROUPS.map(group => ({
        group_code: group[0],
        name: group[1],
        parent_group_code: group[2],
        acc_type: group[3],
        rpt_type: group[4]
    }));
    return res.send({ status: "S", data: account_groups });
})
module.exports = router;
/* MAIN SCRIPT ENDS */
