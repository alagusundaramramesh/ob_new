const crypto = require('crypto');
const { BusinessError } = require('../utils/util.error');

// Hosts and paths are the ones the PHP version used (TaxPro / Chartered Info GSP)
const HOSTS = {
    sandbox: {
        vital: 'https://gstsandbox.charteredinfo.com/eivital/dec/v1.04',
        core: 'https://gstsandbox.charteredinfo.com/eicore/dec/v1.03',
        ewb: 'https://gstsandbox.charteredinfo.com/eiewb/dec/v1.03',
        action: 'https://gstsandbox.charteredinfo.com/ewaybillapi/dec/v1.03/ewayapi'
    },
    production: {
        vital: 'https://einvapi.charteredinfo.com/eivital/dec/v1.04',
        core: 'https://einvapi.charteredinfo.com/eicore/dec/v1.03',
        ewb: 'https://einvapi.charteredinfo.com/eiewb/dec/v1.03',
        action: 'https://einvapi.charteredinfo.com/v1.03/dec/ewayapi'
    }
};

const REQUEST_TIMEOUT_MS = 30000;

/*
 * Real e-invoice / e-way bill provider: the TaxPro GSP, the same one the PHP application used.
 *
 * It needs, in server/.env:  EINV_PROVIDER=taxpro, EINV_ASP_ID, EINV_ASP_PASSWORD (given by TaxPro) and optionally EINV_IRP (default NIC).
 * The GST portal API user and password of each company are saved in Settings > E-invoice.
 *
 * IMPORTANT: this adapter was written from the endpoints and headers of the PHP code and the public e-invoice / e-way bill API
 * description. It has NOT been run against the TaxPro sandbox from this project. Try it with sandbox credentials first
 * (mode "sandbox") and compare the answers with the PHP application before using production.
 */
class EinvoiceTaxpro {

    constructor() {
        this.name = 'taxpro';
        this.is_live = true;
        this.tokens = new Map(); // "mode:gstin:user:password hash" -> { value, client_id, expires_at }
    }

    /*
     * Urls of the GSP. EINV_TAXPRO_TEST_HOST (for example http://localhost:9090) replaces the sandbox host, so the adapter can be
     * tried against a fake server. It is ignored in production mode.
     */
    getHosts(mode) {
        if (mode === 'sandbox' && process.env.EINV_TAXPRO_TEST_HOST) {
            let host = process.env.EINV_TAXPRO_TEST_HOST.replace(/\/$/, '');
            return {
                vital: `${host}/eivital/dec/v1.04`, core: `${host}/eicore/dec/v1.03`,
                ewb: `${host}/eiewb/dec/v1.03`, action: `${host}/ewaybillapi/dec/v1.03/ewayapi`
            };
        }
        return HOSTS[mode];
    }

    getAspConfig() {
        if (!process.env.EINV_ASP_ID || !process.env.EINV_ASP_PASSWORD) {
            throw new BusinessError('The e-invoice provider is not set up on the server (EINV_ASP_ID and EINV_ASP_PASSWORD in .env)', 'EINV_PROVIDER_NOT_SET_UP');
        }
        return { aspid: process.env.EINV_ASP_ID, password: process.env.EINV_ASP_PASSWORD, irp: process.env.EINV_IRP || 'NIC' };
    }

    /* The body of a response may be an object or a JSON text */
    parseData(data) {
        if (typeof data !== 'string') {
            return data;
        }
        try {
            return JSON.parse(data);
        } catch (error) {
            return data;
        }
    }

