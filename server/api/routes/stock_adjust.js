const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Stock journal: qty > 0 adds stock, qty < 0 removes stock (damage, count correction ...) */
router.post('/', async (req, res) => {
    const { c_id, item_id, qty, trans_date, notes } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let adjust_qty = Number(qty);
        if (!adjust_qty) {
            return res.send({ status: "E", message: "Quantity is required" });
        }
        let adjust_date = UTILS.toDate(trans_date);
        if (!adjust_date) {
            return res.send({ status: "E", message: "Date is required" });
        }
        let item = await dbobj.collection('ob_items').findOne({ c_id: c_id, item_id: item_id, stat: "A" });
        if (!item) {
            return res.send({ status: "E", message: "Item not found" });
        }
        if (!item.is_inventory) {
            return res.send({ status: "E", message: "This item does not have stock" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        if (company.allow_negative_stock === false && item.cur_stk + adjust_qty < 0) {
            return res.send({ status: "E", message: `Insufficient stock for ${item.name}` });
        }

        await dbobj.collection('ob_stock_ledger').insertOne({
            trans_id: 0, c_id: c_id, trans_type: 'ST', trans_no: notes || 'Stock adjustment', trans_date: adjust_date,
            item_id: item_id, qty_in: adjust_qty > 0 ? adjust_qty : 0, qty_out: adjust_qty < 0 ? -adjust_qty : 0,
            rate: item.purchase_rate, loc_id: 0
        });
        await dbobj.collection('ob_items').updateOne({ c_id: c_id, item_id: item_id }, { $inc: { cur_stk: adjust_qty } });
        return res.send({ status: "S", message: "Stock updated", cur_stk: item.cur_stk + adjust_qty });
    }
    catch (err) {
        return sendError(res, err, 'stock_adjust');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
