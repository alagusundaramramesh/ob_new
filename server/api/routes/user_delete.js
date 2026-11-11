const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Removes the user from this company. The user account itself is kept because it can belong to other companies */
router.post('/', async (req, res) => {
    const { c_id, user_id, delete_user_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (delete_user_id === user_id) {
            return res.send({ status: "E", message: "You can not remove yourself" });
        }
        let user = await dbobj.collection('ob_users').findOne({ user_id: delete_user_id });
        if (!user) {
            return res.send({ status: "E", message: "User not found" });
        }
        if (user.is_prime_user) {
            return res.send({ status: "E", message: "The primary user can not be removed" });
        }
        await dbobj.collection('ob_company_users').updateOne(
            { user_id: delete_user_id, c_id: c_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "User removed" });
    }
    catch (err) {
        return sendError(res, err, 'user_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
