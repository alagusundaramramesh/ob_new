const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const SECRET = require('./class.secret');
const FORMATTER = require('./class.einvoice_formatter');
const MOCK = require('./class.einvoice_mock');
const TAXPRO = require('./class.einvoice_taxpro');
const { BusinessError } = require('../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

// Documents that can have an e-way bill: invoices, retail invoices and delivery challans (goods only)
const EWB_TYPES = [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.DELIVERY_CHALLAN];
const EWB_DOC_TYPES = { [TT.SALES_INVOICE]: 'INV', [TT.SALES_RETAIL]: 'INV', [TT.DELIVERY_CHALLAN]: 'CHL' };
const EWB_MIN_VALUE = 50000;

// Both portals allow a cancel only within 24 hours
const CANCEL_WINDOW_HOURS = 24;

const VEHICLE_PATTERN = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

const DEFAULT_SETTINGS = { enabled: false, mode: 'sandbox', ewb_only: false };

const r2 = UTILS.round2;

/*
 * E-invoice (IRN) and e-way bill. This class checks the document, builds the request, asks the provider
 * (test provider or TaxPro, see class.einvoice_mock.js / class.einvoice_taxpro.js), stores the answer in the transaction
 * (transaction.einvoice and transaction.ewb) and writes every call to ob_einvoice_log.
 */
class Einvoice {

    /* ------------------------------------------------------------------ provider and settings */

    getProvider() {
        let provider_name = process.env.EINV_PROVIDER || 'mock';
        if (provider_name === 'taxpro') return TAXPRO;
        if (provider_name === 'mock') return MOCK;
        throw new BusinessError(`Unknown EINV_PROVIDER "${provider_name}" in the server .env (use mock or taxpro)`, 'EINV_PROVIDER_UNKNOWN');
    }

    getSettings(company) {
        return { ...DEFAULT_SETTINGS, ...(company.einvoice_settings || {}) };
    }

    /* Everything a provider call needs: GSTIN, portal user, mode. Throws when e-invoice is not switched on / not set up */
    async getContext(dbobj, company) {
        let settings = this.getSettings(company);
        if (!settings.enabled) {
            throw new BusinessError('E-invoice is not switched on. Switch it on in Settings > E-invoice', 'EINVOICE_DISABLED');
        }
        if (!FORMATTER.isValidGstin(company.tax_no)) {
            throw new BusinessError('Enter a valid GSTIN of the company in Settings > Company', 'GSTIN_REQUIRED');
        }
        let provider = this.getProvider();
        if (settings.mode === 'production' && !provider.is_live) {
            throw new BusinessError('Production mode needs a real provider (EINV_PROVIDER=taxpro in the server .env). The test provider cannot be used in production', 'EINV_TEST_IN_PRODUCTION');
        }

        let credentials = await dbobj.collection('ob_einvoice_credentials').findOne({ c_id: company.c_id });
        let username = credentials ? credentials.api_username : '';
        let password = credentials ? SECRET.decrypt(credentials.api_password_enc) : '';
        if (provider.is_live && (!username || !password)) {
            throw new BusinessError('Enter the GST portal API user name and password in Settings > E-invoice', 'EINV_CREDENTIALS_REQUIRED');
        }
        return {
            provider: provider, gstin: company.tax_no.trim().toUpperCase(), username: username, password: password,
            mode: settings.mode, ewb_only: !!settings.ewb_only
        };
    }

    async log(dbobj, company, trans_id, action, context, error) {
        try {
            await dbobj.collection('ob_einvoice_log').insertOne({
                c_id: company.c_id, trans_id: trans_id, action: action, provider: context.provider.name, mode: context.mode,
                is_ok: !error, error_code: error ? error.code || '' : '', error_message: error ? error.message : '', at: new Date()
            });
        } catch (log_error) {
            console.error('E-invoice log could not be written', log_error.message); // a log problem must not hide the real result
        }
    }

    /* ------------------------------------------------------------------ documents */

    async loadDocument(dbobj, c_id, trans_id) {
        let transaction = await dbobj.collection('ob_transactions').findOne(
            { c_id: c_id, trans_id: trans_id, stat: CONFIG.STAT_ACTIVE }, { projection: { _id: 0 } });
        if (!transaction) {
            throw new BusinessError('Transaction not found', 'TRANS_NOT_FOUND');
        }
        let contact = transaction.con_id
            ? await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: transaction.con_id }, { projection: { _id: 0 } })
            : null;
        let ref_invoice = transaction.ref_id
            ? await dbobj.collection('ob_transactions').findOne({ c_id: c_id, trans_id: transaction.ref_id, stat: CONFIG.STAT_ACTIVE }, { projection: { _id: 0 } })
            : null;
        return { transaction, contact, ref_invoice };
    }

    /* Errors of the document and the JSON that would be sent. Does not call the provider */
    async check(dbobj, company, trans_id) {
        let { transaction, contact, ref_invoice } = await this.loadDocument(dbobj, company.c_id, trans_id);
        let settings = this.getSettings(company);
        let errors = [];
        if (!settings.enabled) {
            errors.push('E-invoice is not switched on (Settings > E-invoice)');
        }
        errors.push(...FORMATTER.validate(transaction, company, contact, ref_invoice));
        let payload = errors.length === 0 ? FORMATTER.format(transaction, company, contact, ref_invoice) : null;
        return { errors, payload, transaction };
    }

    /* Only the credit / debit note of an invoice that has an e-invoice may be reported, and the other way round is allowed */
    hoursSince(date) {
        return (Date.now() - new Date(date).getTime()) / 3600000;
    }

    /* ------------------------------------------------------------------ e-invoice */

    async generate(dbobj, company, trans_id, user_email) {
        let context = await this.getContext(dbobj, company);
        let { errors, payload } = await this.check(dbobj, company, trans_id);
        if (errors.length > 0) {
            throw new BusinessError(`The document can not be sent to the IRP:\n- ${errors.join('\n- ')}`, 'EINVOICE_INVALID');
        }

        let result;
        try {
            result = await context.provider.generateIrn(context, payload);
        } catch (error) {
            await this.log(dbobj, company, trans_id, 'generate_irn', context, error);
            throw error;
        }

        let einvoice = {
            irn: result.irn, ack_no: result.ack_no, ack_dt: result.ack_dt, signed_invoice: result.signed_invoice, signed_qr: result.signed_qr,
            status: 'ACT', provider: context.provider.name, mode: context.mode, generated_on: new Date(), generated_by: user_email
        };
        // The filter makes sure two clicks do not save two answers
        let update_result = await dbobj.collection('ob_transactions').updateOne(
            { c_id: company.c_id, trans_id: trans_id, einvoice: { $exists: false } }, { $set: { einvoice: einvoice } });
        await this.log(dbobj, company, trans_id, 'generate_irn', context, null);
        if (update_result.modifiedCount === 0) {
            throw new BusinessError('The e-invoice of this document was generated by someone else just now. Reload the page', 'EINVOICE_ALREADY');
        }
        return einvoice;
    }

    async cancel(dbobj, company, trans_id, reason, remark, user_email) {
        let context = await this.getContext(dbobj, company);
        let { transaction } = await this.loadDocument(dbobj, company.c_id, trans_id);
        if (!transaction.einvoice || transaction.einvoice.status !== 'ACT') {
            throw new BusinessError('This document has no active e-invoice', 'EINVOICE_NOT_ACTIVE');
        }
        if (![1, 2, 3, 4].includes(Number(reason))) {
            throw new BusinessError('Choose a cancel reason: 1 duplicate, 2 data entry mistake, 3 order cancelled, 4 other', 'REASON_REQUIRED');
        }
        if (String(remark || '').length > 100) {
            throw new BusinessError('The remark can have up to 100 characters', 'REMARK_TOO_LONG');
        }
        if (transaction.ewb && transaction.ewb.status === 'ACT') {
            throw new BusinessError(`Cancel the e-way bill ${transaction.ewb.ewb_no} first`, 'EWB_ACTIVE');
        }
        if (this.hoursSince(transaction.einvoice.generated_on) > CANCEL_WINDOW_HOURS) {
            throw new BusinessError('The e-invoice can be cancelled only within 24 hours of generation. Issue a credit note instead', 'CANCEL_TIMEOUT');
        }

        let result;
        try {
            result = await context.provider.cancelIrn(context, { irn: transaction.einvoice.irn, reason: Number(reason), remark: remark, ack_dt: transaction.einvoice.ack_dt });
        } catch (error) {
            await this.log(dbobj, company, trans_id, 'cancel_irn', context, error);
            throw error;
        }
        await dbobj.collection('ob_transactions').updateOne({ c_id: company.c_id, trans_id: trans_id }, {
            $set: {
                'einvoice.status': 'CNL', 'einvoice.cancel_date': result.cancel_date, 'einvoice.cancel_reason': Number(reason),
                'einvoice.cancel_remark': remark || '', 'einvoice.cancelled_on': new Date(), 'einvoice.cancelled_by': user_email
            }
        });
        await this.log(dbobj, company, trans_id, 'cancel_irn', context, null);
        return result;
    }

    /* ------------------------------------------------------------------ e-way bill */

    /* The tax rates of an item by head, for the e-way bill items */
    rateHeads(item) {
        let rates = { cgst: 0, sgst: 0, igst: 0, cess: 0 };
        for (const tax of item.taxes || []) {
            if (tax.tax_type_code === 'CGST') rates.cgst += tax.tax_rate;
            else if (tax.tax_type_code === 'SGST' || tax.tax_type_code === 'UTGST') rates.sgst += tax.tax_rate;
            else if (tax.tax_type_code === 'IGST') rates.igst += tax.tax_rate;
            else if (tax.tax_type_code === 'CESS') rates.cess += tax.tax_rate;
        }
        return rates;
    }

    /* Cleans and checks the transport details typed by the user. Returns { details, errors } */
    checkTransport(input) {
        let errors = [];
        let details = {
            trans_mode: Number(input.trans_mode) || 1,
            distance: input.distance === undefined || input.distance === '' ? 0 : Number(input.distance),
            vehicle_no: String(input.vehicle_no || '').replace(/[\s-]/g, '').toUpperCase(),
            vehicle_type: input.vehicle_type === 'O' ? 'O' : 'R',
            transporter_gstin: String(input.transporter_gstin || '').trim().toUpperCase(),
            transporter_name: String(input.transporter_name || '').trim().slice(0, 100),
            trans_doc_no: String(input.trans_doc_no || '').trim().slice(0, 15),
            trans_doc_date: UTILS.toDate(input.trans_doc_date)
        };
        if (![1, 2, 3, 4].includes(details.trans_mode)) errors.push('Transport mode must be 1 road, 2 rail, 3 air or 4 ship');
        if (!Number.isInteger(details.distance) || details.distance < 0 || details.distance > 4000) errors.push('Distance must be a whole number of kilometres from 0 to 4000 (0 lets the portal calculate it from the PIN codes)');
        if (details.transporter_gstin && !FORMATTER.isValidGstin(details.transporter_gstin)) errors.push('The transporter id must be a valid GSTIN');
        if (details.vehicle_no && !VEHICLE_PATTERN.test(details.vehicle_no)) errors.push('The vehicle number looks wrong. Example: TN09AB1234');
        if (details.trans_mode === 1) {
            if (!details.vehicle_no && !details.transporter_gstin) errors.push('Enter the vehicle number, or the transporter id when the vehicle is not known yet');
        } else if (!details.trans_doc_no || !details.trans_doc_date) {
            errors.push('For rail, air and ship the transport document number and date are required');
        }
        return { details, errors };
    }

    /* Why the document can not get an e-way bill (empty list = ready) */
    checkEwbDocument(transaction, company, contact) {
        let errors = [];
        if (!EWB_TYPES.includes(transaction.trans_type)) {
            errors.push('E-way bill is only for invoices, retail invoices and delivery challans');
            return errors;
        }
        if (transaction.ewb && transaction.ewb.status === 'ACT') {
            errors.push(`The e-way bill ${transaction.ewb.ewb_no} is already generated`);
        }
        if (!FORMATTER.isValidGstin(company.tax_no)) errors.push('Enter a valid GSTIN of the company in Settings > Company');
        let goods = transaction.items.filter(item => item.item_type !== 'S');
        if (goods.length === 0) errors.push('The document has only services. An e-way bill is for goods');
        goods.forEach(item => {
            if (!/^[0-9]{4,8}$/.test(String(item.hs || '').trim())) errors.push(`Item "${item.item_name}" needs an HSN code of 4 to 8 digits`);
        });
        return errors;
    }

    /* Tells the warnings (not errors) of an e-way bill request */
    getEwbWarnings(transaction, details) {
        let warnings = [];
        if (transaction.tot_amount < EWB_MIN_VALUE) {
            warnings.push(`The value is below Rs. ${EWB_MIN_VALUE}. An e-way bill is not compulsory for this consignment`);
        }
        if (details.distance === 0) warnings.push('Distance 0: the portal calculates the distance from the PIN codes');
        return warnings;
    }

    /* The request of the direct e-way bill (no IRN) in the NIC format */
    buildDirectEwb(transaction, company, contact, details) {
        let buyer_address = FORMATTER.getAddress(contact);
        let seller_state = Number(company.tax_no.slice(0, 2));
        let buyer_gstin_ok = FORMATTER.isValidGstin(transaction.con_tax_no);
        let buyer_state = Number((buyer_gstin_ok ? transaction.con_tax_no.slice(0, 2) : (contact.state_code || transaction.dst_state_code)));
        let pos_state = Number(transaction.dst_state_code || buyer_state);
        let goods = transaction.items.filter(item => item.item_type !== 'S');
        let sum_of = head => r2(goods.reduce((sum, item) => sum + (item.taxes.find(tax => tax.tax_type_code === head) || { tax_value: 0 }).tax_value, 0));

        let request = {
            supplyType: 'O', subSupplyType: 1, docType: EWB_DOC_TYPES[transaction.trans_type], docNo: transaction.trans_no,
            docDate: FORMATTER.dateText(transaction.trans_date),
            fromGstin: company.tax_no.trim().toUpperCase(), fromTrdName: company.name, fromAddr1: company.address1, fromAddr2: company.address2 || '',
            fromPlace: company.city, fromPincode: Number(company.zip), fromStateCode: seller_state, actFromStateCode: seller_state,
            toGstin: buyer_gstin_ok ? transaction.con_tax_no.trim().toUpperCase() : 'URP', toTrdName: transaction.con_name,
            toAddr1: buyer_address.address1, toAddr2: buyer_address.address2 || '', toPlace: buyer_address.city,
            toPincode: Number(buyer_address.zip), toStateCode: buyer_state, actToStateCode: pos_state,
            transactionType: 1,
            totalValue: r2(goods.reduce((sum, item) => sum + item.taxable_amount, 0)),
            cgstValue: sum_of('CGST'), sgstValue: sum_of('SGST'), igstValue: sum_of('IGST'), cessValue: sum_of('CESS'),
            totInvValue: transaction.tot_amount, transMode: String(details.trans_mode), transDistance: String(details.distance),
            vehicleType: details.vehicle_type,
            itemList: goods.map((item, index) => ({
                itemNo: index + 1, productName: item.item_name, productDesc: item.item_name, hsnCode: Number(item.hs), quantity: item.qty,
                qtyUnit: FORMATTER.uqc(item), taxableAmount: item.taxable_amount,
                sgstRate: this.rateHeads(item).sgst, cgstRate: this.rateHeads(item).cgst, igstRate: this.rateHeads(item).igst, cessRate: this.rateHeads(item).cess
            }))
        };
        if (details.vehicle_no) request.vehicleNo = details.vehicle_no;
        if (details.transporter_gstin) { request.transporterId = details.transporter_gstin; request.transporterName = details.transporter_name; }
        if (details.trans_doc_no) { request.transDocNo = details.trans_doc_no; request.transDocDate = FORMATTER.dateText(details.trans_doc_date); }
        return request;
    }

    /* The checks of an e-way bill without sending it. Used by the screen to show what is missing */
    async checkEwb(dbobj, company, trans_id, input) {
        let { transaction, contact } = await this.loadDocument(dbobj, company.c_id, trans_id);
        let errors = this.checkEwbDocument(transaction, company, contact);
        let transport = this.checkTransport(input);
        errors.push(...transport.errors);

        let has_irn = transaction.einvoice && transaction.einvoice.status === 'ACT';
        if (!has_irn && errors.length === 0) {
            // Without an IRN the portal needs the addresses of both sides
            let buyer_address = FORMATTER.getAddress(contact);
            if (!contact) errors.push('Select a customer on the document: the e-way bill needs the delivery address');
            else if (String(buyer_address.address1 || '').length < 3 || String(buyer_address.city || '').length < 3 || !/^[1-9][0-9]{5}$/.test(String(buyer_address.zip || ''))) {
                errors.push(`The address, city and 6 digit PIN code of ${transaction.con_name} are needed (open the customer and fill the address)`);
            }
            if (String(company.address1 || '').length < 3 || String(company.city || '').length < 3 || !/^[1-9][0-9]{5}$/.test(String(company.zip || ''))) {
                errors.push('The company address, city and 6 digit PIN code are needed (Settings > Company)');
            }
        }
        return { errors, warnings: this.getEwbWarnings(transaction, transport.details), details: transport.details, transaction, contact, has_irn };
    }

    async generateEwb(dbobj, company, trans_id, input, user_email) {
        let context = await this.getContext(dbobj, company);
        let check = await this.checkEwb(dbobj, company, trans_id, input);
        if (check.errors.length > 0) {
            throw new BusinessError(`The e-way bill can not be generated:\n- ${check.errors.join('\n- ')}`, 'EWB_INVALID');
        }
        let { transaction, contact, details } = check;

        let result;
        try {
            if (check.has_irn) {
                let request = { Irn: transaction.einvoice.irn, Distance: details.distance, TransMode: String(details.trans_mode), VehType: details.vehicle_type };
                if (details.transporter_gstin) { request.TransId = details.transporter_gstin; request.TransName = details.transporter_name; }
                if (details.vehicle_no) request.VehNo = details.vehicle_no;
                if (details.trans_doc_no) { request.TransDocNo = details.trans_doc_no; request.TransDocDt = FORMATTER.dateText(details.trans_doc_date); }
                result = await context.provider.generateEwbByIrn(context, request);
            } else {
                result = await context.provider.generateEwbDirect(context, this.buildDirectEwb(transaction, company, contact, details));
            }
        } catch (error) {
            await this.log(dbobj, company, trans_id, 'generate_ewb', context, error);
            throw error;
        }

        let ewb = {
            ewb_no: result.ewb_no, ewb_dt: result.ewb_dt, valid_till: result.valid_till, status: 'ACT', via: check.has_irn ? 'irn' : 'direct',
            provider: context.provider.name, mode: context.mode, trans_mode: details.trans_mode, distance: details.distance,
            vehicle_no: details.vehicle_no, vehicle_type: details.vehicle_type, transporter_gstin: details.transporter_gstin,
            transporter_name: details.transporter_name, trans_doc_no: details.trans_doc_no, trans_doc_date: details.trans_doc_date,
            vehicle_history: [], generated_on: new Date(), generated_by: user_email
        };
        let update_result = await dbobj.collection('ob_transactions').updateOne(
            { c_id: company.c_id, trans_id: trans_id, 'ewb.status': { $ne: 'ACT' } }, { $set: { ewb: ewb } });
        await this.log(dbobj, company, trans_id, 'generate_ewb', context, null);
        if (update_result.modifiedCount === 0) {
            throw new BusinessError('The e-way bill of this document was generated by someone else just now. Reload the page', 'EWB_ALREADY');
        }
        return { ewb, warnings: check.warnings };
    }

    async cancelEwb(dbobj, company, trans_id, reason, remark, user_email) {
        let context = await this.getContext(dbobj, company);
        let { transaction } = await this.loadDocument(dbobj, company.c_id, trans_id);
        if (!transaction.ewb || transaction.ewb.status !== 'ACT') {
            throw new BusinessError('This document has no active e-way bill', 'EWB_NOT_ACTIVE');
        }
        if (![1, 2, 3, 4].includes(Number(reason))) {
            throw new BusinessError('Choose a cancel reason: 1 duplicate, 2 order cancelled, 3 data entry mistake, 4 other', 'REASON_REQUIRED');
        }
        if (this.hoursSince(transaction.ewb.generated_on) > CANCEL_WINDOW_HOURS) {
            throw new BusinessError('The e-way bill can be cancelled only within 24 hours of generation', 'CANCEL_TIMEOUT');
        }
        let result;
        try {
            result = await context.provider.cancelEwb(context, { ewb_no: transaction.ewb.ewb_no, reason: Number(reason), remark: remark, ewb_dt: transaction.ewb.ewb_dt });
        } catch (error) {
            await this.log(dbobj, company, trans_id, 'cancel_ewb', context, error);
            throw error;
        }
        await dbobj.collection('ob_transactions').updateOne({ c_id: company.c_id, trans_id: trans_id }, {
            $set: {
                'ewb.status': 'CNL', 'ewb.cancel_date': result.cancel_date, 'ewb.cancel_reason': Number(reason),
                'ewb.cancel_remark': remark || '', 'ewb.cancelled_on': new Date(), 'ewb.cancelled_by': user_email
            }
        });
        await this.log(dbobj, company, trans_id, 'cancel_ewb', context, null);
        return result;
    }

    /* Part B update: a new vehicle (breakdown, transshipment, first vehicle) */
    async updateVehicle(dbobj, company, trans_id, input, user_email) {
        let context = await this.getContext(dbobj, company);
        let { transaction } = await this.loadDocument(dbobj, company.c_id, trans_id);
        if (!transaction.ewb || transaction.ewb.status !== 'ACT') {
            throw new BusinessError('This document has no active e-way bill', 'EWB_NOT_ACTIVE');
        }
        let vehicle_no = String(input.vehicle_no || '').replace(/[\s-]/g, '').toUpperCase();
        if (!VEHICLE_PATTERN.test(vehicle_no)) {
            throw new BusinessError('The vehicle number looks wrong. Example: TN09AB1234', 'VEHICLE_INVALID');
        }
        if (![1, 2, 3, 4].includes(Number(input.reason_code))) {
            throw new BusinessError('Choose a reason: 1 breakdown, 2 transshipment, 3 other, 4 first time', 'REASON_REQUIRED');
        }
        if (String(input.from_place || '').trim().length < 2 || !/^[0-9]{2}$/.test(String(input.from_state || ''))) {
            throw new BusinessError('Enter the place and the 2 digit state code where the vehicle is now', 'PLACE_REQUIRED');
        }
        let body = {
            ewbNo: Number(transaction.ewb.ewb_no), vehicleNo: vehicle_no, fromPlace: String(input.from_place).trim(), fromState: Number(input.from_state),
            reasonCode: Number(input.reason_code), reasonRem: String(input.reason_remark || '').slice(0, 50), transMode: String(transaction.ewb.trans_mode),
            vehicleType: transaction.ewb.vehicle_type
        };
        let result;
        try {
            result = await context.provider.updateVehicle(context, { body: body, valid_till: transaction.ewb.valid_till });
        } catch (error) {
            await this.log(dbobj, company, trans_id, 'update_vehicle', context, error);
            throw error;
        }
        await dbobj.collection('ob_transactions').updateOne({ c_id: company.c_id, trans_id: trans_id }, {
            $set: { 'ewb.vehicle_no': vehicle_no, 'ewb.valid_till': result.valid_till },
            $push: { 'ewb.vehicle_history': { vehicle_no, from_place: body.fromPlace, reason_code: body.reasonCode, updated_on: new Date(), updated_by: user_email } }
        });
        await this.log(dbobj, company, trans_id, 'update_vehicle', context, null);
        return result;
    }
}

module.exports = new Einvoice();
module.exports.EWB_TYPES = EWB_TYPES;
module.exports.EWB_MIN_VALUE = EWB_MIN_VALUE;
