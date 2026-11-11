const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const PERMISSION = require('../../classes/class.permission');
const TRANSACTION = require('../../classes/class.transaction');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* Which document can be created from which (PHP: the "Convert to" / transaction reference feature) */
const CONVERT_RULES = {
    [TT.ESTIMATE]: [TT.SALES_ORDER, TT.SALES_INVOICE],
    [TT.SALES_ORDER]: [TT.DELIVERY_CHALLAN, TT.SALES_INVOICE],
    [TT.DELIVERY_CHALLAN]: [TT.SALES_INVOICE],
    [TT.SALES_INVOICE]: [TT.SALES_CREDIT_NOTE, TT.SALES_DEBIT_NOTE],
    [TT.PURCHASE_QUOTE]: [TT.PURCHASE_ORDER, TT.PURCHASE_INVOICE],
    [TT.PURCHASE_ORDER]: [TT.GOODS_RECEIPT, TT.PURCHASE_INVOICE],
    [TT.GOODS_RECEIPT]: [TT.PURCHASE_INVOICE],
    [TT.PURCHASE_INVOICE]: [TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE],
};

/* MAIN SCRIPT STARTS */
/* Creates a new document from an existing one (items are copied, ref_id points back to the source) */
router.post('/', async (req, res) => {
    const { c_id, auth_role_id, auth_email, trans_id, target_trans_type, trans_date } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let source_trans = await dbobj.collection('ob_transactions').findOne({ c_id: c_id, trans_id: trans_id, stat: "A" });
        if (!source_trans) {
            return res.send({ status: "E", message: "Transaction not found" });
        }
        let allowed_targets = CONVERT_RULES[source_trans.trans_type] || [];
        if (!allowed_targets.includes(target_trans_type)) {
            return res.send({ status: "E", message: "This document can not be converted to the selected type" });
        }
        if (!await PERMISSION.can(dbobj, c_id, auth_role_id, PERMISSION.TRANS_TYPE_MODULES[target_trans_type])) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }

        let company = await UTILS.getCompany(dbobj, c_id);
        let new_trans_input = TRANSACTION.copyInput(source_trans, target_trans_type, trans_date || new Date());
        let new_trans = await TRANSACTION.save(dbobj, company, new_trans_input, auth_email);
        return res.send({ status: "S", message: "Document created", data: { trans_id: new_trans.trans_id, trans_no: new_trans.trans_no } });
    }
    catch (err) {
        return sendError(res, err, 'transaction_convert');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
