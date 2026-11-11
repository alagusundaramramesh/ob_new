const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Price lists with their fixed rates. list_type S (sales) or P (purchase) is optional */
router.post('/', async (req, res) => {
    const { c_id, list_type } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let query_parameter = { c_id: c_id, stat: "A" };
        if (list_type) {
            query_parameter.list_type = list_type;
        }
        let price_lists = await dbobj.collection('ob_price_lists').find(query_parameter, { projection: { _id: 0 } })
            .sort({ name: 1 }).toArray();
        return res.send({ status: "S", data: price_lists });
    }
    catch (err) {
        return sendError(res, err, 'price_list_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
