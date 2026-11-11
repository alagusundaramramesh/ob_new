const express = require('express');
const router = express.Router();

const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, tp_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        await dbobj.collection('ob_transporters').updateOne({ c_id: c_id, tp_id: tp_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Transporter deleted" });
    }
    catch (err) {
        return sendError(res, err, 'transporter_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