    /* One HTTP call. Returns the parsed JSON. Network problems and timeouts become a clear message */
    async request(method, url, headers, body) {
        let controller = new AbortController();
        let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            let response = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
                body: body ? JSON.stringify(body) : undefined, signal: controller.signal
            });
            let text = await response.text();
            try {
                return JSON.parse(text);
            } catch (error) {
                throw new BusinessError(`The e-invoice provider answered with something that is not JSON (HTTP ${response.status})`, 'IRP_BAD_RESPONSE');
            }
        } catch (error) {
            if (error instanceof BusinessError) throw error;
            let reason = error.name === 'AbortError' ? 'did not answer in 30 seconds' : 'could not be reached';
            throw new BusinessError(`The e-invoice provider ${reason}. Try again later`, 'IRP_UNREACHABLE');
        } finally {
            clearTimeout(timer);
        }
    }

    /* Error of the IRP: { Status: 0, ErrorDetails: [{ ErrorCode, ErrorMessage }] } */
    fail(response, prefix) {
        let details = response.ErrorDetails || response.errorDetails;
        let first = Array.isArray(details) && details[0] ? details[0] : null;
        let code = first ? first.ErrorCode : (response.error_cd || response.errorCode || '');
        let message = first ? first.ErrorMessage : (response.error_desc || response.message || response.error || 'Request failed');
        let error = new BusinessError(`${prefix} ${code}: ${message}`.replace(/ : /, ': '), `IRP_${code || 'ERROR'}`);
        error.irp_code = String(code);
        error.irp_response = response;
        throw error;
    }

    /* Headers that identify the GSP, the taxpayer and the portal user */
    baseHeaders(context) {
        let asp = this.getAspConfig();
        let headers = { aspid: asp.aspid, password: asp.password, Gstin: context.gstin, IRP: asp.irp };
        if (context.ewb_only) {
            headers.username = context.username;
            headers.ewbpwd = context.password;
        } else {
            headers.user_name = context.username;
            headers.eInvPwd = context.password;
        }
        return headers;
    }

    /* Token of the portal user. Kept in memory until it expires */
    async authenticate(context) {
        // The key contains the portal user and a hash of the password, so a changed password never reuses the old token
        let password_hash = crypto.createHash('sha256').update(context.password || '').digest('hex').slice(0, 16);
        let key = [context.mode, context.gstin, context.username, password_hash, context.ewb_only ? 'ewb' : 'einv'].join(':');
        let cached = this.tokens.get(key);
        if (cached && cached.expires_at > Date.now() + 60000) {
            return cached;
        }
        let hosts = this.getHosts(context.mode);
        let url = context.ewb_only ? hosts.action.replace('/ewayapi', '/auth?action=ACCESSTOKEN') : `${hosts.vital}/auth`;
        let response = await this.request('GET', url, this.baseHeaders(context));

        let token;
        if (context.ewb_only) {
            if (!response.authtoken) this.fail(response, 'Login to the e-way bill portal failed.');
            token = { value: response.authtoken, client_id: '', expires_at: Date.now() + 23 * 3600000 };
        } else {
            if (response.Status !== 1 || !response.Data) this.fail(response, 'Login to the e-invoice portal failed.');
            let data = this.parseData(response.Data);
            token = { value: data.AuthToken, client_id: data.ClientId || '', expires_at: new Date(String(data.TokenExpiry).replace(' ', 'T') + 'Z').getTime() || Date.now() + 5 * 3600000 };
        }
        this.tokens.set(key, token);
        return token;
    }

    async call(context, method, base_url, body) {
        let token = await this.authenticate(context);
        let headers = this.baseHeaders(context);
        if (token.client_id) headers.ClientId = token.client_id;
        let url = `${base_url}${base_url.includes('?') ? '&' : '?'}AuthToken=${encodeURIComponent(token.value)}`;
        return this.request(method, url, headers, body);
    }

    /* Result of an e-invoice API call: the "Data" of a successful answer */
    unwrap(response, prefix) {
        if (response.Status !== 1) this.fail(response, prefix);
        return this.parseData(response.Data);
    }

    async generateIrn(context, payload) {
        let hosts = this.getHosts(context.mode);
        let response = await this.call(context, 'POST', `${hosts.core}/Invoice`, payload);
        if (response.Status !== 1 && String((response.ErrorDetails || [])[0] && response.ErrorDetails[0].ErrorCode) === '2150') {
            // Duplicate IRN: the invoice is already registered (for example the first answer was lost). Fetch it
            let duplicate = this.parseData((response.InfoDtls || [])[0] && response.InfoDtls[0].Desc);
            if (duplicate && duplicate.Irn) {
                return this.mapIrn(duplicate);
            }
        }
        return this.mapIrn(this.unwrap(response, 'IRP'));
    }

    mapIrn(data) {
        return {
            irn: data.Irn, ack_no: String(data.AckNo), ack_dt: data.AckDt, signed_invoice: data.SignedInvoice, signed_qr: data.SignedQRCode,
            ewb_no: data.EwbNo ? String(data.EwbNo) : '', ewb_dt: data.EwbDt || '', ewb_valid_till: data.EwbValidTill || ''
        };
    }

    async getIrnDetails(context, irn) {
        let hosts = this.getHosts(context.mode);
        return this.mapIrn(this.unwrap(await this.call(context, 'GET', `${hosts.core}/Invoice/irn/${irn}`), 'IRP'));
    }

    async cancelIrn(context, request) {
        let hosts = this.getHosts(context.mode);
        let data = this.unwrap(await this.call(context, 'POST', `${hosts.core}/Invoice/Cancel`, { Irn: request.irn, CnlRsn: String(request.reason), CnlRem: request.remark || '' }), 'IRP');
        return { irn: data.Irn, cancel_date: data.CancelDate };
    }

    /* "17/11/2026 06:30:00 PM" -> "2026-11-17 18:30:00" (portal times are in IST) */
    portalDate(text) {
        let match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ?(AM|PM)?$/i.exec(String(text || ''));
        if (!match) return String(text || '');
        let hour = Number(match[4]);
        if (match[7] && match[7].toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (match[7] && match[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
        return `${match[3]}-${match[2]}-${match[1]} ${String(hour).padStart(2, '0')}:${match[5]}:${match[6]}`;
    }

    async generateEwbByIrn(context, request) {
        let hosts = this.getHosts(context.mode);
        let data = this.unwrap(await this.call(context, 'POST', `${hosts.ewb}/ewaybill`, request), 'E-way bill');
        return { ewb_no: String(data.EwbNo), ewb_dt: this.portalDate(data.EwbDt), valid_till: this.portalDate(data.EwbValidTill) };
    }

    /* Direct e-way bill (no IRN): the NIC action API. A GSP answers with the e-way bill fields at the top level */
    async generateEwbDirect(context, request) {
        let hosts = this.getHosts(context.mode);
        let response = await this.call(context, 'POST', `${hosts.action}?action=GENEWAYBILL`, request);
        let data = response.ewayBillNo ? response : (response.Status === 1 ? this.parseData(response.Data) : null);
        if (!data || !(data.ewayBillNo || data.EwbNo)) this.fail(response, 'E-way bill');
        return {
            ewb_no: String(data.ewayBillNo || data.EwbNo),
            ewb_dt: this.portalDate(data.ewayBillDate || data.EwbDt),
            valid_till: this.portalDate(data.validUpto || data.EwbValidTill)
        };
    }

    async cancelEwb(context, request) {
        let hosts = this.getHosts(context.mode);
        let response = await this.call(context, 'POST', `${hosts.action}?action=CANEWB`, { ewbNo: Number(request.ewb_no), cancelRsnCode: Number(request.reason), cancelRmrk: request.remark || '' });
        if (!response.ewayBillNo && !response.ewbNo && response.Status !== 1) this.fail(response, 'E-way bill');
        return { cancel_date: this.portalDate(response.cancelDate) || '' };
    }

    async updateVehicle(context, request) {
        let hosts = this.getHosts(context.mode);
        let response = await this.call(context, 'POST', `${hosts.action}?action=VEHEWB`, request.body);
        if (!response.vehUpdDate && response.Status !== 1) this.fail(response, 'E-way bill');
        return { vehicle_updated_on: this.portalDate(response.vehUpdDate), valid_till: this.portalDate(response.validUpto) || request.valid_till };
    }
}

module.exports = new EinvoiceTaxpro();
module.exports.HOSTS = HOSTS;
