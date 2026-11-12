const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const GSTR2B = require('../../classes/class.gstr2b');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Reconciles the purchases with a GSTR-2B file: body.month = "2026-11", body.gstr2b = the JSON downloaded from the GST portal */
router.post('/', async (req, res) => {
    const { c_id, month, gstr2b } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!gstr2b || typeof gstr2b !== 'object') {
            return res.send({ status: "E", message: "Choose the GSTR-2B JSON file" });
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        let reconciliation = await GSTR2B.reconcile(dbobj, company, month, gstr2b);
        return res.send({ status: "S", data: reconciliation });
    }
    catch (err) {
        return sendError(res, err, 'report_gstr2b');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
