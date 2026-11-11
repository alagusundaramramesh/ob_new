const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let taxes = await dbobj.collection('ob_taxes').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ tax_id: 1 }).toArray();
        return res.send({ status: "S", data: taxes });
    }
    catch (err) {
        return sendError(res, err, 'tax_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
