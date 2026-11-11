const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const TRANSACTION = require('../../classes/class.transaction');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/*
 * One endpoint for every transaction type. The rules for each type (tax, ledger entries, stock, allocation)
 * are in classes/class.transaction.js
 */
router.post('/', async (req, res) => {
    const input = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await UTILS.getCompany(dbobj, input.c_id);
        if (!company) {
            return res.send({ status: "E", message: "Company not found" });
        }
        let saved_trans = await TRANSACTION.save(dbobj, company, input, input.auth_email);
        return res.send({
            status: "S",
            message: input.trans_id ? "Transaction updated" : "Transaction saved",
            data: { trans_id: saved_trans.trans_id, trans_no: saved_trans.trans_no, tot_amount: saved_trans.tot_amount, status: saved_trans.status }
        });
    }
    catch (err) {
        return sendError(res, err, 'transaction_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
