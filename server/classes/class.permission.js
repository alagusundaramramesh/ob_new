const CONFIG = require('../common/inc.config');

const TT = CONFIG.TRANS_TYPES;

/* Transaction type -> module code (modules are defined in common/sys_data.js) */
const TRANS_TYPE_MODULES = {
    [TT.ESTIMATE]: 'SASAQ',
    [TT.SALES_ORDER]: 'SASAO',
    [TT.DELIVERY_CHALLAN]: 'SASDH',
    [TT.SALES_INVOICE]: 'SASAI',
    [TT.SALES_RETAIL]: 'SASAI',
    [TT.SALES_CREDIT_NOTE]: 'SASAC',
    [TT.SALES_DEBIT_NOTE]: 'SASAD',
    [TT.SALES_PAYMENT]: 'SASAR',
    [TT.PURCHASE_QUOTE]: 'PUPUQ',
    [TT.PURCHASE_ORDER]: 'PUPUO',
    [TT.GOODS_RECEIPT]: 'PUPUG',
    [TT.PURCHASE_INVOICE]: 'PUPUB',
    [TT.PURCHASE_CREDIT_NOTE]: 'PUPUC',
    [TT.PURCHASE_DEBIT_NOTE]: 'PUPUD',
    [TT.PURCHASE_PAYMENT]: 'PUPUP',
    [TT.JOURNAL]: 'ACJRL',
    [TT.CONTRA]: 'ACCCT',
};

/* Endpoint -> module code. Endpoints that are not listed only need a valid login */
const ENDPOINT_MODULES = {
    dashboard: 'DAS',
    item_list: 'MNITM',
    item_save: 'MNITM',
    item_delete: 'MNITM',
    stock_adjust: 'MNSTJ',
    account_save: 'ACCHA',
    account_delete: 'ACCHA',
    bank_transaction_save: 'BAN',
    report_ledger: 'RLLDG',
    report_daybook: 'RADAY',
    report_trial_balance: 'RATBL',
    report_profit_loss: 'RAPAL',
    report_balance_sheet: 'RABAS',
    report_sales_register: 'RTSAR',
    report_purchase_register: 'RTPUR',
    report_outstanding: 'RTOSR',
    report_item_sales: 'RIITS',
    report_stock_summary: 'RSSTS',
    report_stock_ledger: 'RSSTL',
    report_gst_summary: 'RRGS1',
    report_gstr1: 'RRGS1',
    report_gstr3b: 'RRGS3',
    report_gstr2b: 'RRGS3',
    report_gstr9: 'RRGS3',
    report_gstr4: 'RRGS3',
    company_update: 'SET',
    user_list: 'SET',
    user_save: 'SET',
    user_delete: 'SET',
    role_list: 'SET',
    role_save: 'SET',
    price_list_save: 'SET',
    price_list_delete: 'SET',
    print_settings_save: 'SET',
    company_logo_save: 'SET',
    company_logo_delete: 'SET',
    einvoice_settings_get: 'SET',
    einvoice_settings_save: 'SET',
    einvoice_check: 'EINV',
    einvoice_generate: 'EINV',
    einvoice_cancel: 'EINV',
    einvoice_worklist: 'EINV',
    ewb_check: 'SAEWB',
    ewb_generate: 'SAEWB',
    ewb_cancel: 'SAEWB',
    ewb_update_vehicle: 'SAEWB',
    ewb_extend: 'SAEWB',
    opening_balance_list: 'ACCHA',
    opening_balance_save: 'ACCHA',
    ewb_update_transporter: 'SAEWB',
    transporter_list: 'SAEWB',
    transporter_save: 'SAEWB',
    transporter_delete: 'SAEWB',
    reminder_settings_save: 'SET',
    reminder_send: 'RTOSR',
    reminder_log: 'RTOSR',
    recurring_list: 'REC',
    recurring_save: 'REC',
    recurring_delete: 'REC',
    tax_save: 'SET',
    series_save: 'SET',
    office_asset_list: 'OIAST',
    office_asset_save: 'OIAST',
    office_asset_delete: 'OIAST',
    office_asset_status: 'OIAST',
    office_asset_details: 'OIAST',
    office_asset_assign: 'OIASG',
    office_asset_return: 'OIASG',
    office_assignment_list: 'OIASG',
};

/* Endpoints where the module depends on body.cs_type (C - customer, S - supplier) */
const CONTACT_ENDPOINTS = ['contact_list', 'contact_save', 'contact_details', 'contact_delete'];

/* Endpoints where the module depends on body.trans_type */
const TRANS_ENDPOINTS = ['transaction_list', 'transaction_save', 'transaction_details', 'transaction_delete'];

class Permission {

    /* Returns the module code needed for this request, '' when no permission check is needed */
    getModuleCode(endpoint, body) {
        if (TRANS_ENDPOINTS.includes(endpoint)) {
            return TRANS_TYPE_MODULES[body.trans_type] || '';
        }
        if (CONTACT_ENDPOINTS.includes(endpoint)) {
            return body.cs_type === 'S' ? 'MNSUP' : 'MNCUS';
        }
        return ENDPOINT_MODULES[endpoint] || '';
    }

    /* True when the role of the logged in user has the module */
    async can(dbobj, c_id, role_id, mod_code) {
        if (!mod_code) {
            return true;
        }
        let role = await dbobj.collection('ob_roles').findOne(
            { c_id: c_id, role_id: role_id, stat: CONFIG.STAT_ACTIVE },
            { projection: { _id: 0, role_code: 1, permissions: 1 } }
        );
        if (!role) {
            return false;
        }
        // The Admin role (code C) always has every module
        if (role.role_code === 'C') {
            return true;
        }
        return role.permissions.includes(mod_code);
    }
}

module.exports = new Permission();
module.exports.TRANS_TYPE_MODULES = TRANS_TYPE_MODULES;
