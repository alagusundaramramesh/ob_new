const express = require('express');
const router = express.Router();
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, con_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: con_id, stat: "A" });
        if (!contact) {
            return res.send({ status: "E", message: "Contact not found" });
        }
        let has_transactions = await dbobj.collection('ob_transactions').findOne({ c_id: c_id, con_id: con_id, stat: "A" });
        if (has_transactions) {
            return res.send({ status: "E", message: "This contact has transactions. Mark it inactive instead" });
        }
        await dbobj.collection('ob_contacts').updateOne({ c_id: c_id, con_id: con_id }, { $set: { stat: "D" } });
        await dbobj.collection('ob_accounts').updateOne({ c_id: c_id, acc_id: contact.con_acc_id }, { $set: { stat: "D" } });
        return res.send({ status: "S", message: "Contact deleted" });
    }
    catch (err) {
        return sendError(res, err, 'contact_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
