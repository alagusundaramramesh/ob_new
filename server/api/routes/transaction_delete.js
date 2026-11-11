const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const PERMISSION = require('../../classes/class.permission');
const TRANSACTION = require('../../classes/class.transaction');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, auth_role_id, trans_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, trans_id: trans_id, stat: "A" }, { projection: { trans_type: 1 } });
        if (!transaction) {
            return res.send({ status: "E", message: "Transaction not found" });
        }
        let mod_code = PERMISSION.TRANS_TYPE_MODULES[transaction.trans_type];
        if (!await PERMISSION.can(dbobj, c_id, auth_role_id, mod_code)) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        await TRANSACTION.remove(dbobj, company, trans_id);
        return res.send({ status: "S", message: "Transaction deleted" });
    }
    catch (err) {
        return sendError(res, err, 'transaction_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
