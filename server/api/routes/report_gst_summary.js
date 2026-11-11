const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const CONFIG = require('../../common/inc.config');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

/* MAIN SCRIPT STARTS */
/*
 * GST summary (GSTR-1 / GSTR-3B style): outward supplies and input tax credit grouped by tax type and rate.
 * Credit notes reduce the figures. This is a summary, the government JSON export is not part of this version.
 */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, c_id);
        let { from, to } = REPORT.getDateRange(req.body, company);

        let summarize = async (positive_types, negative_types) => {
            let tax_rows = await dbobj.collection('ob_transactions').aggregate([
                { $match: { c_id: c_id, stat: "A", trans_type: { $in: [...positive_types, ...negative_types] }, trans_date: { $gte: from, $lte: to } } },
                { $unwind: '$items' },
                { $unwind: '$items.taxes' },
                { $addFields: { sign: { $cond: [{ $in: ['$trans_type', negative_types] }, -1, 1] } } },
                {
                    $group: {
                        _id: { tax_type_code: '$items.taxes.tax_type_code', tax_rate: '$items.taxes.tax_rate' },
                        taxable_amount: { $sum: { $multiply: ['$items.taxable_amount', '$sign'] } },
                        tax_value: { $sum: { $multiply: ['$items.taxes.tax_value', '$sign'] } }
                    }
                },
                { $project: { _id: 0, tax_type_code: '$_id.tax_type_code', tax_rate: '$_id.tax_rate', taxable_amount: 1, tax_value: 1 } },
                { $sort: { tax_type_code: 1, tax_rate: 1 } }
            ]).toArray();
            return tax_rows.map(row => ({ ...row, taxable_amount: UTILS.round2(row.taxable_amount), tax_value: UTILS.round2(row.tax_value) }));
        };

        let outward = await summarize([TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE], [TT.SALES_CREDIT_NOTE]);
        let inward = await summarize([TT.PURCHASE_INVOICE], [TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE]);
        let output_tax = UTILS.round2(outward.reduce((sum, row) => sum + row.tax_value, 0));
        let input_tax = UTILS.round2(inward.reduce((sum, row) => sum + row.tax_value, 0));

        return res.send({
            status: "S",
            data: { from_date: from, to_date: to, outward: outward, inward: inward, output_tax: output_tax, input_tax: input_tax, net_tax_payable: UTILS.round2(output_tax - input_tax) }
        });
    }
    catch (err) {
        return sendError(res, err, 'report_gst_summary');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
