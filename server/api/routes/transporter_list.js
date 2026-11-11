const express = require('express');
const router = express.Router();

const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let transporters = await dbobj.collection('ob_transporters').find(
            { c_id: c_id, stat: "A" }, { projection: { _id: 0 } }).sort({ name: 1 }).toArray();
        return res.send({ status: "S", data: transporters });
    }
    catch (err) {
        return sendError(res, err, 'transporter_list');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
