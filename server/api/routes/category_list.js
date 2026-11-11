const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Flat list. parent_id links a category to its parent, the client builds the tree */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let categories = await dbobj.collection('ob_categories').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
        return res.send({ status: "S", data: categories });
    }
    catch (err) {
        return sendError(res, err, 'category_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
