const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Quantity and value of every stock item on a date */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let as_on_date = UTILS.toDate(req.body.as_on_date) || UTILS.toDate(new Date());
        // MASTER = quantity x purchase rate of the item (default), FIFO = oldest purchases go out first, AVERAGE = weighted average cost
        let method = req.body.method || 'MASTER';
        if (!['MASTER', 'FIFO', 'AVERAGE'].includes(method)) {
            return res.send({ status: "E", message: "method must be MASTER, FIFO or AVERAGE" });
        }
        let stock_position = await REPORT.getStockPosition(dbobj, c_id, as_on_date, method);
        let rows = req.body.hide_zero ? stock_position.filter(item => item.qty) : stock_position;
        let total_value = UTILS.round2(rows.reduce((sum, item) => sum + item.value, 0));
        return res.send({ status: "S", data: { as_on_date: as_on_date, method: method, rows: rows, total_value: total_value } });
    }
    catch (err) {
        return sendError(res, err, 'report_stock_summary');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
