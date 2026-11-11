const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');

const TT = CONFIG.TRANS_TYPES;

// E-invoice is reported from this date (same date as the PHP version)
const EINVOICE_START_DATE = new Date(Date.UTC(2022, 8, 1));

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
// IRP accepts only these GST rates
const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];
// Document number rule of the IRP: up to 16 characters, letters / digits / "/" / "-", must not start with 0, "/" or "-"
const DOC_NO_PATTERN = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;

const DOC_TYPES = { [TT.SALES_INVOICE]: 'INV', [TT.SALES_CREDIT_NOTE]: 'CRN', [TT.SALES_DEBIT_NOTE]: 'DBN' };

const UQC_MAP = {
    NOS: 'NOS', NO: 'NOS', PCS: 'PCS', PC: 'PCS', KGS: 'KGS', KG: 'KGS', GMS: 'GMS', GM: 'GMS', LTR: 'LTR', L: 'LTR', MTR: 'MTR', M: 'MTR',
    BOX: 'BOX', PAC: 'PAC', PKT: 'PAC', SET: 'SET', DOZ: 'DOZ', BAG: 'BAG', UNT: 'UNT', UNIT: 'UNT', BTL: 'BTL', CTN: 'CTN', PAIR: 'PRS', PRS: 'PRS'
};

const r2 = UTILS.round2;

/* Builds the JSON of the IRP (e-invoice schema 1.1) and checks a document before it is sent */
class EinvoiceFormatter {

    isEinvoiceType(trans_type) {
        return Object.keys(DOC_TYPES).includes(trans_type);
    }

    isValidGstin(gstin) {
        return GSTIN_PATTERN.test(String(gstin || '').trim().toUpperCase());
    }

    uqc(item) {
        return item.item_type === 'S' ? 'OTH' : (UQC_MAP[String(item.unit || '').toUpperCase()] || 'OTH');
    }

    dateText(value) {
        let date = new Date(value);
        return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    }

    /* Address of a contact: the first saved address */
    getAddress(contact) {
        return (contact && contact.addresses && contact.addresses[0]) || {};
    }

    /* Tax heads and the GST rate of an item line */
    getTaxHeads(item) {
        let heads = { igst: 0, cgst: 0, sgst: 0, cess: 0, rate: 0, cess_rate: 0 };
        for (const tax of item.taxes || []) {
            if (tax.tax_type_code === 'IGST') heads.igst += tax.tax_value;
            else if (tax.tax_type_code === 'CGST') heads.cgst += tax.tax_value;
            else if (tax.tax_type_code === 'SGST' || tax.tax_type_code === 'UTGST') heads.sgst += tax.tax_value;
            else if (tax.tax_type_code === 'CESS') { heads.cess += tax.tax_value; heads.cess_rate += tax.tax_rate; }
            if (tax.tax_type_code !== 'CESS') heads.rate += tax.tax_rate;
        }
        return heads;
    }

    /*
     * Everything that is wrong with the document for the IRP, in plain words (empty list = ready to send).
     * ref_invoice is the invoice a credit / debit note was made from (can be null)
     */
    validate(transaction, company, contact, ref_invoice) {
        let errors = [];
        let add = message => errors.push(message);

        if (!this.isEinvoiceType(transaction.trans_type)) {
            add('E-invoice is only for sales invoices, credit notes and debit notes');
            return errors;
        }
        if (transaction.einvoice && transaction.einvoice.status === 'ACT') {
            add(`The e-invoice is already generated (IRN ${transaction.einvoice.irn})`);
        }
        if (transaction.einvoice && transaction.einvoice.status === 'CNL') {
            add('The e-invoice of this document was cancelled. A cancelled document number can not be reported again, create a new document');
        }
        if (new Date(transaction.trans_date) < EINVOICE_START_DATE) {
            add('The document date is before 01 Sep 2022, e-invoice is not allowed');
        }
        if (!DOC_NO_PATTERN.test(transaction.trans_no)) {
            add(`Document number "${transaction.trans_no}" is not allowed: up to 16 characters, only letters, digits, "/" and "-", and it must not start with 0, "/" or "-". Change the prefix in Settings > Numbering`);
        }

        // Seller = our company
        if (!this.isValidGstin(company.tax_no)) add('Enter a valid GSTIN of the company in Settings > Company');
        if (String(company.address1 || '').trim().length < 3) add('The company address is missing (Settings > Company)');
        if (String(company.city || '').trim().length < 3) add('The company city is missing (Settings > Company)');
        if (!/^[1-9][0-9]{5}$/.test(String(company.zip || '').trim())) add('The company PIN code must have 6 digits (Settings > Company)');

        // Buyer
        let buyer_address = this.getAddress(contact);
        if (!this.isValidGstin(transaction.con_tax_no)) add(`${transaction.con_name || 'The customer'} needs a valid GSTIN. E-invoice is only for sales to registered buyers (B2B)`);
        if (String(buyer_address.address1 || '').trim().length < 3) add(`The address of ${transaction.con_name} is missing (open the customer and fill the address)`);
        if (String(buyer_address.city || '').trim().length < 3) add(`The city of ${transaction.con_name} is missing`);
        if (!/^[1-9][0-9]{5}$/.test(String(buyer_address.zip || '').trim())) add(`The PIN code of ${transaction.con_name} must have 6 digits`);

        // Items
        transaction.items.forEach((item, index) => {
            let line = `Item ${index + 1} (${item.item_name})`;
            let heads = this.getTaxHeads(item);
            let hs = String(item.hs || '').trim();
            if (item.item_type === 'S') {
                if (!/^99[0-9]{2,6}$/.test(hs)) add(`${line} is a service and needs a SAC code starting with 99`);
            } else if (!/^[0-9]{4,8}$/.test(hs)) {
                add(`${line} needs an HSN code of 4 to 8 digits`);
            }
            if (!VALID_GST_RATES.includes(heads.rate)) add(`${line} has a GST rate of ${heads.rate}% which the IRP does not accept`);
            if (!(item.qty > 0)) add(`${line} needs a quantity`);
        });

        // Totals must add up (the IRP checks this too)
        let taxable = transaction.items.reduce((sum, item) => sum + item.taxable_amount, 0);
        let difference = Math.abs(transaction.tot_amount - (taxable + transaction.tot_tax + (transaction.round_amount || 0)));
        if (difference > 0.05) add('The document total does not match the items. Save the document again');

        // A note must not refer to an invoice whose e-invoice was cancelled
        if (ref_invoice && ref_invoice.einvoice && ref_invoice.einvoice.status === 'CNL') {
            add(`The referred invoice ${ref_invoice.trans_no} has a cancelled e-invoice`);
        }
        return errors;
    }

