const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, pay_mode_id, name, acc_group_code, is_active } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name) {
            return res.send({ status: "E", message: "Payment mode name is required" });
        }
        if (acc_group_code !== 'CH' && acc_group_code !== 'BA') {
            return res.send({ status: "E", message: "Account group must be CH (cash) or BA (bank)" });
        }
        let duplicate_mode = await dbobj.collection('ob_payment_modes').findOne(
            { c_id: c_id, name: name, stat: "A", pay_mode_id: { $ne: pay_mode_id || 0 } });
        if (duplicate_mode) {
            return res.send({ status: "E", message: "A payment mode with this name already exists" });
        }
        if (!pay_mode_id) {
            let new_pay_mode_id = await UTILS.getNextId(dbobj, 'ob_payment_modes');
            await dbobj.collection('ob_payment_modes').insertOne({
                pay_mode_id: new_pay_mode_id, c_id: c_id, name: name, acc_group_code: acc_group_code, is_active: true, stat: "A"
            });
            return res.send({ status: "S", message: "Payment mode added", pay_mode_id: new_pay_mode_id });
        }
        await dbobj.collection('ob_payment_modes').updateOne(
            { c_id: c_id, pay_mode_id: pay_mode_id },
            { $set: { name: name, acc_group_code: acc_group_code, is_active: is_active !== false } });
        return res.send({ status: "S", message: "Payment mode updated", pay_mode_id: pay_mode_id });
    }
    catch (err) {
        return sendError(res, err, 'payment_mode_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
