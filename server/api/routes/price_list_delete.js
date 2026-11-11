const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, price_list_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let used_by_contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, price_list_id: price_list_id, stat: "A" });
        if (used_by_contact) {
            return res.send({ status: "E", message: `Used by ${used_by_contact.name}. Change the contact first` });
        }
        await dbobj.collection('ob_price_lists').updateOne({ c_id: c_id, price_list_id: price_list_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Price list deleted" });
    }
    catch (err) {
        return sendError(res, err, 'price_list_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
