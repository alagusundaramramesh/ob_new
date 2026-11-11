const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const INVOICE_PDF = require('../../classes/class.invoice_pdf');
const { sendError } = require('../../utils/util.error');

const MAX_LOGO_BYTES = 500 * 1024;

/* MAIN SCRIPT STARTS */
/* The logo comes as a data url ("data:image/png;base64,...") in the JSON body. Only PNG and JPEG are accepted (the PDF library needs them) */
router.post('/', async (req, res) => {
    const { c_id, logo_data } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        let match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(logo_data || '');
        if (!match) {
            return res.send({ status: "E", message: "Choose a PNG or JPEG image" });
        }
        let image_buffer = Buffer.from(match[2], 'base64');
        if (image_buffer.length > MAX_LOGO_BYTES) {
            return res.send({ status: "E", message: "The logo must be smaller than 500 KB" });
        }
        // The real type is decided by the first bytes of the file, not by what the client says
        let is_png = image_buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        let is_jpeg = image_buffer[0] === 0xff && image_buffer[1] === 0xd8;
        if (!is_png && !is_jpeg) {
            return res.send({ status: "E", message: "The file is not a valid PNG or JPEG image" });
        }

        fs.mkdirSync(INVOICE_PDF.LOGO_FOLDER, { recursive: true });
        let logo_file = `logo_${c_id}_${Date.now()}.${is_png ? 'png' : 'jpg'}`;
        fs.writeFileSync(path.join(INVOICE_PDF.LOGO_FOLDER, logo_file), image_buffer);

        let company = await dbobj.collection('ob_companies').findOne({ c_id: c_id }, { projection: { logo_file: 1 } });
        await dbobj.collection('ob_companies').updateOne({ c_id: c_id }, { $set: { logo_file: logo_file } });
        if (company.logo_file) {
            fs.rm(path.join(INVOICE_PDF.LOGO_FOLDER, path.basename(company.logo_file)), { force: true }, () => { });
        }
        return res.send({ status: "S", message: "Logo saved", logo_file: logo_file });
    }
    catch (err) {
        return sendError(res, err, 'company_logo_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
