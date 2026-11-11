const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require("bcrypt");
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { token, password } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!token || !password || password.length < 6) {
            return res.send({ status: "E", message: "A valid token and a password of at least 6 characters are required" });
        }
        let reset_token_hash = crypto.createHash('sha256').update(token).digest('hex');
        let user = await dbobj.collection('ob_users').findOne(
            { reset_token_hash: reset_token_hash, reset_expires: { $gt: new Date() }, stat: "A" });
        if (!user) {
            return res.send({ status: "E", message: "The reset link is invalid or has expired" });
        }
        await dbobj.collection('ob_users').updateOne(
            { user_id: user.user_id },
            { $set: { password: await bcrypt.hash(password, 10) }, $unset: { reset_token_hash: "", reset_expires: "" } }
        );
        return res.send({ status: "S", message: "Password updated" });
    }
    catch (err) {
        return sendError(res, err, 'reset_password');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