    /* The IRP JSON (schema 1.1). Only call it after validate() returned no errors */
    format(transaction, company, contact, ref_invoice) {
        let seller_gstin = company.tax_no.trim().toUpperCase();
        let buyer_gstin = transaction.con_tax_no.trim().toUpperCase();
        let buyer_address = this.getAddress(contact);
        let pos = String(transaction.dst_state_code || buyer_gstin.slice(0, 2)).padStart(2, '0');

        let items = transaction.items.map((item, index) => {
            let heads = this.getTaxHeads(item);
            // Amount before discount and tax: also correct when the rate in the document includes tax
            let gross_amount = r2(item.taxable_amount + item.disc_amount);
            return {
                SlNo: String(index + 1),
                PrdDesc: String(item.item_name).slice(0, 300),
                IsServc: item.item_type === 'S' ? 'Y' : 'N',
                HsnCd: String(item.hs).trim(),
                Qty: item.qty,
                FreeQty: item.free_qty || 0,
                Unit: this.uqc(item),
                UnitPrice: Math.round((gross_amount / item.qty) * 100000) / 100000,
                TotAmt: gross_amount,
                Discount: item.disc_amount,
                PreTaxVal: 0,
                AssAmt: item.taxable_amount,
                GstRt: heads.rate,
                IgstAmt: r2(heads.igst),
                CgstAmt: r2(heads.cgst),
                SgstAmt: r2(heads.sgst),
                CesRt: heads.cess_rate,
                CesAmt: r2(heads.cess),
                CesNonAdvlAmt: 0,
                StateCesRt: 0,
                StateCesAmt: 0,
                StateCesNonAdvlAmt: 0,
                OthChrg: 0,
                TotItemVal: item.item_total
            };
        });
        let sum_of = field => r2(items.reduce((sum, item) => sum + item[field], 0));

        let payload = {
            Version: '1.1',
            TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', EcmGstin: null, IgstOnIntra: 'N' },
            DocDtls: { Typ: DOC_TYPES[transaction.trans_type], No: transaction.trans_no, Dt: this.dateText(transaction.trans_date) },
            SellerDtls: {
                Gstin: seller_gstin, LglNm: company.name, TrdNm: company.name, Addr1: company.address1.trim(),
                Loc: company.city.trim(), Pin: Number(company.zip), Stcd: seller_gstin.slice(0, 2)
            },
            BuyerDtls: {
                Gstin: buyer_gstin, LglNm: contact.company || contact.name, TrdNm: contact.name, Pos: pos, Addr1: buyer_address.address1.trim(),
                Loc: buyer_address.city.trim(), Pin: Number(buyer_address.zip), Stcd: buyer_gstin.slice(0, 2)
            },
            ItemList: items,
            ValDtls: {
                AssVal: sum_of('AssAmt'), CgstVal: sum_of('CgstAmt'), SgstVal: sum_of('SgstAmt'), IgstVal: sum_of('IgstAmt'),
                CesVal: sum_of('CesAmt'), StCesVal: 0, Discount: 0, OthChrg: 0,
                RndOffAmt: transaction.round_amount || 0, TotInvVal: transaction.tot_amount
            }
        };
        // optional fields are only sent when they have a value (the IRP refuses empty strings)
        if (company.address2) payload.SellerDtls.Addr2 = company.address2;
        if (/^[6-9][0-9]{9}$/.test(String(company.phone || '').replace(/\D/g, '').slice(-10))) payload.SellerDtls.Ph = String(company.phone).replace(/\D/g, '').slice(-10);
        if (company.email) payload.SellerDtls.Em = company.email;
        if (buyer_address.address2) payload.BuyerDtls.Addr2 = buyer_address.address2;
        if (contact.email) payload.BuyerDtls.Em = contact.email;
        if (ref_invoice) {
            payload.RefDtls = { PrecDocDtls: [{ InvNo: ref_invoice.trans_no, InvDt: this.dateText(ref_invoice.trans_date) }] };
        }
        return payload;
    }
}

module.exports = new EinvoiceFormatter();
module.exports.EINVOICE_START_DATE = EINVOICE_START_DATE;
module.exports.DOC_TYPES = DOC_TYPES;
module.exports.VALID_GST_RATES = VALID_GST_RATES;
