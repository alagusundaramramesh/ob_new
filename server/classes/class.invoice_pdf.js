const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const { BusinessError } = require('../utils/util.error');

const LOGO_FOLDER = path.join(__dirname, '../uploads/logos');

const DOCUMENT_TITLES = {
    SE: 'Quote', SO: 'Sales Order', SH: 'Delivery Challan', SI: 'Tax Invoice', SR: 'Retail Invoice', SC: 'Credit Note',
    SD: 'Debit Note', SP: 'Receipt', PQ: 'Purchase Quote', PO: 'Purchase Order', GR: 'Goods Receipt', PI: 'Purchase Bill',
    PC: 'Supplier Credit Note', PD: 'Supplier Debit Note', PP: 'Payment Voucher', J: 'Journal Voucher', JC: 'Contra Voucher'
};

/* Print settings of a company (company.print_settings). These values are used when nothing is saved yet */
const DEFAULT_PRINT_SETTINGS = {
    template: 'classic', // classic | modern | compact
    accent_color: '#0d6efd',
    footer_text: '',
    terms: '',
    show_bank: false,
    bank_id: 0,
    show_signature: true
};
const TEMPLATES = ['classic', 'modern', 'compact'];

// Helvetica has no rupee sign, so amounts are written with "Rs."
function money(value) {
    return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateText(value) {
    return value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

/* Builds the PDF of a transaction (invoice, bill, receipt, journal ...) */
class InvoicePdf {

    getPrintSettings(company) {
        return { ...DEFAULT_PRINT_SETTINGS, ...(company.print_settings || {}) };
    }

    /* Loads everything the PDF needs. Throws BusinessError when the document does not exist */
    async load(dbobj, c_id, trans_id) {
        let transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, trans_id: trans_id, stat: CONFIG.STAT_ACTIVE }, { projection: { _id: 0 } });
        if (!transaction) {
            throw new BusinessError('Transaction not found', 'TRANS_NOT_FOUND');
        }
        let company = await UTILS.getCompany(dbobj, c_id);
        let contact = transaction.con_id
            ? await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: transaction.con_id }, { projection: { _id: 0 } })
            : null;

        // Bank details printed on the document (print setting "show bank")
        let print_settings = this.getPrintSettings(company);
        if (print_settings.show_bank) {
            let bank_query = { c_id: c_id, stat: CONFIG.STAT_ACTIVE };
            if (print_settings.bank_id) {
                bank_query.bank_id = print_settings.bank_id;
            }
            company.print_bank = await dbobj.collection('ob_banks').findOne(bank_query, { projection: { _id: 0 } });
        }
        return { transaction, company, contact };
    }

    /* { acc_id: name } for the lines of a journal (other documents do not need it) */
    async getAccountNames(dbobj, c_id, transaction) {
        if (!transaction.lines) {
            return {};
        }
        let acc_ids = transaction.lines.map(line => line.acc_id);
        let accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, acc_id: { $in: acc_ids } }, { projection: { acc_id: 1, name: 1 } }).toArray();
        let account_names = {};
        accounts.forEach(account => { account_names[account.acc_id] = account.name; });
        return account_names;
    }

    getFileName(transaction) {
        return `${DOCUMENT_TITLES[transaction.trans_type] || 'Document'}-${transaction.trans_no}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
    }

    /* Full path of the logo file of the company, '' when there is none */
    getLogoPath(company) {
        if (!company.logo_file) {
            return '';
        }
        let logo_path = path.join(LOGO_FOLDER, path.basename(company.logo_file));
        return fs.existsSync(logo_path) ? logo_path : '';
    }

    /* Returns a Promise of a Buffer */
    async build(transaction, company, contact, accounts) {
        // The signed QR code of the IRP is printed on an invoice that has an active e-invoice
        let einvoice = transaction.einvoice && transaction.einvoice.status === 'ACT' ? transaction.einvoice : null;
        let qr_buffer = einvoice ? await QRCode.toBuffer(einvoice.signed_qr, { margin: 1, width: 240, errorCorrectionLevel: 'L' }) : null;

        return new Promise((resolve, reject) => {
            let settings = this.getPrintSettings(company);
            let is_compact = settings.template === 'compact';
            // theme: everything that differs between the templates
            let theme = {
                settings: settings,
                accent: /^#[0-9a-fA-F]{6}$/.test(settings.accent_color) ? settings.accent_color : DEFAULT_PRINT_SETTINGS.accent_color,
                is_modern: settings.template === 'modern',
                body_size: is_compact ? 7.5 : 8.5,
                row_height: is_compact ? 13 : 16
            };

            let pdf = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
            let chunks = [];
            pdf.on('data', chunk => chunks.push(chunk));
            pdf.on('end', () => resolve(Buffer.concat(chunks)));
            pdf.on('error', reject);

            this.drawHeader(pdf, transaction, company, theme);
            if (transaction.items) {
                this.drawParty(pdf, transaction, contact);
                this.drawItems(pdf, transaction, theme);
                this.drawTotals(pdf, transaction);
                this.drawEinvoice(pdf, transaction, qr_buffer);
            } else if (transaction.lines) {
                this.drawJournal(pdf, transaction, accounts, theme);
            } else {
                this.drawParty(pdf, transaction, contact);
                this.drawReceipt(pdf, transaction);
            }
            if (transaction.notes) {
                pdf.moveDown().font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Notes', 40);
                pdf.font('Helvetica').text(transaction.notes);
            }
            this.drawBankAndTerms(pdf, company, settings);
            this.drawFooter(pdf, settings, theme);
            pdf.end();
        });
    }

    drawHeader(pdf, transaction, company, theme) {
        let title = (DOCUMENT_TITLES[transaction.trans_type] || 'Document').toUpperCase();
        let text_color = theme.is_modern ? '#ffffff' : '#000000';
        let muted_color = theme.is_modern ? '#e8f0ff' : '#444444';
        if (theme.is_modern) {
            pdf.rect(0, 0, 595, 112).fill(theme.accent);
        }

        // Logo on the left, company text next to it
        let text_x = 40;
        let logo_path = this.getLogoPath(company);
        if (logo_path) {
            try {
                pdf.image(logo_path, 40, 36, { fit: [64, 64] });
                text_x = 114;
            } catch (error) {
                console.error('Logo could not be drawn', error.message); // a broken image must not stop the PDF
            }
        }
        pdf.font('Helvetica-Bold').fontSize(16).fillColor(text_color).text(company.name, text_x, 40, { width: 270 });
        pdf.font('Helvetica').fontSize(9).fillColor(muted_color);
        let address = [company.address1, company.address2, company.city, company.zip].filter(Boolean).join(', ');
        if (address) pdf.text(address, text_x, undefined, { width: 270 });
        if (company.tax_no) pdf.text(`GSTIN: ${company.tax_no}`, text_x);
        if (company.phone || company.email) pdf.text([company.phone, company.email].filter(Boolean).join('  |  '), text_x);

        pdf.fillColor(theme.is_modern ? '#ffffff' : theme.accent).font('Helvetica-Bold').fontSize(18)
            .text(title, 330, 40, { width: 225, align: 'right' });
        pdf.fillColor(text_color).font('Helvetica').fontSize(10)
            .text(`No: ${transaction.trans_no}`, 330, 66, { width: 225, align: 'right' })
            .text(`Date: ${dateText(transaction.trans_date)}`, { width: 225, align: 'right' });
        if (transaction.due_date) pdf.text(`Due: ${dateText(transaction.due_date)}`, { width: 225, align: 'right' });
        if (transaction.ref) pdf.text(`Ref: ${transaction.ref}`, { width: 225, align: 'right' });

        if (!theme.is_modern) {
            pdf.moveTo(40, 120).lineTo(555, 120).strokeColor(theme.accent).stroke();
        }
        pdf.fillColor('#000000');
        pdf.y = 130;
        pdf.x = 40;
    }

    drawParty(pdf, transaction, contact) {
        let is_sales = transaction.trans_type.startsWith('S');
        pdf.font('Helvetica-Bold').fontSize(8).fillColor('#666666').text(is_sales ? 'BILL TO' : 'SUPPLIER', 40, pdf.y);
        pdf.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(transaction.con_name || 'Cash customer');
        pdf.font('Helvetica').fontSize(9);
        if (contact && contact.addresses && contact.addresses[0]) {
            let address = contact.addresses[0];
            pdf.text([address.address1, address.address2, address.city, address.zip].filter(Boolean).join(', '));
        }
        if (transaction.con_tax_no) pdf.text(`GSTIN: ${transaction.con_tax_no}`);
        if (transaction.dst_state_code) pdf.text(`Place of supply (state code): ${transaction.dst_state_code}`);
        pdf.moveDown();
    }

    /* A row of cells at fixed x positions. columns: [{ x, width, align }] */
    drawRow(pdf, y, columns, values, font, size) {
        pdf.font(font).fontSize(size);
        columns.forEach((column, index) => {
            pdf.text(String(values[index]), column.x, y, { width: column.width, align: column.align || 'left' });
        });
    }

    drawItems(pdf, transaction, theme) {
        let columns = [
            { x: 40, width: 18 }, { x: 60, width: 150 }, { x: 212, width: 45 }, { x: 259, width: 50, align: 'right' },
            { x: 311, width: 60, align: 'right' }, { x: 373, width: 65, align: 'right' }, { x: 440, width: 50, align: 'right' },
            { x: 492, width: 63, align: 'right' }
        ];
        let y = pdf.y;
        pdf.rect(40, y - 3, 515, 16).fill(theme.is_modern ? theme.accent : '#eeeeee');
        pdf.fillColor(theme.is_modern ? '#ffffff' : '#000000');
        this.drawRow(pdf, y, columns, ['#', 'Item', 'HSN', 'Qty', 'Rate', 'Taxable', 'Tax %', 'Amount'], 'Helvetica-Bold', theme.body_size);
        pdf.fillColor('#000000');
        y += theme.row_height + 2;

        transaction.items.forEach((item, index) => {
            if (y > 740) {
                pdf.addPage();
                y = 40;
            }
            let tax_rate = item.taxes.reduce((sum, tax) => sum + tax.tax_rate, 0);
            this.drawRow(pdf, y, columns,
                [index + 1, item.item_name, item.hs, `${item.qty} ${item.unit || ''}`, money(item.rate), money(item.taxable_amount), tax_rate, money(item.item_total)],
                'Helvetica', theme.body_size);
            y += item.item_name.length > 30 ? theme.row_height + 10 : theme.row_height;
        });
        pdf.moveTo(40, y).lineTo(555, y).strokeColor('#999999').stroke();
        pdf.y = y + 8;
    }

    drawTotals(pdf, transaction) {
        let lines = [['Taxable amount', money(transaction.taxable_amount)]];
        transaction.tax_summary.forEach(tax => lines.push([`${tax.tax_type_code} @ ${tax.tax_rate}%`, money(tax.tax_value)]));
        if (transaction.round_amount) lines.push(['Round off', money(transaction.round_amount)]);
        lines.push(['TOTAL (Rs.)', money(transaction.tot_amount)]);
        if (transaction.inline_paid !== undefined && ['SI', 'SR', 'SD', 'PI'].includes(transaction.trans_type)) {
            lines.push(['Received / paid', money(transaction.rec_amt)]);
            lines.push(['Balance due', money(transaction.tot_amount - transaction.rec_amt)]);
        }
        let y = pdf.y;
        if (y + lines.length * 16 > 700) {
            pdf.addPage();
            y = 40;
        }
        lines.forEach((line) => {
            let font = line[0].startsWith('TOTAL') || line[0] === 'Balance due' ? 'Helvetica-Bold' : 'Helvetica';
            pdf.font(font).fontSize(10).fillColor('#000000').text(line[0], 330, y, { width: 130 }).text(line[1], 460, y, { width: 95, align: 'right' });
            y += 16;
        });
        pdf.x = 40;
        pdf.y = y + 8;
    }

    /* IRN, acknowledgement and QR code of the e-invoice, and the e-way bill number */
    drawEinvoice(pdf, transaction, qr_buffer) {
        let einvoice = transaction.einvoice && transaction.einvoice.status === 'ACT' ? transaction.einvoice : null;
        let ewb = transaction.ewb && transaction.ewb.status === 'ACT' ? transaction.ewb : null;
        if (!einvoice && !ewb) {
            return;
        }
        if (pdf.y > 640) {
            pdf.addPage();
        }
        let y = pdf.y + 4;
        let is_test = (einvoice && einvoice.provider === 'mock') || (ewb && ewb.provider === 'mock');
        if (is_test) {
            // Made by the test provider: it must never be taken as a real e-invoice
            pdf.font('Helvetica-Bold').fontSize(9).fillColor('#c0392b')
                .text('TEST DOCUMENT - NOT REGISTERED WITH THE IRP / E-WAY BILL PORTAL', 40, y, { width: 515 });
            y += 14;
        }
        pdf.fillColor('#000000');
        let text_x = 40;
        if (qr_buffer) {
            pdf.image(qr_buffer, 40, y, { fit: [88, 88] });
            text_x = 138;
        }
        pdf.font('Helvetica').fontSize(8);
        let text_y = y;
        if (einvoice) {
            pdf.font('Helvetica-Bold').text('IRN', text_x, text_y).font('Helvetica').text(einvoice.irn, text_x, text_y + 10, { width: 417 });
            text_y += 34;
            pdf.text(`Ack No: ${einvoice.ack_no}     Ack Date: ${einvoice.ack_dt}`, text_x, text_y);
            text_y += 14;
        }
        if (ewb) {
            pdf.font('Helvetica-Bold').text(`E-way bill no: ${ewb.ewb_no}`, text_x, text_y).font('Helvetica')
                .text(`Generated: ${ewb.ewb_dt}     Valid till: ${ewb.valid_till}${ewb.vehicle_no ? `     Vehicle: ${ewb.vehicle_no}` : ''}`, text_x, text_y + 11, { width: 417 });
            text_y += 28;
        }
        pdf.x = 40;
        pdf.y = Math.max(y + (qr_buffer ? 92 : 0), text_y) + 4;
    }

    drawReceipt(pdf, transaction) {
        pdf.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text(`Amount: Rs. ${money(transaction.tot_amount)}`, 40);
        pdf.font('Helvetica').fontSize(10);
        if (transaction.tds_amount) pdf.text(`TDS deducted: Rs. ${money(transaction.tds_amount)}`);
        if (transaction.pay_ref) pdf.text(`Reference: ${transaction.pay_ref}`);
    }

    drawJournal(pdf, transaction, accounts, theme) {
        let y = pdf.y;
        let columns = [{ x: 40, width: 260 }, { x: 305, width: 100, align: 'right' }, { x: 410, width: 100, align: 'right' }];
        this.drawRow(pdf, y, columns, ['Account', 'Debit', 'Credit'], 'Helvetica-Bold', theme.body_size + 1);
        y += 18;
        transaction.lines.forEach(line => {
            this.drawRow(pdf, y, columns, [accounts[line.acc_id] || line.acc_id, line.debit ? money(line.debit) : '', line.credit ? money(line.credit) : ''], 'Helvetica', theme.body_size + 1);
            y += theme.row_height;
        });
        pdf.y = y + 8;
        pdf.x = 40;
    }

    /* Bank details and terms below the totals */
    drawBankAndTerms(pdf, company, settings) {
        let bank = company.print_bank;
        if (!bank && !settings.terms) {
            return;
        }
        if (pdf.y > 690) {
            pdf.addPage();
        }
        pdf.x = 40;
        pdf.moveDown(0.5);
        if (bank) {
            pdf.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Bank details', 40);
            pdf.font('Helvetica').fontSize(8.5)
                .text(`${bank.bank_name}, ${bank.branch_name || ''}`.replace(/, $/, ''))
                .text(`A/c name: ${bank.acc_name}   A/c no: ${bank.acc_number}   IFSC: ${bank.ifsc_code || ''}`);
            if (bank.upi_id) pdf.text(`UPI: ${bank.upi_id}`);
            pdf.moveDown(0.5);
        }
        if (settings.terms) {
            pdf.font('Helvetica-Bold').fontSize(9).text('Terms and conditions', 40);
            pdf.font('Helvetica').fontSize(8.5).text(settings.terms, 40, undefined, { width: 515 });
        }
    }

    /* Signature line and footer text at the bottom of every page */
    drawFooter(pdf, settings, theme) {
        let range = pdf.bufferedPageRange();
        for (let index = range.start; index < range.start + range.count; index++) {
            pdf.switchToPage(index);
            // lineBreak false + a bottom margin of 0 keep pdfkit from adding a new page for the footer
            pdf.page.margins.bottom = 0;
            if (settings.show_signature && index === range.start + range.count - 1) {
                pdf.moveTo(400, 775).lineTo(555, 775).strokeColor('#999999').stroke();
                pdf.font('Helvetica').fontSize(8).fillColor('#444444').text('Authorised signatory', 400, 779, { width: 155, align: 'center', lineBreak: false });
            }
            if (settings.footer_text) {
                pdf.font('Helvetica').fontSize(8).fillColor(theme.accent).text(settings.footer_text, 40, 800, { width: 400, lineBreak: false, height: 12, ellipsis: true });
            }
            pdf.font('Helvetica').fontSize(7.5).fillColor('#888888').text(`Page ${index + 1} of ${range.count}`, 455, 800, { width: 100, align: 'right', lineBreak: false });
        }
    }
}

module.exports = new InvoicePdf();
module.exports.DEFAULT_PRINT_SETTINGS = DEFAULT_PRINT_SETTINGS;
module.exports.TEMPLATES = TEMPLATES;
module.exports.LOGO_FOLDER = LOGO_FOLDER;
