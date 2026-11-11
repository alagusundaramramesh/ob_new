const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const REPORT = require('../../classes/class.report');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Customers (cs_type C) or suppliers (cs_type S) with their balance */
router.post('/', async (req, res) => {
    const { c_id, cs_type, search } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        if (cs_type !== 'C' && cs_type !== 'S') {
            return res.send({ status: "E", message: "cs_type must be C (customer) or S (supplier)" });
        }
        let query_parameter = { c_id: c_id, cs_type: cs_type, stat: "A" };
        if (req.body.is_active !== undefined) {
            query_parameter.is_active = !!req.body.is_active;
        }
        if (search) {
            let search_regex = { $regex: UTILS.escapeRegex(search), $options: "i" };
            query_parameter.$or = [{ name: search_regex }, { company: search_regex }, { phone: search_regex }, { email: search_regex }];
        }

        let total_count = await dbobj.collection('ob_contacts').countDocuments(query_parameter);
        let contacts = await dbobj.collection('ob_contacts').find(query_parameter, { projection: { _id: 0 } })
            .sort({ name: 1 }).skip(skip).limit(limit).toArray();

        let balance_map = await REPORT.getAccountBalances(dbobj, c_id, contacts.map(contact => contact.con_acc_id));
        let contact_list = contacts.map(contact => ({ ...contact, balance: balance_map[contact.con_acc_id] || 0 }));

        return res.send({ status: "S", data: contact_list, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'contact_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
