const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* A user can belong to many companies. This returns a new token for the selected one */
router.post('/', async (req, res) => {
    const { user_id, target_c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company_user = await dbobj.collection('ob_company_users').findOne(
            { user_id: user_id, c_id: target_c_id, stat: "A" });
        if (!company_user) {
            return res.send({ status: "E", message: "You do not have access to this company" });
        }
        let user = await dbobj.collection('ob_users').findOne({ user_id: user_id, stat: "A" });
        await dbobj.collection('ob_users').updateOne({ user_id: user_id }, { $set: { default_c_id: target_c_id } });
        let token = UTILS.generateToken(user, target_c_id, company_user.role_id);
        return res.send({ status: "S", token: token });
    }
    catch (err) {
        return sendError(res, err, 'switch_company');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
