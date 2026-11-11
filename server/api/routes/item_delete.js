const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, item_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let item = await dbobj.collection('ob_items').findOne({ c_id: c_id, item_id: item_id, stat: "A" });
        if (!item) {
            return res.send({ status: "E", message: "Item not found" });
        }
        let used_in_transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, stat: "A", "items.item_id": item_id }, { projection: { trans_no: 1 } });
        if (used_in_transaction) {
            return res.send({ status: "E", message: `Item is used in ${used_in_transaction.trans_no}. Mark it inactive instead` });
        }
        await dbobj.collection('ob_items').updateOne({ c_id: c_id, item_id: item_id }, { $set: { stat: "D" } });
        await dbobj.collection('ob_stock_ledger').deleteMany({ c_id: c_id, item_id: item_id, trans_type: 'OP' });
        return res.send({ status: "S", message: "Item deleted" });
    }
    catch (err) {
        return sendError(res, err, 'item_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
