const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const EMAIL = require('../../utils/util.email_templates');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Sends a reset link. The answer is the same whether the email exists or not, so nobody can find out which emails are registered */
router.post('/', async (req, res) => {
    const { email, client_url } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!email) {
            return res.send({ status: "E", message: "Email is required" });
        }
        let user = await dbobj.collection('ob_users').findOne({ email: email.toLowerCase().trim(), stat: "A" });
        if (user) {
            let reset_token = crypto.randomBytes(32).toString('hex');
            // Only the hash of the token is stored
            let reset_token_hash = crypto.createHash('sha256').update(reset_token).digest('hex');
            await dbobj.collection('ob_users').updateOne(
                { user_id: user.user_id },
                { $set: { reset_token_hash: reset_token_hash, reset_expires: new Date(Date.now() + 60 * 60 * 1000) } }
            );
            let reset_link = `${client_url || ''}/reset-password?token=${reset_token}`;
            let reset_mail = EMAIL.resetPasswordMail(user.name, reset_link);
            await EMAIL.sendMail(user.email, reset_mail.subject, reset_mail.html);
        }
        return res.send({ status: "S", message: "If the email is registered, a reset link has been sent" });
    }
    catch (err) {
        return sendError(res, err, 'forgot_password');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
