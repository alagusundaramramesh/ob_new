const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, category_id, name, parent_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name) {
            return res.send({ status: "E", message: "Category name is required" });
        }
        if (parent_id) {
            if (parent_id === category_id) {
                return res.send({ status: "E", message: "A category can not be its own parent" });
            }
            let parent_category = await dbobj.collection('ob_categories').findOne({ c_id: c_id, category_id: parent_id, stat: "A" });
            if (!parent_category) {
                return res.send({ status: "E", message: "Parent category not found" });
            }
        }
        let duplicate_category = await dbobj.collection('ob_categories').findOne(
            { c_id: c_id, name: name, parent_id: parent_id || 0, stat: "A", category_id: { $ne: category_id || 0 } });
        if (duplicate_category) {
            return res.send({ status: "E", message: "A category with this name already exists" });
        }

        if (!category_id) {
            let new_category_id = await UTILS.getNextId(dbobj, 'ob_categories');
            await dbobj.collection('ob_categories').insertOne({
                category_id: new_category_id, c_id: c_id, name: name, parent_id: parent_id || 0, stat: "A", crd_on: new Date()
            });
            return res.send({ status: "S", message: "Category added", category_id: new_category_id });
        }
        await dbobj.collection('ob_categories').updateOne(
            { c_id: c_id, category_id: category_id }, { $set: { name: name, parent_id: parent_id || 0 } });
        return res.send({ status: "S", message: "Category updated", category_id: category_id });
    }
    catch (err) {
        return sendError(res, err, 'category_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
