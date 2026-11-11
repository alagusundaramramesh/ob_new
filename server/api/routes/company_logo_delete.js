const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const INVOICE_PDF = require('../../classes/class.invoice_pdf');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let company = await dbobj.collection('ob_companies').findOne({ c_id: c_id }, { projection: { logo_file: 1 } });
        if (company.logo_file) {
            fs.rm(path.join(INVOICE_PDF.LOGO_FOLDER, path.basename(company.logo_file)), { force: true }, () => { });
        }
        await dbobj.collection('ob_companies').updateOne({ c_id: c_id }, { $set: { logo_file: '' } });
        return res.send({ status: "S", message: "Logo removed" });
    }
    catch (err) {
        return sendError(res, err, 'company_logo_delete');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
