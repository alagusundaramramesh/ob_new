const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* MAIN SCRIPT STARTS */
/*
 * Pending invoices per customer (side R - receivables) or supplier (side P - payables) with aging.
 * Aging is counted from the due date (invoice date when there is no due date).
 */
router.post('/', async (req, res) => {
    const { c_id, side } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let is_receivable = side !== 'P';
        let trans_types = is_receivable ? [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE] : [TT.PURCHASE_INVOICE];
        let as_on_date = UTILS.toDate(req.body.as_on_date) || UTILS.toDate(new Date());

        let pending_invoices = await dbobj.collection('ob_transactions').find({
            c_id: c_id, stat: "A", trans_type: { $in: trans_types }, trans_date: { $lte: as_on_date },
            $expr: { $lt: ['$rec_amt', '$tot_amount'] }
        }, { projection: { _id: 0, trans_id: 1, trans_no: 1, trans_type: 1, trans_date: 1, due_date: 1, con_id: 1, con_name: 1, tot_amount: 1, rec_amt: 1 } })
            .sort({ trans_date: 1 }).toArray();

        let contact_map = {};
        pending_invoices.forEach(invoice => {
            let pending_amount = UTILS.round2(invoice.tot_amount - invoice.rec_amt);
            let aging_from = invoice.due_date || invoice.trans_date;
            let days_overdue = Math.floor((as_on_date.getTime() - new Date(aging_from).getTime()) / 86400000);
            let bucket = days_overdue <= 0 ? 'current' : days_overdue <= 30 ? 'days_1_30' : days_overdue <= 60 ? 'days_31_60' : days_overdue <= 90 ? 'days_61_90' : 'days_over_90';

            if (!contact_map[invoice.con_id]) {
                contact_map[invoice.con_id] = {
                    con_id: invoice.con_id, con_name: invoice.con_name || 'Cash customers', pending_amount: 0,
                    current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, invoices: []
                };
            }
            let contact_row = contact_map[invoice.con_id];
            contact_row.pending_amount = UTILS.round2(contact_row.pending_amount + pending_amount);
            contact_row[bucket] = UTILS.round2(contact_row[bucket] + pending_amount);
            contact_row.invoices.push({ ...invoice, pending_amount: pending_amount, days_overdue: Math.max(days_overdue, 0) });
        });

        let rows = Object.values(contact_map).sort((a, b) => b.pending_amount - a.pending_amount);
        let total_pending = UTILS.round2(rows.reduce((sum, row) => sum + row.pending_amount, 0));

        return res.send({ status: "S", data: { as_on_date: as_on_date, side: is_receivable ? 'R' : 'P', rows: rows, total_pending: total_pending } });
    }
    catch (err) {
        return sendError(res, err, 'report_outstanding');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
