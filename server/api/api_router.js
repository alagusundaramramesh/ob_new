const express = require('express').Router;
const TOKEN_AUTH = require('./middleware/token_auth');

class api_router {
	create() {
		let route = express();

		/* ROUTING TO MIDDLEWARE FOR X-API-KEY AND TOKEN AUTHENTICATION */
		route.use('/', TOKEN_AUTH);

		/* API ENDPOINTS */
		/* PRE-LOGIN (x-api-key only) */
		route.use('/login', require('./routes/login'));
		route.use('/signup', require('./routes/signup'));
		route.use('/forgot_password', require('./routes/forgot_password'));
		route.use('/reset_password', require('./routes/reset_password'));

		/* ACCOUNT, COMPANY, USERS, ROLES */
		route.use('/get_user_data', require('./routes/get_user_data'));
		route.use('/switch_company', require('./routes/switch_company'));
		route.use('/change_password', require('./routes/change_password'));
		route.use('/company_update', require('./routes/company_update'));
		route.use('/company_create', require('./routes/company_create'));
		route.use('/user_list', require('./routes/user_list'));
		route.use('/user_save', require('./routes/user_save'));
		route.use('/user_delete', require('./routes/user_delete'));
		route.use('/role_list', require('./routes/role_list'));
		route.use('/role_save', require('./routes/role_save'));

		/* DASHBOARD */
		route.use('/dashboard', require('./routes/dashboard'));

		/* ACCOUNTS */
		route.use('/account_group_list', require('./routes/account_group_list'));
		route.use('/account_list', require('./routes/account_list'));
		route.use('/account_save', require('./routes/account_save'));
		route.use('/account_delete', require('./routes/account_delete'));

		/* CONTACTS (customers and suppliers) */
		route.use('/contact_list', require('./routes/contact_list'));
		route.use('/contact_save', require('./routes/contact_save'));
		route.use('/contact_details', require('./routes/contact_details'));
		route.use('/contact_delete', require('./routes/contact_delete'));

		/* ITEMS AND STOCK */
		route.use('/item_list', require('./routes/item_list'));
		route.use('/item_save', require('./routes/item_save'));
		route.use('/item_details', require('./routes/item_details'));
		route.use('/item_delete', require('./routes/item_delete'));
		route.use('/stock_adjust', require('./routes/stock_adjust'));
		route.use('/category_list', require('./routes/category_list'));
		route.use('/category_save', require('./routes/category_save'));
		route.use('/category_delete', require('./routes/category_delete'));

		/* SETTINGS */
		route.use('/tax_list', require('./routes/tax_list'));
		route.use('/tax_save', require('./routes/tax_save'));
		route.use('/tax_delete', require('./routes/tax_delete'));
		route.use('/series_list', require('./routes/series_list'));
		route.use('/series_save', require('./routes/series_save'));
		route.use('/payment_mode_list', require('./routes/payment_mode_list'));
		route.use('/payment_mode_save', require('./routes/payment_mode_save'));

		/* BANKING */
		route.use('/bank_list', require('./routes/bank_list'));
		route.use('/bank_save', require('./routes/bank_save'));
		route.use('/bank_transaction_list', require('./routes/bank_transaction_list'));
		route.use('/bank_transaction_save', require('./routes/bank_transaction_save'));

		/* TRANSACTIONS (invoices, bills, receipts, journals ...) */
		route.use('/transaction_list', require('./routes/transaction_list'));
		route.use('/transaction_save', require('./routes/transaction_save'));
		route.use('/transaction_details', require('./routes/transaction_details'));
		route.use('/transaction_delete', require('./routes/transaction_delete'));
		route.use('/transaction_convert', require('./routes/transaction_convert'));
		route.use('/transaction_pdf', require('./routes/transaction_pdf'));
		route.use('/transaction_email', require('./routes/transaction_email'));

		/* PRICE LISTS, RECURRING INVOICES, PRINT SETTINGS */
		route.use('/price_list_list', require('./routes/price_list_list'));
		route.use('/price_list_save', require('./routes/price_list_save'));
		route.use('/price_list_delete', require('./routes/price_list_delete'));
		route.use('/recurring_list', require('./routes/recurring_list'));
		route.use('/recurring_save', require('./routes/recurring_save'));
		route.use('/recurring_delete', require('./routes/recurring_delete'));
		route.use('/reminder_settings_save', require('./routes/reminder_settings_save'));
		route.use('/reminder_send', require('./routes/reminder_send'));
		route.use('/reminder_log', require('./routes/reminder_log'));

		/* E-INVOICE AND E-WAY BILL */
		route.use('/einvoice_settings_get', require('./routes/einvoice_settings_get'));
		route.use('/einvoice_settings_save', require('./routes/einvoice_settings_save'));
		route.use('/einvoice_check', require('./routes/einvoice_check'));
		route.use('/einvoice_generate', require('./routes/einvoice_generate'));
		route.use('/einvoice_cancel', require('./routes/einvoice_cancel'));
		route.use('/einvoice_worklist', require('./routes/einvoice_worklist'));
		route.use('/ewb_check', require('./routes/ewb_check'));
		route.use('/ewb_generate', require('./routes/ewb_generate'));
		route.use('/ewb_cancel', require('./routes/ewb_cancel'));
		route.use('/ewb_update_vehicle', require('./routes/ewb_update_vehicle'));
		route.use('/ewb_extend', require('./routes/ewb_extend'));
		route.use('/opening_balance_list', require('./routes/opening_balance_list'));
		route.use('/opening_balance_save', require('./routes/opening_balance_save'));
		route.use('/ewb_update_transporter', require('./routes/ewb_update_transporter'));
		route.use('/transporter_list', require('./routes/transporter_list'));
		route.use('/transporter_save', require('./routes/transporter_save'));
		route.use('/transporter_delete', require('./routes/transporter_delete'));
		route.use('/print_settings_save', require('./routes/print_settings_save'));
		route.use('/company_logo_save', require('./routes/company_logo_save'));
		route.use('/company_logo_delete', require('./routes/company_logo_delete'));

		/* OFFICE INVENTORY (computers, laptops ... given to employees) */
		route.use('/office_asset_list', require('./routes/office_asset_list'));
		route.use('/office_asset_save', require('./routes/office_asset_save'));
		route.use('/office_asset_delete', require('./routes/office_asset_delete'));
		route.use('/office_asset_status', require('./routes/office_asset_status'));
		route.use('/office_asset_details', require('./routes/office_asset_details'));
		route.use('/office_asset_assign', require('./routes/office_asset_assign'));
		route.use('/office_asset_return', require('./routes/office_asset_return'));
		route.use('/office_assignment_list', require('./routes/office_assignment_list'));

		/* REPORTS */
		route.use('/report_ledger', require('./routes/report_ledger'));
		route.use('/report_daybook', require('./routes/report_daybook'));
		route.use('/report_trial_balance', require('./routes/report_trial_balance'));
		route.use('/report_profit_loss', require('./routes/report_profit_loss'));
		route.use('/report_balance_sheet', require('./routes/report_balance_sheet'));
		route.use('/report_sales_register', require('./routes/report_sales_register'));
		route.use('/report_purchase_register', require('./routes/report_purchase_register'));
		route.use('/report_outstanding', require('./routes/report_outstanding'));
		route.use('/report_item_sales', require('./routes/report_item_sales'));
		route.use('/report_stock_summary', require('./routes/report_stock_summary'));
		route.use('/report_stock_ledger', require('./routes/report_stock_ledger'));
		route.use('/report_gst_summary', require('./routes/report_gst_summary'));
		route.use('/report_gstr1', require('./routes/report_gstr1'));
		route.use('/report_gstr3b', require('./routes/report_gstr3b'));
		route.use('/report_gstr2b', require('./routes/report_gstr2b'));
		route.use('/report_gstr9', require('./routes/report_gstr9'));
		route.use('/report_gstr4', require('./routes/report_gstr4'));

		return route;
	}
}

module.exports = new api_router();
