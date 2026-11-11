const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Chart of accounts. Customer and supplier accounts are hidden unless group_code is sent */
router.post('/', async (req, res) => {
    const { c_id, group_code, search } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let query_parameter = { c_id: c_id, stat: "A" };
        if (group_code) {
            query_parameter.group_code = group_code;
        } else if (!req.body.include_contacts) {
            query_parameter.group_code = { $nin: ['SD', 'SC'] };
        }
        if (search) {
            query_parameter.name = { $regex: UTILS.escapeRegex(search), $options: "i" };
        }

        let total_count = await dbobj.collection('ob_accounts').countDocuments(query_parameter);
        let accounts = await dbobj.collection('ob_accounts').find(query_parameter, { projection: { _id: 0 } })
            .sort({ group_code: 1, name: 1 }).skip(skip).limit(limit).toArray();

        let balance_map = await REPORT.getAccountBalances(dbobj, c_id, accounts.map(account => account.acc_id));
        let account_list = accounts.map(account => ({ ...account, balance: balance_map[account.acc_id] || 0 }));

        return res.send({ status: "S", data: account_list, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'account_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
