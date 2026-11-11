const express = require('express');
const router = express.Router();
const INVOICE_PDF = require('../../classes/class.invoice_pdf');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
/* Template, colour, footer, terms and bank details printed on the PDF of the documents */
router.post('/', async (req, res) => {
    const { c_id, template, accent_color, footer_text, terms, show_bank, bank_id, show_signature } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!INVOICE_PDF.TEMPLATES.includes(template)) {
            return res.send({ status: "E", message: "Choose classic, modern or compact" });
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(accent_color || '')) {
            return res.send({ status: "E", message: "Colour must look like #0d6efd" });
        }
        if (bank_id) {
            let bank = await dbobj.collection('ob_banks').findOne({ c_id: c_id, bank_id: bank_id, stat: "A" });
            if (!bank) {
                return res.send({ status: "E", message: "Bank not found" });
            }
        }
        let print_settings = {
            template: template,
            accent_color: accent_color,
            footer_text: String(footer_text || '').slice(0, 120),
            terms: String(terms || '').slice(0, 1000),
            show_bank: !!show_bank,
            bank_id: bank_id || 0,
            show_signature: show_signature !== false
        };
        await dbobj.collection('ob_companies').updateOne({ c_id: c_id }, { $set: { print_settings: print_settings } });
        return res.send({ status: "S", message: "Print settings saved", data: print_settings });
    }
    catch (err) {
        return sendError(res, err, 'print_settings_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
