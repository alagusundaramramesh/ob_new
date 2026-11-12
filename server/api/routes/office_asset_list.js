const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, search, category, status } = req.body;
    let dbobj = res.locals.dbobj;
    let { page, limit, skip } = UTILS.getPaging(req.body);
    try {
        let query_parameter = { c_id: c_id, stat: "A" };
        if (category) {
            query_parameter.category = category;
        }
        if (status) {
            query_parameter.status = status;
        }
        if (search) {
            let search_regex = { $regex: UTILS.escapeRegex(search), $options: "i" };
            query_parameter.$or = [{ name: search_regex }, { asset_tag: search_regex }, { serial_no: search_regex },
                { current_holder: search_regex }, { last_user: search_regex }];
        }

        let total_count = await dbobj.collection('ob_office_assets').countDocuments(query_parameter);
        let assets = await dbobj.collection('ob_office_assets').find(query_parameter, { projection: { _id: 0 } })
            .sort({ asset_tag: 1 }).skip(skip).limit(limit).toArray();
        return res.send({ status: "S", data: assets, total_count: total_count, page: page, limit: limit });
    }
    catch (err) {
        return sendError(res, err, 'office_asset_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
