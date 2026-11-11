const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Payment modes and the bank / cash accounts a receipt can be deposited to */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let payment_modes = await dbobj.collection('ob_payment_modes').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ pay_mode_id: 1 }).toArray();
        let payment_accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, stat: "A", group_code: { $in: ['BA', 'CH'] } },
            { projection: { _id: 0, acc_id: 1, name: 1, group_code: 1 } }).sort({ name: 1 }).toArray();
        return res.send({ status: "S", data: payment_modes, accounts: payment_accounts });
    }
    catch (err) {
        return sendError(res, err, 'payment_mode_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
