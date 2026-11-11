const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, tax_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let used_by_item = await dbobj.collection('ob_items').findOne({ c_id: c_id, tax_id: tax_id, stat: "A" });
        if (used_by_item) {
            return res.send({ status: "E", message: `Tax is used by item ${used_by_item.name}` });
        }
        let used_in_transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, stat: "A", "items.tax_id": tax_id }, { projection: { trans_no: 1 } });
        if (used_in_transaction) {
            return res.send({ status: "E", message: `Tax is used in ${used_in_transaction.trans_no}` });
        }
        await dbobj.collection('ob_taxes').updateOne({ c_id: c_id, tax_id: tax_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Tax deleted" });
    }
    catch (err) {
        return sendError(res, err, 'tax_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
