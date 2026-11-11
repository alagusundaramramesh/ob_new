const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const EINVOICE = require('../../classes/class.einvoice');
const FORMATTER = require('../../classes/class.einvoice_formatter');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * Lists for the E-invoice screen. kind:
 *   einvoice_pending - invoices / notes to registered buyers that have no e-invoice yet
 *   einvoice_done    - documents that have an e-invoice
 *   ewb_pending      - invoices / challans of Rs. 50,000 or more without an active e-way bill
 *   ewb_done         - documents that have an e-way bill
 */
router.post('/', async (req, res) => {
    const { c_id, kind } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let query_parameter = { c_id: c_id, stat: "A" };
        if (kind === 'einvoice_pending') {
            query_parameter.trans_type = { $in: Object.keys(FORMATTER.DOC_TYPES) };
            query_parameter.trans_date = { $gte: FORMATTER.EINVOICE_START_DATE };
            query_parameter.einvoice = { $exists: false };
            query_parameter.con_tax_no = { $regex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' };
        } else if (kind === 'einvoice_done') {
            query_parameter.einvoice = { $exists: true };
        } else if (kind === 'ewb_pending') {
            query_parameter.trans_type = { $in: EINVOICE.EWB_TYPES };
            query_parameter.tot_amount = { $gte: EINVOICE.EWB_MIN_VALUE };
            query_parameter['ewb.status'] = { $ne: 'ACT' };
            query_parameter['items.item_type'] = 'P';
        } else if (kind === 'ewb_done') {
            query_parameter.ewb = { $exists: true };
        } else {
            return res.send({ status: "E", message: "kind must be einvoice_pending, einvoice_done, ewb_pending or ewb_done" });
        }

        let total_count = await dbobj.collection('ob_transactions').countDocuments(query_parameter);
        let documents = await dbobj.collection('ob_transactions').find(query_parameter, {
            projection: {
                _id: 0, trans_id: 1, trans_type: 1, trans_no: 1, trans_date: 1, con_name: 1, con_tax_no: 1, tot_amount: 1,
                'einvoice.irn': 1, 'einvoice.ack_no': 1, 'einvoice.status': 1, 'einvoice.provider': 1,
                'ewb.ewb_no': 1, 'ewb.status': 1, 'ewb.valid_till': 1, 'ewb.vehicle_no': 1, 'ewb.provider': 1
            }
        }).sort({ trans_date: -1, trans_id: -1 }).skip(skip).limit(limit).toArray();
        return res.send({ status: "S", data: documents, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'einvoice_worklist');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
