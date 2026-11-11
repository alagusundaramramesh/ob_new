const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, item_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let item = await dbobj.collection('ob_items').findOne({ c_id: c_id, item_id: item_id, stat: "A" }, { projection: { _id: 0 } });
        if (!item) {
            return res.send({ status: "E", message: "Item not found" });
        }
        let recent_stock_moves = await dbobj.collection('ob_stock_ledger').find(
            { c_id: c_id, item_id: item_id }, { projection: { _id: 0 } }
        ).sort({ trans_date: -1, trans_id: -1 }).limit(20).toArray();
        return res.send({ status: "S", data: { ...item, recent_stock_moves: recent_stock_moves } });
    }
    catch (err) {
        return sendError(res, err, 'item_details');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
