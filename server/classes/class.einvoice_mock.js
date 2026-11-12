const crypto = require('crypto');
const { BusinessError } = require('../utils/util.error');

/*
 * TEST provider for e-invoice and e-way bill. It does NOT talk to the IRP / e-way bill portal.
 * It follows the same rules (IRN = SHA-256 of seller GSTIN + financial year + document type + number, 24 hour cancel window,
 * validity of 1 day per 200 km), so the screens and the flow can be tried without credentials.
 * Everything it creates is marked as a test (provider "mock") and printed as a TEST on the PDF: it is never a legal e-invoice.
 */
class EinvoiceMock {

    constructor() {
        this.name = 'mock';
        this.is_live = false;
    }

    /* "2026-27" for a document dated between Apr 2026 and Mar 2027 */
    getFinancialYear(date_text) {
        let [day, month, year] = date_text.split('/').map(Number);
        let start_year = month >= 4 ? year : year - 1;
        return `${start_year}-${String(start_year + 1).slice(2)}`;
    }

    randomNumber(digits) {
        let number = String(crypto.randomInt(1, 10));
        while (number.length < digits) {
            number += String(crypto.randomInt(0, 10));
        }
        return number;
    }

    dateTimeText(date) {
        let pad = value => String(value).padStart(2, '0');
        return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    }

    /* e-way bill: 1 day per 200 km (minimum 1), valid until the midnight of the day after the last day */
    getValidTill(from_date, distance) {
        let days = Math.max(1, Math.ceil((Number(distance) || 0) / 200));
        let valid_till = new Date(Date.UTC(from_date.getUTCFullYear(), from_date.getUTCMonth(), from_date.getUTCDate() + days, 23, 59, 59));
        return this.dateTimeText(valid_till);
    }

    async generateIrn(context, payload) {
        let irn = crypto.createHash('sha256')
            .update(`${payload.SellerDtls.Gstin}${this.getFinancialYear(payload.DocDtls.Dt)}${payload.DocDtls.Typ}${payload.DocDtls.No}`)
            .digest('hex');
        let now = new Date();
        let qr_payload = {
            SellerGstin: payload.SellerDtls.Gstin, BuyerGstin: payload.BuyerDtls.Gstin, DocNo: payload.DocDtls.No, DocTyp: payload.DocDtls.Typ,
            DocDt: payload.DocDtls.Dt, TotInvVal: payload.ValDtls.TotInvVal, ItemCnt: payload.ItemList.length, MainHsnCode: payload.ItemList[0].HsnCd,
            Irn: irn, IrnDt: this.dateTimeText(now), TEST: 'NOT A REAL IRN'
        };
        let encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
        return {
            irn: irn,
            ack_no: this.randomNumber(15),
            ack_dt: this.dateTimeText(now),
            signed_invoice: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ TEST: true, data: payload })}.`,
            signed_qr: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ TEST: true, data: JSON.stringify(qr_payload) })}.`
        };
    }

    async getIrnDetails(context, irn) {
        throw new BusinessError('The test provider does not keep IRNs', 'IRP_NOT_FOUND');
    }

    async cancelIrn(context, request) {
        let hours = (Date.now() - new Date(request.ack_dt.replace(' ', 'T') + 'Z').getTime()) / 3600000;
        if (hours > 24) {
            throw new BusinessError('IRP 9999: The e-invoice can be cancelled only within 24 hours of generation', 'IRP_9999');
        }
        return { irn: request.irn, cancel_date: this.dateTimeText(new Date()) };
    }

    async generateEwbByIrn(context, request) {
        let now = new Date();
        return { ewb_no: this.randomNumber(12), ewb_dt: this.dateTimeText(now), valid_till: this.getValidTill(now, request.Distance) };
    }

    async generateEwbDirect(context, request) {
        let now = new Date();
        return { ewb_no: this.randomNumber(12), ewb_dt: this.dateTimeText(now), valid_till: this.getValidTill(now, request.transDistance) };
    }

    async cancelEwb(context, request) {
        let hours = (Date.now() - new Date(request.ewb_dt.replace(' ', 'T') + 'Z').getTime()) / 3600000;
        if (hours > 24) {
            throw new BusinessError('E-way bill 312: The e-way bill can be cancelled only within 24 hours of generation', 'EWB_312');
        }
        return { cancel_date: this.dateTimeText(new Date()) };
    }

    async updateVehicle(context, request) {
        return { vehicle_updated_on: this.dateTimeText(new Date()), valid_till: request.valid_till };
    }

    /* Validity is counted from the later of now and the old end date, 1 day per 200 km still to travel */
    async extendValidity(context, request) {
        let old_end = new Date(request.valid_till.replace(' ', 'T') + 'Z');
        let start = old_end.getTime() > Date.now() ? old_end : new Date();
        return { updated_on: this.dateTimeText(new Date()), valid_till: this.getValidTill(start, request.body.remainingDistance) };
    }

    async updateTransporter(context, request) {
        return { updated_on: this.dateTimeText(new Date()), transporter_id: request.body.transporterId };
    }
}

module.exports = new EinvoiceMock();
