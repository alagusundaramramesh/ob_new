const express = require('express');
const router = express.Router();
const bcrypt = require("bcrypt");
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { user_id, old_password, new_password } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!old_password || !new_password || new_password.length < 6) {
            return res.send({ status: "E", message: "New password must have at least 6 characters" });
        }
        let user = await dbobj.collection('ob_users').findOne({ user_id: user_id, stat: "A" });
        if (!user) {
            return res.send({ status: "E", message: "User not found" });
        }
        let is_password_correct = await bcrypt.compare(old_password, user.password);
        if (!is_password_correct) {
            return res.send({ status: "E", message: "Old password is incorrect" });
        }
        await dbobj.collection('ob_users').updateOne(
            { user_id: user_id }, { $set: { password: await bcrypt.hash(new_password, 10) } });
        return res.send({ status: "S", message: "Password changed" });
    }
    catch (err) {
        return sendError(res, err, 'change_password');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
