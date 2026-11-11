const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Stock movement of one item with a running quantity */
router.post('/', async (req, res) => {
    const { c_id, item_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let item = await dbobj.collection('ob_items').findOne(
            { c_id: c_id, item_id: item_id, stat: "A" }, { projection: { _id: 0, item_id: 1, name: 1, uom: 1, cur_stk: 1 } });
        if (!item) {
            return res.send({ status: "E", message: "Item not found" });
        }

        let before = await dbobj.collection('ob_stock_ledger').aggregate([
            { $match: { c_id: c_id, item_id: item_id, trans_date: { $lt: from } } },
            { $group: { _id: null, qty: { $sum: { $subtract: ['$qty_in', '$qty_out'] } } } }
        ]).toArray();
        let opening_qty = before.length ? before[0].qty : 0;

        let moves = await dbobj.collection('ob_stock_ledger').find(
            { c_id: c_id, item_id: item_id, trans_date: { $gte: from, $lte: to } }, { projection: { _id: 0 } }
        ).sort({ trans_date: 1, trans_id: 1 }).toArray();

        let running_qty = opening_qty;
        let rows = moves.map(move => {
            running_qty = UTILS.round2(running_qty + move.qty_in - move.qty_out);
            return { ...move, balance: running_qty };
        });
        return res.send({ status: "S", data: { item: item, from_date: from, to_date: to, opening_qty: opening_qty, rows: rows, closing_qty: running_qty } });
    }
    catch (err) {
        return sendError(res, err, 'report_stock_ledger');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
