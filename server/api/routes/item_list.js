const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, search, category_id, type } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let query_parameter = { c_id: c_id, stat: "A" };
        if (category_id) {
            query_parameter.category_id = category_id;
        }
        if (type) {
            query_parameter.type = type; // P - product, S - service
        }
        if (req.body.is_active !== undefined) {
            query_parameter.is_active = !!req.body.is_active;
        }
        if (req.body.low_stock) {
            query_parameter.is_inventory = true;
            query_parameter.$expr = { $lte: ['$cur_stk', '$stk_level'] };
        }
        if (search) {
            let search_regex = { $regex: UTILS.escapeRegex(search), $options: "i" };
            query_parameter.$or = [{ name: search_regex }, { sku: search_regex }, { item_code: search_regex }];
        }

        let total_count = await dbobj.collection('ob_items').countDocuments(query_parameter);
        let items = await dbobj.collection('ob_items').find(query_parameter, { projection: { _id: 0 } })
            .sort({ name: 1 }).skip(skip).limit(limit).toArray();
        return res.send({ status: "S", data: items, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'item_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
