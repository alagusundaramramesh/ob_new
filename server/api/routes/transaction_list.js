const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* List of one transaction type (invoices, bills, receipts ...) with filters and paging */
router.post('/', async (req, res) => {
    const { c_id, trans_type, con_id, search, status, from_date, to_date, pending_only } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        if (!trans_type) {
            return res.send({ status: "E", message: "Transaction type is required" });
        }
        let query_parameter = { c_id: c_id, trans_type: trans_type, stat: "A" };
        if (con_id) {
            query_parameter.con_id = con_id;
        }
        if (status) {
            query_parameter.status = status;
        }
        if (from_date || to_date) {
            query_parameter.trans_date = {};
            if (from_date) {
                query_parameter.trans_date.$gte = UTILS.toDate(from_date);
            }
            if (to_date) {
                query_parameter.trans_date.$lte = UTILS.toDate(to_date);
            }
        }
        if (pending_only) {
            // invoices which are not fully paid. Used by the receipt / payment screen
            query_parameter.$expr = { $lt: ['$rec_amt', '$tot_amount'] };
        }
        if (search) {
            let search_regex = { $regex: UTILS.escapeRegex(search), $options: "i" };
            query_parameter.$or = [{ trans_no: search_regex }, { con_name: search_regex }, { ref: search_regex }];
        }

        let total_count = await dbobj.collection('ob_transactions').countDocuments(query_parameter);
        let transactions = await dbobj.collection('ob_transactions').find(
            query_parameter,
            { projection: { _id: 0, items: 0, lines: 0, tax_summary: 0, payments: 0, allocations: 0 } }
        ).sort({ trans_date: -1, trans_id: -1 }).skip(skip).limit(limit).toArray();

        // Overdue is a result of the due date, it is not stored
        let today = UTILS.toDate(new Date());
        let transaction_list = transactions.map(transaction => ({
            ...transaction,
            is_overdue: !!transaction.due_date && transaction.due_date < today && transaction.rec_amt < transaction.tot_amount
        }));

        return res.send({ status: "S", data: transaction_list, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'transaction_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
