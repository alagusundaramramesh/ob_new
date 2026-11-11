const express = require('express');
const router = express.Router();
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let banks = await dbobj.collection('ob_banks').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ bank_name: 1 }).toArray();
        let balance_map = await REPORT.getAccountBalances(dbobj, c_id, banks.map(bank => bank.acc_id));
        let bank_list = banks.map(bank => ({ ...bank, balance: balance_map[bank.acc_id] || 0 }));
        return res.send({ status: "S", data: bank_list });
    }
    catch (err) {
        return sendError(res, err, 'bank_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
