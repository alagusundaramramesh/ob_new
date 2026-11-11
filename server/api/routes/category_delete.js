const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, category_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let has_children = await dbobj.collection('ob_categories').findOne({ c_id: c_id, parent_id: category_id, stat: "A" });
        if (has_children) {
            return res.send({ status: "E", message: "Delete the sub categories first" });
        }
        let has_items = await dbobj.collection('ob_items').findOne({ c_id: c_id, category_id: category_id, stat: "A" });
        if (has_items) {
            return res.send({ status: "E", message: "This category has items" });
        }
        await dbobj.collection('ob_categories').updateOne({ c_id: c_id, category_id: category_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Category deleted" });
    }
    catch (err) {
        return sendError(res, err, 'category_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
