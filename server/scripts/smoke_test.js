/*
 * End to end check of the API. Start the server on an EMPTY database first, then run:
 *   npm test
 * It signs up a new company and walks through masters, purchase, sales, receipts, stock and reports.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT}`;
let failed_checks = 0;

function check(test_name, is_ok, detail) {
    if (is_ok) {
        console.log(`  ok    ${test_name}`);
        return;
    }
    failed_checks++;
    console.log(`  FAIL  ${test_name}`, detail === undefined ? '' : JSON.stringify(detail));
}

async function call(endpoint, body, token) {
    let headers = { 'Content-Type': 'application/json', 'x-api-key': process.env.X_API_KEY };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    let response = await fetch(`${BASE_URL}/api/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    return response.json();
}

async function main() {
    let run_id = Date.now();
    let email = `smoke_${run_id}@example.com`;
    let password = `Smoke@${run_id}`;
    let today = new Date().toISOString().slice(0, 10);

    console.log('Auth');
    let signup = await call('signup', { name: 'Smoke Tester', email, password, company_name: 'Smoke Co', state_code: '33' });
    check('signup returns token', signup.status === 'S' && !!signup.token, signup);
    let bad_login = await call('login', { email, password: 'wrong-password' });
    check('wrong password is rejected', bad_login.status === 'E', bad_login);
    let login = await call('login', { email, password });
    check('login returns token', login.status === 'S' && !!login.token, login);
    let token = login.token;
    let no_token = await call('item_list', {});
    check('endpoint without token is unauthorized', no_token.status === 'UA', no_token);

    let user_data = await call('get_user_data', {}, token);
    check('get_user_data returns company and permissions', user_data.status === 'S' && user_data.data.company.name === 'Smoke Co' && user_data.data.permissions.length > 10, user_data.status);

    console.log('Masters');
    let tax_list = await call('tax_list', {}, token);
    let gst18 = tax_list.data.find(tax => tax.tax_code === 'GST18');
    check('default GST taxes exist', tax_list.data.length === 5 && !!gst18);

    let customer_local = await call('contact_save', { cs_type: 'C', name: 'Local Customer', state_code: '33', credit_days: 10 }, token);
    let customer_other_state = await call('contact_save', { cs_type: 'C', name: 'Other State Customer', state_code: '29' }, token);
    let supplier = await call('contact_save', { cs_type: 'S', name: 'Main Supplier', state_code: '33' }, token);
    check('contacts created', customer_local.status === 'S' && customer_other_state.status === 'S' && supplier.status === 'S');
    let duplicate_contact = await call('contact_save', { cs_type: 'C', name: 'Local Customer' }, token);
    check('duplicate customer name is rejected', duplicate_contact.status === 'E');

    let bank = await call('bank_save', { bank_name: 'Test Bank', acc_name: 'Smoke Co', acc_number: '9999', opening_balance: 100000 }, token);
    check('bank created', bank.status === 'S', bank);
    let payment_modes = await call('payment_mode_list', {}, token);
    let bank_account = payment_modes.accounts.find(account => account.name.startsWith('Test Bank'));
    check('bank ledger account is available for receipts', !!bank_account);

    let product = await call('item_save', { name: 'Test Product', type: 'P', uom: 'Nos', sale_rate: 1000, purchase_rate: 600, tax_id: gst18.tax_id, opening_stk: 0, stk_level: 2 }, token);
    let service = await call('item_save', { name: 'Test Service', type: 'S', uom: 'Hrs', sale_rate: 500, tax_id: gst18.tax_id }, token);
    check('items created', product.status === 'S' && service.status === 'S', product);
    let product_id = product.item_id;

    console.log('Purchase');
    let purchase = await call('transaction_save', {
        trans_type: 'PI', trans_date: today, con_id: supplier.con_id, items: [{ item_id: product_id, qty: 10, rate: 600 }]
    }, token);
    check('purchase bill saved with total 7080 (6000 + 18% GST)', purchase.status === 'S' && purchase.data.tot_amount === 7080, purchase);
    let item_after_purchase = await call('item_details', { item_id: product_id }, token);
    check('stock is 10 after purchase', item_after_purchase.data.cur_stk === 10, item_after_purchase.data && item_after_purchase.data.cur_stk);

    console.log('Sales');
    let invoice_local = await call('transaction_save', {
        trans_type: 'SI', trans_date: today, con_id: customer_local.con_id,
        items: [{ item_id: product_id, qty: 4, rate: 1000, disc_percentage: 10 }]
    }, token);
    check('local invoice total is 4248 (3600 + CGST 324 + SGST 324)', invoice_local.status === 'S' && invoice_local.data.tot_amount === 4248, invoice_local);
    let invoice_local_details = await call('transaction_details', { trans_id: invoice_local.data.trans_id }, token);
    let local_tax_types = invoice_local_details.data.tax_summary.map(tax => tax.tax_type_code).sort().join(',');
    check('local invoice uses CGST + SGST', local_tax_types === 'CGST,SGST', local_tax_types);
    check('invoice has balanced ledger entries', invoice_local_details.data.ledger_entries.length >= 4 &&
        Math.round(invoice_local_details.data.ledger_entries.reduce((sum, entry) => sum + entry.debit - entry.credit, 0) * 100) === 0);

    let invoice_other_state = await call('transaction_save', {
        trans_type: 'SI', trans_date: today, con_id: customer_other_state.con_id, items: [{ item_id: product_id, qty: 1, rate: 1000 }]
    }, token);
    let other_state_details = await call('transaction_details', { trans_id: invoice_other_state.data.trans_id }, token);
    check('other state invoice total is 1180 with IGST', invoice_other_state.data.tot_amount === 1180 &&
        other_state_details.data.tax_summary.length === 1 && other_state_details.data.tax_summary[0].tax_type_code === 'IGST', other_state_details.data.tax_summary);
    check('invoice numbers follow the series', invoice_local.data.trans_no === 'INV-1' && invoice_other_state.data.trans_no === 'INV-2', [invoice_local.data.trans_no, invoice_other_state.data.trans_no]);

    let item_after_sales = await call('item_details', { item_id: product_id }, token);
    check('stock is 5 after selling 5', item_after_sales.data.cur_stk === 5, item_after_sales.data.cur_stk);

    console.log('Receipts');
    let receipt = await call('transaction_save', {
        trans_type: 'SP', trans_date: today, con_id: customer_local.con_id, amount: 2000, pay_acc_id: bank_account.acc_id,
        allocations: [{ trans_id: invoice_local.data.trans_id, amount: 2000 }]
    }, token);
    check('receipt saved', receipt.status === 'S', receipt);
    let too_much = await call('transaction_save', {
        trans_type: 'SP', trans_date: today, con_id: customer_local.con_id, amount: 5000, pay_acc_id: bank_account.acc_id,
        allocations: [{ trans_id: invoice_local.data.trans_id, amount: 5000 }]
    }, token);
    check('allocation above the pending amount is rejected', too_much.status === 'E', too_much);
    let wrong_contact = await call('transaction_save', {
        trans_type: 'SP', trans_date: today, con_id: customer_other_state.con_id, amount: 100, pay_acc_id: bank_account.acc_id,
        allocations: [{ trans_id: invoice_local.data.trans_id, amount: 100 }]
    }, token);
    check('allocation to another customer invoice is rejected', wrong_contact.status === 'E', wrong_contact);

    let outstanding = await call('report_outstanding', { side: 'R' }, token);
    check('receivables outstanding is 3428 (2248 + 1180)', outstanding.data.total_pending === 3428, outstanding.data.total_pending);
    let delete_with_receipt = await call('transaction_delete', { trans_id: invoice_local.data.trans_id }, token);
    check('invoice with a receipt can not be deleted', delete_with_receipt.status === 'E', delete_with_receipt);

    console.log('Edit and delete');
    let edited_invoice = await call('transaction_save', {
        trans_id: invoice_local.data.trans_id, trans_type: 'SI', trans_date: today, con_id: customer_local.con_id,
        items: [{ item_id: product_id, qty: 3, rate: 1000, disc_percentage: 10 }]
    }, token);
    check('invoice edited, total is 3186', edited_invoice.status === 'S' && edited_invoice.data.tot_amount === 3186, edited_invoice);
    let item_after_edit = await call('item_details', { item_id: product_id }, token);
    check('stock is 6 after reducing the quantity', item_after_edit.data.cur_stk === 6, item_after_edit.data.cur_stk);
    let edit_below_paid = await call('transaction_save', {
        trans_id: invoice_local.data.trans_id, trans_type: 'SI', trans_date: today, con_id: customer_local.con_id,
        items: [{ item_id: product_id, qty: 1, rate: 1000, disc_percentage: 10 }]
    }, token);
    check('invoice total below the received amount is rejected', edit_below_paid.status === 'E', edit_below_paid);
    let item_after_failed_edit = await call('item_details', { item_id: product_id }, token);
    check('failed edit leaves the stock unchanged', item_after_failed_edit.data.cur_stk === 6, item_after_failed_edit.data.cur_stk);

    console.log('Reports');
    let trial_balance = await call('report_trial_balance', {}, token);
    check('trial balance is balanced', trial_balance.data.is_balanced === true, [trial_balance.data.total_debit, trial_balance.data.total_credit]);
    // transactions always balance, so the only difference is the 100000 opening balance of the bank
    check('trial balance difference equals the bank opening balance', trial_balance.data.opening_difference === 100000, trial_balance.data.opening_difference);
    let balance_sheet = await call('report_balance_sheet', {}, token);
    check('balance sheet totals match', balance_sheet.data.total_assets === balance_sheet.data.total_liabilities, [balance_sheet.data.total_assets, balance_sheet.data.total_liabilities]);
    let profit_loss = await call('report_profit_loss', {}, token);
    // sales 3*900 + 1000 = 3700, purchase 6000, closing stock 6 x 600 = 3600 -> 3700 + 3600 - 6000 = 1300
    check('gross profit is 1300', profit_loss.data.gross_profit === 1300, profit_loss.data);
    let gst_summary = await call('report_gst_summary', {}, token);
    check('output tax 666 (486 + 180), input tax 1080', gst_summary.data.output_tax === 666 && gst_summary.data.input_tax === 1080, gst_summary.data);
    let customer_ledger = await call('report_ledger', { con_id: customer_local.con_id }, token);
    check('customer ledger closing balance is 1186 (3186 - 2000)', customer_ledger.data.closing_balance === 1186, customer_ledger.data.closing_balance);
    let stock_summary = await call('report_stock_summary', {}, token);
    check('stock summary value is 3600', stock_summary.data.total_value === 3600, stock_summary.data.total_value);
    let dashboard = await call('dashboard', {}, token);
    check('dashboard sales total is 3700', dashboard.data.sales.taxable_amount === 3700, dashboard.data.sales);
    let bank_list = await call('bank_list', {}, token);
    check('bank balance is 102000 (100000 opening + 2000 receipt)', bank_list.data[0].balance === 102000, bank_list.data[0].balance);

    console.log('Journal');
    let rent_account = (await call('account_list', { search: 'Rent' }, token)).data[0];
    let unbalanced_journal = await call('transaction_save', {
        trans_type: 'J', trans_date: today, lines: [{ acc_id: rent_account.acc_id, debit: 500 }, { acc_id: bank_account.acc_id, credit: 400 }]
    }, token);
    check('unbalanced journal is rejected', unbalanced_journal.status === 'E', unbalanced_journal);
    let journal = await call('transaction_save', {
        trans_type: 'J', trans_date: today, lines: [{ acc_id: rent_account.acc_id, debit: 500 }, { acc_id: bank_account.acc_id, credit: 500 }]
    }, token);
    check('balanced journal is saved', journal.status === 'S', journal);

    console.log('Delete');
    let receipt_delete = await call('transaction_delete', { trans_id: receipt.data.trans_id }, token);
    let invoice_delete = await call('transaction_delete', { trans_id: invoice_local.data.trans_id }, token);
    check('receipt and then invoice can be deleted', receipt_delete.status === 'S' && invoice_delete.status === 'S', [receipt_delete, invoice_delete]);
    let item_after_delete = await call('item_details', { item_id: product_id }, token);
    check('stock is 9 after deleting the invoice', item_after_delete.data.cur_stk === 9, item_after_delete.data.cur_stk);

    console.log('PDF and email');
    let pdf_response = await fetch(`${BASE_URL}/api/transaction_pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.X_API_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ trans_id: invoice_other_state.data.trans_id }) });
    let pdf_buffer = Buffer.from(await pdf_response.arrayBuffer());
    check('invoice PDF is returned', pdf_response.headers.get('content-type') === 'application/pdf' && pdf_buffer.slice(0, 4).toString() === '%PDF', pdf_response.headers.get('content-type'));
    let missing_pdf = await call('transaction_pdf', { trans_id: 999999 }, token);
    check('PDF of an unknown document is an error', missing_pdf.status === 'E', missing_pdf);
    if (!process.env.SMTP_HOST) {
        let email_result = await call('transaction_email', { trans_id: invoice_other_state.data.trans_id, to: 'a@example.com' }, token);
        check('email without SMTP settings is refused clearly', email_result.status === 'E' && /SMTP/.test(email_result.message), email_result);
    }

    console.log('Convert, stock and settings');
    let quote = await call('transaction_save', { trans_type: 'SE', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 2, rate: 1000 }] }, token);
    check('quote saved and has no stock effect', quote.status === 'S' && (await call('item_details', { item_id: product_id }, token)).data.cur_stk === 9, quote);
    let converted = await call('transaction_convert', { trans_id: quote.data.trans_id, target_trans_type: 'SI' }, token);
    check('quote converted to an invoice', converted.status === 'S' && converted.data.trans_no === 'INV-3', converted);
    check('stock is 7 after the converted invoice', (await call('item_details', { item_id: product_id }, token)).data.cur_stk === 7);
    let quote_details = await call('transaction_details', { trans_id: quote.data.trans_id }, token);
    check('quote shows the linked invoice', quote_details.data.linked_transactions.length === 1, quote_details.data.linked_transactions);
    let delete_used_quote = await call('transaction_delete', { trans_id: quote.data.trans_id }, token);
    check('a quote used by an invoice can not be deleted', delete_used_quote.status === 'E', delete_used_quote);
    let wrong_convert = await call('transaction_convert', { trans_id: quote.data.trans_id, target_trans_type: 'PI' }, token);
    check('conversion to an unrelated type is rejected', wrong_convert.status === 'E', wrong_convert);

    check('stock adjustment adds stock', (await call('stock_adjust', { item_id: product_id, qty: 5, trans_date: today, notes: 'Found in count' }, token)).cur_stk === 12);
    await call('company_update', { name: 'Smoke Co', state_code: '33', allow_negative_stock: false }, token);
    let oversell = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 100, rate: 1000 }] }, token);
    check('selling more than the stock is rejected when negative stock is off', oversell.status === 'E' && /Insufficient stock/.test(oversell.message), oversell);
    check('rejected sale leaves the stock unchanged', (await call('item_details', { item_id: product_id }, token)).data.cur_stk === 12);
    await call('company_update', { name: 'Smoke Co', state_code: '33', allow_negative_stock: true, locked_till: today }, token);
    let locked_save = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1, rate: 1000 }] }, token);
    check('saving on a locked date is rejected', locked_save.status === 'E' && locked_save.code === 'BOOKS_LOCKED', locked_save);
    await call('company_update', { name: 'Smoke Co', state_code: '33', allow_negative_stock: true, locked_till: null }, token);

    let parent_category = await call('category_save', { name: 'Electronics' }, token);
    let child_category = await call('category_save', { name: 'Laptops', parent_id: parent_category.category_id }, token);
    check('categories created', parent_category.status === 'S' && child_category.status === 'S');
    check('category with a sub category can not be deleted', (await call('category_delete', { category_id: parent_category.category_id }, token)).status === 'E');
    check('sub category then category can be deleted', (await call('category_delete', { category_id: child_category.category_id }, token)).status === 'S' &&
        (await call('category_delete', { category_id: parent_category.category_id }, token)).status === 'S');

    let new_tax = await call('tax_save', { name: 'GST 3%', details: [{ tax_type_code: 'CGST', tax_rate: 1.5, state_type: 'I' }, { tax_type_code: 'SGST', tax_rate: 1.5, state_type: 'I' }, { tax_type_code: 'IGST', tax_rate: 3, state_type: 'X' }] }, token);
    check('new tax created and deleted', new_tax.status === 'S' && (await call('tax_delete', { tax_id: new_tax.tax_id }, token)).status === 'S', new_tax);
    check('a tax used by an item can not be deleted', (await call('tax_delete', { tax_id: gst18.tax_id }, token)).status === 'E');
    check('invalid tax type is rejected', (await call('tax_save', { name: 'Bad', details: [{ tax_type_code: 'XYZ', tax_rate: 5 }] }, token)).status === 'E');

    let series_list = await call('series_list', {}, token);
    let invoice_series = series_list.data.find(series => series.trans_type === 'SI');
    let used_number = await call('series_save', { series_id: invoice_series.series_id, prefix: 'INV-', nxt_number: 2 }, token);
    check('series number that is already used is rejected', used_number.status === 'E', used_number);
    await call('series_save', { series_id: invoice_series.series_id, prefix: 'INV-', nxt_number: 50 }, token);
    let numbered_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1, rate: 1000 }] }, token);
    check('next invoice uses the changed series number', numbered_invoice.data && numbered_invoice.data.trans_no === 'INV-50', numbered_invoice);

    let extra_account = await call('account_save', { name: 'Smoke Expense', group_code: 'EI' }, token);
    check('account created', extra_account.status === 'S', extra_account);
    check('customer group account can not be created by hand', (await call('account_save', { name: 'Fake debtor', group_code: 'SD' }, token)).status === 'E');
    check('account deleted', (await call('account_delete', { acc_id: extra_account.acc_id }, token)).status === 'S');
    check('account with entries can not be deleted', (await call('account_delete', { acc_id: bank_account.acc_id }, token)).status === 'E');

    let bank_id = (await call('bank_list', {}, token)).data[0].bank_id;
    let statement_line = await call('bank_transaction_save', { bank_id, btr_date: today, description: 'Customer deposit', credit: 2000, matched_trans_id: receipt.data.trans_id }, token);
    check('bank statement line rejects a transaction that is not in the bank', statement_line.status === 'E', statement_line);
    let free_line = await call('bank_transaction_save', { bank_id, btr_date: today, description: 'Bank charges', debit: 150 }, token);
    check('bank statement line saved', free_line.status === 'S' && (await call('bank_transaction_list', { bank_id }, token)).data.length === 1, free_line);

    check('forgot password answers the same for an unknown email', (await call('forgot_password', { email: 'nobody@example.com' })).status === 'S');

    console.log('Companies');
    let second_company = await call('company_create', { name: 'Second Co', state_code: '29' }, token);
    check('second company created', second_company.status === 'S' && !!second_company.token, second_company);
    let second_user_data = await call('get_user_data', {}, second_company.token);
    check('user belongs to two companies', second_user_data.data.companies.length === 2 && second_user_data.data.company.name === 'Second Co');
    check('second company has its own empty item list', (await call('item_list', {}, second_company.token)).total_count === 0);
    check('second company can not read a document of the first company', (await call('transaction_details', { trans_id: purchase.data.trans_id }, second_company.token)).status === 'E');
    let switched = await call('switch_company', { target_c_id: user_data.data.company.c_id }, second_company.token);
    check('switch back to the first company', switched.status === 'S' && (await call('item_list', {}, switched.token)).total_count === 2, switched);

    console.log('Print templates and logo');
    let tiny_png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    let get_pdf = async (trans_id) => {
        let response = await fetch(`${BASE_URL}/api/transaction_pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.X_API_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ trans_id }) });
        let buffer = Buffer.from(await response.arrayBuffer());
        return { is_pdf: buffer.slice(0, 4).toString() === '%PDF', size: buffer.length };
    };
    let plain_pdf = await get_pdf(invoice_other_state.data.trans_id);
    check('invalid print template is rejected', (await call('print_settings_save', { template: 'fancy', accent_color: '#112233' }, token)).status === 'E');
    check('invalid colour is rejected', (await call('print_settings_save', { template: 'modern', accent_color: 'red' }, token)).status === 'E');
    check('fake image is rejected as logo', (await call('company_logo_save', { logo_data: 'data:image/png;base64,' + Buffer.from('not an image').toString('base64') }, token)).status === 'E');
    check('non image data is rejected as logo', (await call('company_logo_save', { logo_data: 'hello' }, token)).status === 'E');
    let logo_result = await call('company_logo_save', { logo_data: tiny_png }, token);
    check('PNG logo saved', logo_result.status === 'S' && /^logo_\d+_\d+\.png$/.test(logo_result.logo_file), logo_result);
    let logo_pdf = await get_pdf(invoice_other_state.data.trans_id);
    check('PDF with a logo is valid', logo_pdf.is_pdf && logo_pdf.size > plain_pdf.size, [plain_pdf, logo_pdf]);
    let bank_for_print = (await call('bank_list', {}, token)).data[0];
    for (const template of ['modern', 'compact', 'classic']) {
        let saved_settings = await call('print_settings_save', { template, accent_color: '#c0392b', footer_text: 'Thank you for your business', terms: 'Payment within 15 days.', show_bank: true, bank_id: bank_for_print.bank_id, show_signature: true }, token);
        let template_pdf = await get_pdf(invoice_other_state.data.trans_id);
        check(`${template} template gives a valid PDF`, saved_settings.status === 'S' && template_pdf.is_pdf, [saved_settings, template_pdf]);
    }
    check('print settings come back with the company', (await call('get_user_data', {}, token)).data.company.print_settings.template === 'classic');
    check('journal PDF with a template is valid', (await get_pdf(journal.data.trans_id)).is_pdf);
    check('logo can be removed', (await call('company_logo_delete', {}, token)).status === 'S' && (await call('get_user_data', {}, token)).data.company.logo_file === '');

    console.log('Price lists');
    let sales_list = await call('price_list_save', { name: 'Wholesale', list_type: 'S', adjust_percent: -10 }, token);
    check('price list created', sales_list.status === 'S', sales_list);
    check('price list with a wrong percent is rejected', (await call('price_list_save', { name: 'Bad', list_type: 'S', adjust_percent: -100 }, token)).status === 'E');
    check('price list with a duplicate item is rejected', (await call('price_list_save', { name: 'Dup', list_type: 'S', rates: [{ item_id: product_id, rate: 1 }, { item_id: product_id, rate: 2 }] }, token)).status === 'E');
    let purchase_list = await call('price_list_save', { name: 'Supplier rates', list_type: 'P', adjust_percent: 0 }, token);
    let contact_for_list = (await call('contact_details', { con_id: customer_local.con_id }, token)).data;
    check('customer can not use a purchase list', (await call('contact_save', { ...contact_for_list, cs_type: 'C', price_list_id: purchase_list.price_list_id }, token)).status === 'E');
    check('customer assigned to the sales list', (await call('contact_save', { ...contact_for_list, cs_type: 'C', price_list_id: sales_list.price_list_id }, token)).status === 'S');
    let list_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1 }] }, token);
    let list_invoice_details = await call('transaction_details', { trans_id: list_invoice.data.trans_id }, token);
    check('rate comes from the price list (1000 - 10% = 900)', list_invoice_details.data.items[0].rate === 900, list_invoice_details.data.items[0]);
    await call('price_list_save', { price_list_id: sales_list.price_list_id, name: 'Wholesale', list_type: 'S', adjust_percent: -10, rates: [{ item_id: product_id, rate: 750 }] }, token);
    let fixed_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1 }] }, token);
    check('a fixed rate of the list wins (750)', (await call('transaction_details', { trans_id: fixed_invoice.data.trans_id }, token)).data.items[0].rate === 750);
    let own_rate_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1, rate: 1234 }] }, token);
    check('a rate typed by the user is kept (1234)', (await call('transaction_details', { trans_id: own_rate_invoice.data.trans_id }, token)).data.items[0].rate === 1234);
    await call('price_list_save', { price_list_id: sales_list.price_list_id, name: 'Wholesale', list_type: 'S', adjust_percent: -10, valid_till: '2000-01-01' }, token);
    let expired_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1 }] }, token);
    check('an expired list is not used (1000)', (await call('transaction_details', { trans_id: expired_invoice.data.trans_id }, token)).data.items[0].rate === 1000);
    check('a price list used by a contact can not be deleted', (await call('price_list_delete', { price_list_id: sales_list.price_list_id }, token)).status === 'E');
    check('unused price list can be deleted', (await call('price_list_delete', { price_list_id: purchase_list.price_list_id }, token)).status === 'S');

    console.log('Recurring invoices');
    let run_cron = async () => (await fetch(`${BASE_URL}/cron/recurring_transactions`, { method: 'POST', headers: { 'x-api-key': process.env.X_API_KEY } })).json();
    check('cron endpoint needs the api key', (await (await fetch(`${BASE_URL}/cron/recurring_transactions`, { method: 'POST' })).json()).status === 'UA');
    check('recurring needs an invoice as template', (await call('recurring_save', { name: 'Bad', source_trans_id: quote.data.trans_id, frequency: 'M', next_date: today }, token)).status === 'E');
    check('recurring needs a valid frequency', (await call('recurring_save', { name: 'Bad', source_trans_id: numbered_invoice.data.trans_id, frequency: 'X', next_date: today }, token)).status === 'E');
    let profile = await call('recurring_save', { name: 'Monthly support', source_trans_id: numbered_invoice.data.trans_id, frequency: 'M', next_date: today }, token);
    check('recurring profile created', profile.status === 'S', profile);
    let first_run = await run_cron();
    check('cron created one document', first_run.status === 'S' && first_run.created >= 1, first_run);
    let repeated = await call('transaction_list', { trans_type: 'SI', search: 'Monthly support' }, token);
    check('the new invoice carries the profile name as reference', repeated.total_count === 1 && repeated.data[0].tot_amount === 1180, repeated);
    let second_run = await run_cron();
    check('a second run the same day creates nothing', second_run.created === 0, second_run);
    let recurring_list = await call('recurring_list', {}, token);
    let profile_row = recurring_list.data.find(row => row.recurring_id === profile.recurring_id);
    let expected_next = new Date(today + 'T00:00:00Z');
    expected_next.setUTCMonth(expected_next.getUTCMonth() + 1);
    check('next date moved one month and the run is counted', profile_row.run_count === 1 && new Date(profile_row.next_date).getUTCMonth() === expected_next.getUTCMonth() && profile_row.source.trans_no === numbered_invoice.data.trans_no, profile_row);
    let behind_profile = await call('recurring_save', { name: 'Weekly catch up', source_trans_id: numbered_invoice.data.trans_id, frequency: 'W', next_date: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10), end_date: today }, token);
    let catch_up_run = await run_cron();
    check('a profile that is behind creates the missed documents (3) and stops at the end date', catch_up_run.created === 3 && !(await call('recurring_list', {}, token)).data.find(row => row.recurring_id === behind_profile.recurring_id).is_active, catch_up_run);
    let doomed_invoice = await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: customer_local.con_id, items: [{ item_id: product_id, qty: 1, rate: 10 }] }, token);
    let doomed_profile = await call('recurring_save', { name: 'Doomed', source_trans_id: doomed_invoice.data.trans_id, frequency: 'M', next_date: today }, token);
    await call('transaction_delete', { trans_id: doomed_invoice.data.trans_id }, token);
    await run_cron();
    let doomed_row = (await call('recurring_list', {}, token)).data.find(row => row.recurring_id === doomed_profile.recurring_id);
    check('a profile whose template was deleted stops with a message', doomed_row.is_active === false && /deleted/.test(doomed_row.last_error), doomed_row);
    check('recurring profile can be deleted', (await call('recurring_delete', { recurring_id: profile.recurring_id }, token)).status === 'S');
    let role_check = await call('role_list', {}, token);
    check('recurring module exists for the Accountant role', role_check.data.find(role => role.role_code === 'F').permissions.includes('REC'));

    console.log('Payment reminders');
    let day_text = (offset_days) => new Date(Date.now() + offset_days * 86400000).toISOString().slice(0, 10);
    let run_reminder_job = async () => (await fetch(`${BASE_URL}/cron/payment_reminders`, { method: 'POST', headers: { 'x-api-key': process.env.X_API_KEY } })).json();
    let reminders_of = async (trans_id) => (await call('reminder_log', { trans_id }, token)).data;
    let make_invoice = async (con_id, trans_date, due_date) => (await call('transaction_save', { trans_type: 'SI', trans_date, due_date, con_id, items: [{ item_id: product_id, qty: 1, rate: 500 }] }, token)).data;

    check('invalid reminder settings are rejected', (await call('reminder_settings_save', { enabled: true, before_due_days: 99, overdue_repeat_days: 7, max_overdue_reminders: 2 }, token)).status === 'E');
    check('reminder settings saved', (await call('reminder_settings_save', { enabled: true, before_due_days: 3, overdue_repeat_days: 7, max_overdue_reminders: 2 }, token)).status === 'S');
    check('reminder settings come back with the company', (await call('get_user_data', {}, token)).data.company.reminder_settings.before_due_days === 3);

    let reminder_contact = (await call('contact_details', { con_id: customer_local.con_id }, token)).data;
    let no_email_invoice = await make_invoice(customer_local.con_id, today, day_text(2));
    let no_email_send = await call('reminder_send', { trans_id: no_email_invoice.trans_id }, token);
    check('reminder for a customer without email is refused', no_email_send.status === 'E', no_email_send);
    check('reminder for a receipt / purchase bill is refused', (await call('reminder_send', { trans_id: purchase.data.trans_id }, token)).status === 'E');

    let job_without_smtp = await run_reminder_job();
    if (!process.env.SMTP_HOST) {
        check('reminder without SMTP settings is refused clearly', (await call('reminder_send', { trans_id: no_email_invoice.trans_id }, token)).message.includes('SMTP'));
        check('reminder job is skipped without SMTP settings', job_without_smtp.skipped !== undefined, job_without_smtp);
    } else {
        await call('contact_save', { ...reminder_contact, cs_type: 'C', email: 'customer@example.com' }, token);
        let manual = await call('reminder_send', { trans_id: no_email_invoice.trans_id, message: 'Please pay this week' }, token);
        check('manual reminder sent', manual.status === 'S' && manual.message.includes('customer@example.com'), manual);

        // due in 2 days (inside the 3 day window) -> one "before" reminder, never twice
        let due_soon = await make_invoice(customer_local.con_id, today, day_text(2));
        await run_reminder_job();
        await run_reminder_job();
        let due_soon_logs = (await reminders_of(due_soon.trans_id)).filter(log => log.kind === 'before' && log.status === 'sent');
        check('a due soon invoice gets exactly one "before" reminder', due_soon_logs.length === 1, due_soon_logs);

        // overdue -> one "overdue" reminder now, the next only after 7 days
        let overdue = await make_invoice(customer_local.con_id, day_text(-30), day_text(-10));
        await run_reminder_job();
        await run_reminder_job();
        let overdue_logs = (await reminders_of(overdue.trans_id)).filter(log => log.kind === 'overdue' && log.status === 'sent');
        check('an overdue invoice gets one "overdue" reminder per 7 days', overdue_logs.length === 1, overdue_logs);

        // not due yet (10 days away), already paid, and a customer who switched reminders off
        let far_invoice = await make_invoice(customer_local.con_id, today, day_text(10));
        let paid_invoice = await make_invoice(customer_local.con_id, day_text(-30), day_text(-10));
        await call('transaction_save', { trans_type: 'SP', trans_date: today, con_id: customer_local.con_id, amount: paid_invoice.tot_amount, pay_acc_id: bank_account.acc_id, allocations: [{ trans_id: paid_invoice.trans_id, amount: paid_invoice.tot_amount }] }, token);
        let other_contact = (await call('contact_details', { con_id: customer_other_state.con_id }, token)).data;
        await call('contact_save', { ...other_contact, cs_type: 'C', email: 'off@example.com', reminders_off: true }, token);
        let opted_out_invoice = await make_invoice(customer_other_state.con_id, day_text(-30), day_text(-10));
        await run_reminder_job();
        check('no reminder when the due date is far, the invoice is paid, or the customer opted out',
            (await reminders_of(far_invoice.trans_id)).length === 0 && (await reminders_of(paid_invoice.trans_id)).length === 0 && (await reminders_of(opted_out_invoice.trans_id)).length === 0);

        let history = await call('reminder_log', {}, token);
        check('reminder history lists what was sent', history.data.length >= 3 && history.data.every(log => log.sent_to), history.data.length);
        let details_with_reminders = await call('transaction_details', { trans_id: overdue.trans_id }, token);
        check('invoice details include its reminders', details_with_reminders.data.reminders.length === 1);

        // the earlier "email an invoice" endpoint works for real now
        let email_invoice = await call('transaction_email', { trans_id: overdue.trans_id, to: 'accounts@example.com', message: 'Invoice copy' }, token);
        check('invoice emailed with the PDF', email_invoice.status === 'S', email_invoice);
    }
    await call('reminder_settings_save', { enabled: false, before_due_days: 3, overdue_repeat_days: 7, max_overdue_reminders: 2 }, token);

    console.log('GSTR-1 and GSTR-3B');
    check('GSTR-1 needs the GSTIN of the company', (await call('report_gstr1', { month: today.slice(0, 7) }, token)).status === 'E');
    let gst_signup = await call('signup', { name: 'GST Tester', email: `gst_${run_id}@example.com`, password: 'Gst@12345', company_name: 'GST Co', state_code: '33' });
    let gst_token = gst_signup.token;
    check('GST company created', gst_signup.status === 'S', gst_signup);
    check('GSTIN must be valid', (await call('company_update', { name: 'GST Co', state_code: '33', tax_no: '12345' }, gst_token)).status === 'S' && (await call('report_gstr1', { month: today.slice(0, 7) }, gst_token)).status === 'E');
    await call('company_update', { name: 'GST Co', state_code: '33', tax_no: '33AABCG1234D1Z5', allow_negative_stock: true }, gst_token);
    check('month is required', (await call('report_gstr1', { month: 'nonsense' }, gst_token)).status === 'E');

    let gst_taxes = (await call('tax_list', {}, gst_token)).data;
    let tax_of = (code) => gst_taxes.find(tax => tax.tax_code === code).tax_id;
    let new_item = async (name, type, uom, hs, rate, tax_code) => (await call('item_save', { name, type, uom, hs, sale_rate: rate, purchase_rate: rate, tax_id: tax_of(tax_code), opening_stk: 0 }, gst_token)).item_id;
    let item_a = await new_item('Laptop', 'P', 'Nos', '8471', 1000, 'GST18');
    let item_b = await new_item('Notebook', 'P', 'Pcs', '4820', 100, 'GST5');
    let item_c = await new_item('Rice', 'P', 'Kg', '1006', 100, 'GST0');
    let new_party = async (cs_type, name, state_code, tax_no) => (await call('contact_save', { cs_type, name, state_code, tax_no }, gst_token)).con_id;
    let reg_local = await new_party('C', 'Registered Local', '33', '33AABCR1234D1Z7');
    let reg_other = await new_party('C', 'Registered Other State', '29', '29AABCR9999D1Z5');
    let unreg_local = await new_party('C', 'Unregistered Local', '33', '');
    let unreg_other = await new_party('C', 'Unregistered Other State', '29', '');
    let bad_gstin = await new_party('C', 'Bad GSTIN Customer', '33', 'BAD123');
    let supplier_other = await new_party('S', 'Supplier Other State', '29', '29AABCS1111D1Z3');
    let supplier_local = await new_party('S', 'Supplier Local', '33', '33AABCS2222D1Z1');
    let save_doc = async (trans_type, con_id, items) => (await call('transaction_save', { trans_type, trans_date: today, con_id, items }, gst_token));

    // purchases first (input tax credit and stock)
    let purchase_one = await save_doc('PI', supplier_other, [{ item_id: item_a, qty: 400, rate: 800 }]);
    let purchase_two = await save_doc('PI', supplier_local, [{ item_id: item_b, qty: 50, rate: 40 }]);
    let purchase_return = await save_doc('PD', supplier_other, [{ item_id: item_a, qty: 10, rate: 800 }]);
    check('purchases saved', [purchase_one, purchase_two, purchase_return].every(doc => doc.status === 'S'), [purchase_one, purchase_two, purchase_return]);
    // sales
    let sales_docs = [
        await save_doc('SI', reg_local, [{ item_id: item_a, qty: 2, rate: 1000 }, { item_id: item_c, qty: 10, rate: 100 }]), // b2b + nil
        await save_doc('SI', reg_other, [{ item_id: item_b, qty: 100, rate: 100 }]),                                       // b2b inter
        await save_doc('SI', unreg_local, [{ item_id: item_a, qty: 1, rate: 500 }]),                                       // b2cs intra
        await save_doc('SI', unreg_other, [{ item_id: item_a, qty: 1, rate: 600 }]),                                       // b2cs inter
        await save_doc('SI', unreg_other, [{ item_id: item_a, qty: 300, rate: 1000 }]),                                    // b2cl (354000)
        await save_doc('SC', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }]),                                        // cdnr
        await save_doc('SC', unreg_local, [{ item_id: item_a, qty: 1, rate: 500 }]),                                       // reduces b2cs
        await save_doc('SI', bad_gstin, [{ item_id: item_b, qty: 10, rate: 100 }]),                                        // bad gstin -> b2cs
        await save_doc('SR', 0, [{ item_id: item_a, qty: 1, rate: 200 }]),                                                 // retail -> b2cs
    ];
    check('sales documents saved', sales_docs.every(doc => doc.status === 'S'), sales_docs.filter(doc => doc.status !== 'S'));

    let month = today.slice(0, 7);
    let gstr1 = await call('report_gstr1', { month }, gst_token);
    let g1 = gstr1.data && gstr1.data.json;
    check('GSTR-1 returns the JSON for the month', gstr1.status === 'S' && g1.gstin === '33AABCG1234D1Z5' && g1.fp === `${month.slice(5, 7)}${month.slice(0, 4)}`, gstr1.message);
    let b2b_local = g1.b2b.find(party => party.ctin === '33AABCR1234D1Z7');
    let b2b_other = g1.b2b.find(party => party.ctin === '29AABCR9999D1Z5');
    check('B2B has the two registered customers', g1.b2b.length === 2 && !!b2b_local && !!b2b_other, g1.b2b.map(party => party.ctin));
    check('B2B invoice splits tax into CGST and SGST and leaves out the nil item', b2b_local.inv.length === 1 && b2b_local.inv[0].itms.length === 1 &&
        b2b_local.inv[0].itms[0].itm_det.rt === 18 && b2b_local.inv[0].itms[0].itm_det.txval === 2000 && b2b_local.inv[0].itms[0].itm_det.camt === 180 && b2b_local.inv[0].itms[0].itm_det.samt === 180 &&
        b2b_local.inv[0].val === 3360 && b2b_local.inv[0].pos === '33' && b2b_local.inv[0].idt.length === 10, b2b_local.inv[0]);
    check('other state B2B invoice uses IGST and the place of supply', b2b_other.inv[0].pos === '29' && b2b_other.inv[0].itms[0].itm_det.iamt === 500 && b2b_other.inv[0].itms[0].itm_det.rt === 5, b2b_other.inv[0]);
    check('nil rated supply is in the nil table', g1.nil.inv.length === 1 && g1.nil.inv[0].sply_ty === 'INTRAB2B' && g1.nil.inv[0].nil_amt === 1000, g1.nil);
    check('large inter-state unregistered invoice is in B2CL', g1.b2cl.length === 1 && g1.b2cl[0].pos === '29' && g1.b2cl[0].inv[0].val === 354000 && g1.b2cl[0].inv[0].itms[0].itm_det.iamt === 54000, g1.b2cl);
    let b2cs_pick = (sply_ty, rt) => g1.b2cs.find(row => row.sply_ty === sply_ty && row.rt === rt);
    check('B2CS intra 18% = invoice 500 + retail 200 - credit note 500', b2cs_pick('INTRA', 18).txval === 200 && b2cs_pick('INTRA', 18).camt === 18 && b2cs_pick('INTRA', 18).samt === 18, g1.b2cs);
    check('B2CS inter 18% is the small unregistered invoice', b2cs_pick('INTER', 18).txval === 600 && b2cs_pick('INTER', 18).iamt === 108, g1.b2cs);
    check('a bad buyer GSTIN is reported as B2CS with a warning', b2cs_pick('INTRA', 5).txval === 1000 && gstr1.data.warnings.some(warning => warning.includes('BAD123')), gstr1.data.warnings);
    check('credit note to a registered buyer is in CDNR', g1.cdnr.length === 1 && g1.cdnr[0].ctin === '33AABCR1234D1Z7' && g1.cdnr[0].nt[0].ntty === 'C' && g1.cdnr[0].nt[0].val === 1180, g1.cdnr);
    let hsn_8471 = g1.hsn.data.find(row => row.hsn_sc === '8471');
    check('HSN summary has quantity net of the credit notes (305 - 2 = 303) and the portal unit code', hsn_8471.qty === 303 && hsn_8471.uqc === 'NOS' && g1.hsn.data.find(row => row.hsn_sc === '4820').uqc === 'PCS', g1.hsn.data);

    // the return must agree with the books
    let register = await call('report_sales_register', { from_date: `${month}-01`, to_date: today }, gst_token);
    let s1 = gstr1.data.summary;
    check('GSTR-1 taxable value = sales register (tables + notes + nil)', Math.round((s1.b2b.txval + s1.b2cl.txval + s1.b2cs.txval + s1.notes_txval + s1.nil.amount) * 100) === Math.round(register.data.taxable_amount * 100),
        [s1.b2b.txval + s1.b2cl.txval + s1.b2cs.txval + s1.notes_txval + s1.nil.amount, register.data.taxable_amount]);
    check('GSTR-1 tax = sales register tax', Math.round((s1.tax.iamt + s1.tax.camt + s1.tax.samt + s1.tax.csamt) * 100) === Math.round(register.data.tot_tax * 100), [s1.tax, register.data.tot_tax]);

    let gstr3b = await call('report_gstr3b', { month }, gst_token);
    let g3 = gstr3b.data && gstr3b.data.json;
    check('GSTR-3B returns the JSON for the month', gstr3b.status === 'S' && g3.ret_period === g1.fp, gstr3b.message);
    check('3B outward taxable value and tax equal GSTR-1', Math.round(g3.sup_details.osup_det.txval * 100) === Math.round((s1.b2b.txval + s1.b2cl.txval + s1.b2cs.txval + s1.notes_txval) * 100) &&
        g3.sup_details.osup_det.iamt === s1.tax.iamt && g3.sup_details.osup_det.camt === s1.tax.camt && g3.sup_details.osup_det.samt === s1.tax.samt, [g3.sup_details.osup_det, s1.tax]);
    check('3B nil rated outward supply is 1000', g3.sup_details.osup_nil_exmp.txval === 1000);
    check('3B inter-state supplies to unregistered buyers by place of supply', g3.inter_sup.unreg_details.length === 1 && g3.inter_sup.unreg_details[0].pos === '29' &&
        g3.inter_sup.unreg_details[0].txval === 300600 && g3.inter_sup.unreg_details[0].iamt === 54108, g3.inter_sup.unreg_details);
    check('3B input tax credit = purchases minus the debit note (IGST 57600 - 1440, CGST 50, SGST 50)', g3.itc_elg.itc_net.iamt === 56160 && g3.itc_elg.itc_net.camt === 50 && g3.itc_elg.itc_net.samt === 50 &&
        g3.itc_elg.itc_avl.find(row => row.ty === 'OTH').iamt === 56160, g3.itc_elg.itc_net);
    let gst_summary_check = await call('report_gst_summary', { from_date: `${month}-01`, to_date: today }, gst_token);
    check('3B input credit agrees with the GST summary report', gst_summary_check.data.input_tax === g3.itc_elg.itc_net.iamt + g3.itc_elg.itc_net.camt + g3.itc_elg.itc_net.samt, [gst_summary_check.data.input_tax, g3.itc_elg.itc_net]);
    check('3B payable is output minus credit per head', gstr3b.data.summary.payable.iamt === Math.round((gstr3b.data.summary.output.iamt - 56160) * 100) / 100);
    check('another company does not see these documents', (await call('report_gstr1', { month }, token)).status === 'E');
    check('a month without documents gives empty tables', (await call('report_gstr1', { month: '2020-01' }, gst_token)).data.json.b2b.length === 0);

    console.log('GSTR-2B reconciliation');
    let portal_doc = (ctin, inum, txval, igst, cgst, sgst) => ({ ctin, trdnm: 'Supplier', inv: [{ inum, typ: 'R', dt: '01-01-2026', val: txval + igst + cgst + sgst, pos: '33', rev: 'N', itcavl: 'Y', txval, igst, cgst, sgst, cess: 0 }] });
    let gstr2b_file = {
        data: {
            gstin: '33AABCG1234D1Z5', rtnprd: month,
            docdata: {
                b2b: [
                    portal_doc('29AABCS1111D1Z3', ` ${purchase_one.data.trans_no.toLowerCase().replace(/[^a-z0-9]/g, '')} `, 320000, 57600, 0, 0),   // same number written differently
                    portal_doc('33AABCS2222D1Z1', 'SUP/9', 2000, 0, 50, 50),                                                                       // other number, same amounts
                    portal_doc('27AABCX0000D1Z9', 'X-1', 1000, 0, 90, 90)                                                                            // not in the books
                ],
                cdnr: [{ ctin: '29AABCS1111D1Z3', trdnm: 'Supplier', nt: [{ ntnum: purchase_return.data.trans_no, typ: 'C', dt: '01-01-2026', val: 9540, txval: 8000, igst: 1540, cgst: 0, sgst: 0, cess: 0 }] }] // tax differs by 100
            }
        }
    };
    let rec = await call('report_gstr2b', { month, gstr2b: gstr2b_file }, gst_token);
    let rec_status = (trans_no) => (rec.data.rows.find(row => row.book && row.book.trans_no === trans_no) || {}).status;
    check('GSTR-2B reconciliation runs', rec.status === 'S', rec.message);
    check('same supplier and number is MATCHED even when written differently', rec_status(purchase_one.data.trans_no) === 'MATCHED', rec.data.rows.map(row => row.status));
    check('same supplier and amounts with another number is PROBABLE', rec_status(purchase_two.data.trans_no) === 'PROBABLE');
    check('a different amount is a MISMATCH and the difference is shown', rec_status(purchase_return.data.trans_no) === 'MISMATCH' &&
        rec.data.rows.find(row => row.status === 'MISMATCH').differences.iamt === -100, rec.data.rows.find(row => row.status === 'MISMATCH'));
    check('a portal document missing in the books is NOT_IN_BOOKS', rec.data.summary.not_in_books === 1 && rec.data.rows.find(row => row.status === 'NOT_IN_BOOKS').portal.ctin === '27AABCX0000D1Z9');
    check('summary counts', rec.data.summary.matched === 1 && rec.data.summary.probable === 1 && rec.data.summary.mismatch === 1 && rec.data.summary.not_in_portal === 0, rec.data.summary);
    check('ITC of the portal = invoices minus the credit note (IGST 57600 - 1540, CGST 50 + 90)',
        rec.data.summary.itc_portal.iamt === 57600 - 1540 && rec.data.summary.itc_portal.camt === 140, rec.data.summary.itc_portal);
    check('ITC of the books agrees with the 3B input credit (IGST 57600 - 1440, CGST 50)',
        rec.data.summary.itc_books.iamt === 56160 && rec.data.summary.itc_books.camt === 50, rec.data.summary.itc_books);
    let rec_empty = await call('report_gstr2b', { month, gstr2b: { data: { docdata: { b2b: [portal_doc('27AABCX0000D1Z9', 'X-1', 1000, 0, 90, 90)] } } } }, gst_token);
    check('books documents the portal does not have are NOT_IN_PORTAL', rec_empty.data.summary.not_in_portal === 3 && rec_empty.data.summary.matched === 0, rec_empty.data.summary);
    check('a file that is not GSTR-2B is refused', (await call('report_gstr2b', { month, gstr2b: { hello: 1 } }, gst_token)).status === 'E');
    check('the file is required', (await call('report_gstr2b', { month }, gst_token)).status === 'E');

    console.log('Export, SEZ, reverse charge, composition, GSTR-9 and GSTR-4');
    let ex_signup = await call('signup', { name: 'Export Tester', email: `exp_${run_id}@example.com`, password: 'Exp@12345', company_name: 'Export Co', state_code: '33' });
    let ex_token = ex_signup.token;
    await call('company_update', { name: 'Export Co', state_code: '33', tax_no: '33AABCE5555D1Z2', allow_negative_stock: true }, ex_token);
    let ex_taxes = (await call('tax_list', {}, ex_token)).data;
    let ex_tax_of = (code) => ex_taxes.find(tax => tax.tax_code === code).tax_id;
    let ex_item = async (name, tax_code) => (await call('item_save', { name, type: 'P', uom: 'Nos', hs: '8471', sale_rate: 1000, purchase_rate: 100, tax_id: ex_tax_of(tax_code), opening_stk: 0 }, ex_token)).item_id;
    let ex_item_18 = await ex_item('Machine', 'GST18');
    let ex_item_0 = await ex_item('Grain', 'GST0');
    let ex_party = async (cs_type, name, state_code, tax_no, gst_treatment) => (await call('contact_save', { cs_type, name, state_code, tax_no, gst_treatment }, ex_token));
    let abroad = (await ex_party('C', 'Overseas Buyer', '', '', 'EXPORT')).con_id;
    let sez_buyer = (await ex_party('C', 'SEZ Buyer', '29', '29AABCZ1234D1Z9', 'SEZ')).con_id;
    let local_buyer = (await ex_party('C', 'Local Buyer', '33', '33AABCL1234D1Z4', 'REG')).con_id;
    let rcm_supplier = (await ex_party('S', 'Unregistered Supplier', '33', '', 'REG')).con_id;
    let comp_supplier = (await ex_party('S', 'Composition Supplier', '33', '33AABCK1234D1Z6', 'COMP')).con_id;
    check('a customer can not be a composition dealer', (await ex_party('C', 'Bad', '33', '', 'COMP')).status === 'E');
    check('a supplier can not be an SEZ', (await ex_party('S', 'Bad2', '33', '', 'SEZ')).status === 'E');
    let ex_doc = (trans_type, con_id, items, extra) => call('transaction_save', { trans_type, trans_date: today, con_id, items, ...(extra || {}) }, ex_token);

    let export_paid = await ex_doc('SI', abroad, [{ item_id: ex_item_18, qty: 2, rate: 1000 }]);
    let export_lut = await ex_doc('SI', abroad, [{ item_id: ex_item_18, qty: 1, rate: 1000 }], { zero_rated: true });
    let sez_lut = await ex_doc('SI', sez_buyer, [{ item_id: ex_item_18, qty: 1, rate: 500 }], { zero_rated: true });
    let sez_paid = await ex_doc('SI', sez_buyer, [{ item_id: ex_item_18, qty: 1, rate: 500 }]);
    check('export with payment of tax charges IGST (360 on 2000)', export_paid.status === 'S' && export_paid.data.tot_amount === 2360, export_paid);
    check('export without payment of tax charges no tax', export_lut.status === 'S' && export_lut.data.tot_amount === 1000, export_lut);
    check('SEZ sale without payment is 500, with payment IGST 90 even inside the state', sez_lut.data.tot_amount === 500 && sez_paid.data.tot_amount === 590, [sez_lut, sez_paid]);
    check('"without payment of tax" is refused for a normal customer', (await ex_doc('SI', local_buyer, [{ item_id: ex_item_18, qty: 1, rate: 100 }], { zero_rated: true })).status === 'E');
    check('reverse charge is refused on a sale', (await ex_doc('SI', local_buyer, [{ item_id: ex_item_18, qty: 1, rate: 100 }], { reverse_charge: true })).status === 'E');
    let local_sale = await ex_doc('SI', local_buyer, [{ item_id: ex_item_18, qty: 1, rate: 100 }]);
    let cancelled_sale = await ex_doc('SI', local_buyer, [{ item_id: ex_item_18, qty: 1, rate: 100 }]);
    check('a sale can be deleted (cancelled)', (await call('transaction_delete', { trans_id: cancelled_sale.data.trans_id }, ex_token)).status === 'S');

    let rcm_purchase = await ex_doc('PI', rcm_supplier, [{ item_id: ex_item_18, qty: 10, rate: 100 }], { reverse_charge: true });
    check('reverse charge purchase: the supplier is owed the taxable value only', rcm_purchase.status === 'S' && rcm_purchase.data.tot_amount === 1000, rcm_purchase);
    check('composition supplier can not charge tax', (await ex_doc('PI', comp_supplier, [{ item_id: ex_item_18, qty: 1, rate: 100 }])).status === 'E');
    check('composition supplier bill without tax is saved', (await ex_doc('PI', comp_supplier, [{ item_id: ex_item_0, qty: 5, rate: 100 }])).status === 'S');
    let ex_trial = await call('report_trial_balance', {}, ex_token);
    check('books stay balanced with reverse charge', ex_trial.status === 'S' && ex_trial.data.is_balanced && Math.abs(ex_trial.data.total_debit - ex_trial.data.total_credit) < 0.01, ex_trial.data);

    let ex_g1 = await call('report_gstr1', { month }, ex_token);
    let ex_json = ex_g1.data && ex_g1.data.json;
    check('GSTR-1 of the export company runs', ex_g1.status === 'S', ex_g1.message);
    let wpay = ex_json.exp.find(group => group.exp_typ === 'WPAY');
    let wopay = ex_json.exp.find(group => group.exp_typ === 'WOPAY');
    check('exports with payment are in table 6A (WPAY) with IGST', wpay.inv.length === 1 && wpay.inv[0].itms[0].itm_det.txval === 2000 && wpay.inv[0].itms[0].itm_det.iamt === 360 && wpay.inv[0].itms[0].itm_det.rt === 18, ex_json.exp);
    check('exports without payment are WOPAY with the rate kept and no tax', wopay.inv.length === 1 && wopay.inv[0].itms[0].itm_det.iamt === 0 && wopay.inv[0].itms[0].itm_det.rt === 18 && wopay.inv[0].itms[0].itm_det.txval === 1000, ex_json.exp);
    let sez_group = ex_json.b2b.find(party => party.ctin === '29AABCZ1234D1Z9');
    check('SEZ invoices are in B2B with type SEWP / SEWOP', !!sez_group && sez_group.inv.length === 2 && sez_group.inv.some(inv => inv.inv_typ === 'SEWP') && sez_group.inv.some(inv => inv.inv_typ === 'SEWOP') && sez_group.inv[0].pos === '29', sez_group);
    check('the export is not reported in the nil table', ex_json.nil.inv.length === 0, ex_json.nil);
    check('summary shows exports and SEZ', ex_g1.data.summary.exp.count === 2 && ex_g1.data.summary.exp.txval === 3000 && ex_g1.data.summary.sez.count === 2 && ex_g1.data.summary.sez.txval === 1000, ex_g1.data.summary);
    let issued = ex_json.doc_issue.doc_det.find(nature => nature.doc_num === 1);
    check('document issue table: 6 invoices, 1 cancelled', !!issued && issued.docs.length === 1 && issued.docs[0].totnum === 6 && issued.docs[0].cancel === 1 && issued.docs[0].net_issue === 5 &&
        issued.docs[0].from === export_paid.data.trans_no && issued.docs[0].to === cancelled_sale.data.trans_no, issued);

    let ex_g3 = await call('report_gstr3b', { month }, ex_token);
    let ex_3b = ex_g3.data.json;
    check('3B: exports and SEZ in the zero rated table (3.1 b) with the IGST paid', ex_3b.sup_details.osup_zero.txval === 4000 && ex_3b.sup_details.osup_zero.iamt === 450, ex_3b.sup_details.osup_zero);
    check('3B: reverse charge purchase in 3.1 d and credit under ISRC', ex_3b.sup_details.isup_rev.txval === 1000 && ex_3b.sup_details.isup_rev.camt === 90 && ex_3b.sup_details.isup_rev.samt === 90 &&
        ex_3b.itc_elg.itc_avl.find(row => row.ty === 'ISRC').camt === 90, [ex_3b.sup_details.isup_rev, ex_3b.itc_elg.itc_avl]);
    check('3B: composition supplier purchase is in the nil / exempt inward table', ex_3b.inward_sup.isup_details.find(row => row.ty === 'GST').intra === 500, ex_3b.inward_sup);
    check('3B: payable = export IGST 450, the reverse charge tax is paid and taken as credit, plus the local sale (CGST / SGST 9 each)',
        ex_g3.data.summary.payable.iamt === 450 && ex_g3.data.summary.payable.camt === 9 && ex_g3.data.summary.payable.samt === 9, ex_g3.data.summary.payable);

    let fy_year = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    let g9 = await call('report_gstr9', { year: fy_year }, ex_token);
    check('GSTR-9 adds up the twelve months', g9.status === 'S' && g9.data.months.length === 12 && g9.data.tables['4C'].txval === 3000 && g9.data.tables['4D'].txval === 1000 &&
        g9.data.tables['4B'].txval === 100 && g9.data.tables['9'].iamt === 450 && g9.data.tables['6_rcm'].camt === 90, g9.data && g9.data.tables);
    check('GSTR-9 needs a year', (await call('report_gstr9', {}, ex_token)).status === 'E');
    check('GSTR-4 is only for composition companies', (await call('report_gstr4', { year: fy_year }, ex_token)).status === 'E');

    // Composition company
    let cp_signup = await call('signup', { name: 'Comp Tester', email: `cmp_${run_id}@example.com`, password: 'Cmp@12345', company_name: 'Comp Co', state_code: '33' });
    let cp_token = cp_signup.token;
    check('company can be set to the composition scheme', (await call('company_update', { name: 'Comp Co', state_code: '33', tax_no: '33AABCC9999D1Z8', gst_scheme: 'COMPOSITION', composition_rate: 1 }, cp_token)).status === 'S');
    check('an unknown scheme is refused', (await call('company_update', { name: 'Comp Co', state_code: '33', gst_scheme: 'OTHER' }, cp_token)).status === 'E');
    let cp_taxes = (await call('tax_list', {}, cp_token)).data;
    let cp_item = async (tax_code) => (await call('item_save', { name: `Goods ${tax_code}`, type: 'P', uom: 'Nos', hs: '1006', sale_rate: 100, purchase_rate: 50, tax_id: cp_taxes.find(tax => tax.tax_code === tax_code).tax_id, opening_stk: 0 }, cp_token)).item_id;
    let cp_taxed = await cp_item('GST18');
    let cp_free = await cp_item('GST0');
    let cp_buyer = (await call('contact_save', { cs_type: 'C', name: 'Walk In', state_code: '33' }, cp_token)).con_id;
    check('a composition company can not charge GST', (await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: cp_buyer, items: [{ item_id: cp_taxed, qty: 1, rate: 100 }] }, cp_token)).status === 'E');
    check('a composition company bills without tax', (await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: cp_buyer, items: [{ item_id: cp_free, qty: 10, rate: 100 }] }, cp_token)).status === 'S');
    check('GSTR-1 and GSTR-3B are refused for a composition company', (await call('report_gstr1', { month }, cp_token)).status === 'E' && (await call('report_gstr3b', { month }, cp_token)).status === 'E');
    let g4 = await call('report_gstr4', { year: fy_year }, cp_token);
    check('GSTR-4: turnover 1000, tax 1% = 10 (CGST 5 + SGST 5)', g4.status === 'S' && g4.data.totals.turnover === 1000 && g4.data.totals.tax === 10 && g4.data.totals.cgst === 5 && g4.data.totals.sgst === 5 && g4.data.quarters.length === 4, g4.data);

    console.log('Credit limit, tags, discount, price slabs, opening balances, stock valuation, barcode');
    let p3_signup = await call('signup', { name: 'Phase3 Tester', email: `p3_${run_id}@example.com`, password: 'P3@12345', company_name: 'Phase3 Co', state_code: '33' });
    let p3_token = p3_signup.token;
    await call('company_update', { name: 'Phase3 Co', state_code: '33', tax_no: '33AABCP3333D1Z7', allow_negative_stock: true }, p3_token);
    let p3_taxes = (await call('tax_list', {}, p3_token)).data;
    let p3_no_tax = p3_taxes.find(tax => tax.tax_code === 'GST0').tax_id;
    let p3_item = async (name, type, extra) => call('item_save', { name, type, uom: 'Nos', hs: '8471', sale_rate: 200, purchase_rate: 100, tax_id: p3_no_tax, opening_stk: 0, ...(extra || {}) }, p3_token);
    let p3_widget = await p3_item('Widget', 'P', { barcode: 'BC-1' });
    let p3_service = await p3_item('Consulting', 'S');
    check('items saved', p3_widget.status === 'S' && p3_service.status === 'S', [p3_widget, p3_service]);
    check('a barcode belongs to one item only', (await p3_item('Widget Two', 'P', { barcode: 'BC-1' })).status === 'E');
    check('the item list finds an item by barcode', (await call('item_list', { search: 'BC-1' }, p3_token)).data.some(item => item.item_id === p3_widget.item_id));
    let p3_party = async (cs_type, name, extra) => call('contact_save', { cs_type, name, state_code: '33', ...(extra || {}) }, p3_token);
    let p3_doc = (trans_type, con_id, items, extra) => call('transaction_save', { trans_type, trans_date: today, con_id, items, ...(extra || {}) }, p3_token);

    // credit limit
    let p3_limited = await p3_party('C', 'Limited Buyer', { credit_limit: 1000 });
    check('a negative credit limit is refused', (await p3_party('C', 'Negative Limit', { credit_limit: -5 })).status === 'E');
    check('a sale inside the credit limit is saved', (await p3_doc('SI', p3_limited.con_id, [{ item_id: p3_service.item_id, qty: 3, rate: 200 }])).status === 'S');
    let over_limit = await p3_doc('SI', p3_limited.con_id, [{ item_id: p3_service.item_id, qty: 2.5, rate: 200 }]);
    check('a sale above the credit limit is refused', over_limit.status === 'E' && over_limit.code === 'CREDIT_LIMIT_EXCEEDED', over_limit);
    check('a sale paid at once does not use the credit limit', (await call('transaction_save', { trans_type: 'SI', trans_date: today, con_id: p3_limited.con_id, items: [{ item_id: p3_service.item_id, qty: 2.5, rate: 200 }],
        payments: [{ acc_id: (await call('payment_mode_list', {}, p3_token)).accounts[0].acc_id, amount: 500 }] }, p3_token)).status === 'S');
    await p3_party('C', 'Limited Buyer', { con_id: p3_limited.con_id, credit_limit: 1000, credit_block: false });
    check('with block off the limit is not enforced', (await p3_doc('SI', p3_limited.con_id, [{ item_id: p3_service.item_id, qty: 5, rate: 200 }])).status === 'S');

    // tags
    let tagged = await p3_party('C', 'Tagged Buyer', { tags: ['Wholesale ', 'north', 'wholesale'] });
    check('tags are cleaned: lower case, no duplicates', tagged.status === 'S' && (await call('contact_list', { cs_type: 'C', tag: 'WHOLESALE' }, p3_token)).data[0].tags.join() === 'wholesale,north');
    check('contacts can be listed by tag', (await call('contact_list', { cs_type: 'C', tag: 'north' }, p3_token)).data.length === 1 && (await call('contact_list', { cs_type: 'C', tag: 'south' }, p3_token)).data.length === 0);
    check('more than 10 tags are refused', (await p3_party('C', 'Many Tags', { tags: Array.from({ length: 11 }, (_, index) => `tag${index}`) })).status === 'E');

    // customer discount and quantity slabs
    let discount_buyer = await p3_party('C', 'Discount Buyer', { discount: 10 });
    let discounted = await p3_doc('SI', discount_buyer.con_id, [{ item_id: p3_service.item_id, qty: 10, rate: 200 }]);
    check('the customer discount is the default discount of the line (10% of 2000)', discounted.status === 'S' && discounted.data.tot_amount === 1800, discounted);
    let own_discount = await p3_doc('SI', discount_buyer.con_id, [{ item_id: p3_service.item_id, qty: 10, rate: 200, disc_percentage: 0 }]);
    check('a line with its own discount keeps it', own_discount.data.tot_amount === 2000, own_discount);

    let slab_list = await call('price_list_save', { name: 'Volume', list_type: 'S', adjust_percent: 0, rates: [{ item_id: p3_service.item_id, rate: 190, slabs: [{ min_qty: 100, rate: 150 }, { min_qty: 10, rate: 180 }] }] }, p3_token);
    check('price list with quantity slabs saved', slab_list.status === 'S', slab_list);
    check('a slab with quantity 0 is refused', (await call('price_list_save', { name: 'Bad slab', list_type: 'S', rates: [{ item_id: p3_service.item_id, rate: 190, slabs: [{ min_qty: 0, rate: 1 }] }] }, p3_token)).status === 'E');
    check('two slabs with the same quantity are refused', (await call('price_list_save', { name: 'Same slab', list_type: 'S', rates: [{ item_id: p3_service.item_id, rate: 190, slabs: [{ min_qty: 5, rate: 1 }, { min_qty: 5, rate: 2 }] }] }, p3_token)).status === 'E');
    let slab_buyer = await p3_party('C', 'Slab Buyer', { price_list_id: slab_list.price_list_id });
    let slab_total = async (qty) => (await p3_doc('SI', slab_buyer.con_id, [{ item_id: p3_service.item_id, qty }])).data.tot_amount;
    check('below the first slab the fixed rate is used (5 x 190)', await slab_total(5) === 950);
    check('quantity 10 reaches the first slab (10 x 180)', await slab_total(10) === 1800);
    check('quantity 99 is still in the first slab (99 x 180)', await slab_total(99) === 17820);
    check('quantity 120 reaches the second slab (120 x 150)', await slab_total(120) === 18000);

    // stock valuation
    let p3_supplier = (await p3_party('S', 'Widget Supplier')).con_id;
    let p3_customer = (await p3_party('C', 'Widget Customer')).con_id;
    await p3_doc('PI', p3_supplier, [{ item_id: p3_widget.item_id, qty: 10, rate: 100 }]);
    await p3_doc('PI', p3_supplier, [{ item_id: p3_widget.item_id, qty: 10, rate: 120 }]);
    await p3_doc('SI', p3_customer, [{ item_id: p3_widget.item_id, qty: 15, rate: 200 }]);
    let stock_value = async (method) => (await call('report_stock_summary', { method }, p3_token)).data.total_value;
    check('stock value with the master rate: 5 x 100', await stock_value('MASTER') === 500);
    check('stock value FIFO: the 5 left are from the newest purchase (5 x 120)', await stock_value('FIFO') === 600);
    check('stock value by average cost: 5 x 110', await stock_value('AVERAGE') === 550);
    check('the default method is the master rate', await stock_value(undefined) === 500);
    check('an unknown method is refused', (await call('report_stock_summary', { method: 'LIFO' }, p3_token)).status === 'E');
    await p3_doc('SC', p3_customer, [{ item_id: p3_widget.item_id, qty: 2, rate: 200 }]);
    check('a sales return comes in at the cost of the stock, not at the selling price (FIFO 7 x 120, average 7 x 110)', await stock_value('FIFO') === 840 && await stock_value('AVERAGE') === 770);
    let fifo_rows = (await call('report_stock_summary', { method: 'FIFO' }, p3_token)).data.rows;
    check('the rate of a row is the value divided by the quantity', fifo_rows.find(row => row.item_id === p3_widget.item_id).rate === 120);

    // opening balances
    let opening_list = await call('opening_balance_list', {}, p3_token);
    let cash_row = opening_list.data.rows.find(row => row.name === 'Cash');
    check('opening balance list has every account', opening_list.status === 'S' && !!cash_row && opening_list.data.rows.some(row => row.is_equity_account), opening_list.message);
    check('opening balances need a list', (await call('opening_balance_save', { balances: [] }, p3_token)).status === 'E');
    check('an unknown account is refused', (await call('opening_balance_save', { balances: [{ acc_id: 99999999, opening_balance: 5 }] }, p3_token)).status === 'E');
    check('a balance must be a number', (await call('opening_balance_save', { balances: [{ acc_id: cash_row.acc_id, opening_balance: 'abc' }] }, p3_token)).status === 'E');
    let unbalanced = await call('opening_balance_save', { balances: [{ acc_id: cash_row.acc_id, opening_balance: 25000 }] }, p3_token);
    check('without the equity entry the difference is told', unbalanced.status === 'S' && unbalanced.difference === 25000 && unbalanced.message.includes('25000'), unbalanced);
    let balanced = await call('opening_balance_save', { balances: [{ acc_id: cash_row.acc_id, opening_balance: 25000 }], balance_to_equity: true }, p3_token);
    check('with balance_to_equity the opening balance equity takes the other side', balanced.status === 'S' && balanced.difference === 0, balanced);
    let opening_after = await call('opening_balance_list', {}, p3_token);
    check('debit and credit of the openings are equal (25000)', opening_after.data.total_debit === 25000 && opening_after.data.total_credit === 25000 && opening_after.data.difference === 0, opening_after.data);
    let p3_trial = await call('report_trial_balance', {}, p3_token);
    check('the trial balance stays balanced', p3_trial.data.is_balanced && p3_trial.data.opening_difference === 0, p3_trial.data);

    console.log('E-invoice and e-way bill');
    let crypto = require('crypto');
    let { MongoClient } = require('mongodb');
    let poke_client = new MongoClient(process.env.MONGODB_URI);
    await poke_client.connect();
    let poke_transactions = poke_client.db(process.env.DB_NAME).collection('ob_transactions');
    let pdf_of = async (trans_id) => {
        let response = await fetch(`${BASE_URL}/api/transaction_pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.X_API_KEY, Authorization: `Bearer ${gst_token}` }, body: JSON.stringify({ trans_id }) });
        let buffer = Buffer.from(await response.arrayBuffer());
        return { is_pdf: buffer.slice(0, 4).toString() === '%PDF', size: buffer.length };
    };
    let einv = async (endpoint, body) => call(endpoint, body, gst_token);
    let year_now = Number(today.slice(0, 4));
    let fy_start = Number(today.slice(5, 7)) >= 4 ? year_now : year_now - 1;
    let fy_text = `${fy_start}-${String(fy_start + 1).slice(2)}`;
    let expected_irn = (trans_no, type) => crypto.createHash('sha256').update(`33AABCG1234D1Z5${fy_text}${type}${trans_no}`).digest('hex');
    let get_doc = async (trans_id) => (await einv('transaction_details', { trans_id })).data;

    let einv_settings = await einv('einvoice_settings_get', {});
    let provider_name = einv_settings.data.provider;
    check('e-invoice is off by default', einv_settings.status === 'S' && einv_settings.data.enabled === false && einv_settings.data.gstin_is_valid === true, einv_settings);

    let einv_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 2, rate: 1000 }])).data;
    let off_check = await einv('einvoice_check', { trans_id: einv_doc.trans_id });
    check('check says e-invoice is not switched on', off_check.data.errors.some(error => error.includes('not switched on')), off_check.data);
    check('generate is refused while e-invoice is off', (await einv('einvoice_generate', { trans_id: einv_doc.trans_id })).status === 'E');

    check('settings need a valid mode', (await einv('einvoice_settings_save', { enabled: true, mode: 'live' })).status === 'E');
    if (provider_name === 'mock') {
        check('production is refused with the test provider', (await einv('einvoice_settings_save', { enabled: true, mode: 'production', api_username: 'u', api_password: 'p' })).status === 'E');
    }
    check('settings saved', (await einv('einvoice_settings_save', { enabled: true, mode: 'sandbox', ewb_only: false, api_username: 'gstuser', api_password: 'pw-secret-9' })).status === 'S');
    let settings_after = await einv('einvoice_settings_get', {});
    check('settings show the user and that a password exists, never the password', settings_after.data.api_username === 'gstuser' && settings_after.data.has_password === true && !JSON.stringify(settings_after).includes('pw-secret-9'), settings_after);
    let company_json = JSON.stringify((await call('get_user_data', {}, gst_token)).data);
    check('the password is not in the user data either', !company_json.includes('pw-secret-9') && !company_json.includes('api_password'));
    await einv('einvoice_settings_save', { enabled: true, mode: 'sandbox', api_username: 'gstuser' }); // empty password keeps the old one
    check('saving without a password keeps the saved one', (await einv('einvoice_settings_get', {})).data.has_password === true);

    // the document has no addresses yet
    let missing_check = await einv('einvoice_check', { trans_id: einv_doc.trans_id });
    check('check lists the missing addresses and PIN codes', missing_check.data.errors.some(error => error.includes('company address')) && missing_check.data.errors.some(error => error.includes('PIN code')) && missing_check.data.payload === null, missing_check.data.errors);
    let refused = await einv('einvoice_generate', { trans_id: einv_doc.trans_id });
    check('generate is refused until the data is complete', refused.status === 'E' && refused.message.includes('can not be sent'), refused);

    await call('company_update', { name: 'GST Co', state_code: '33', tax_no: '33AABCG1234D1Z5', address1: '5 Anna Salai', city: 'Chennai', zip: '600002', phone: '9876543210', email: 'books@gstco.example', allow_negative_stock: true }, gst_token);
    let with_address = async (con_id, address) => {
        let details = (await einv('contact_details', { con_id })).data;
        return call('contact_save', { ...details, cs_type: details.cs_type, addresses: [address] }, gst_token);
    };
    await with_address(reg_local, { address1: '12 Main Road', city: 'Chennai', zip: '600001' });
    await with_address(reg_other, { address1: '7 MG Road', city: 'Bengaluru', zip: '560001' });

    let ready_check = await einv('einvoice_check', { trans_id: einv_doc.trans_id });
    let sent_payload = ready_check.data.payload;
    check('a complete document has no errors', ready_check.data.errors.length === 0, ready_check.data.errors);
    check('payload follows the IRP schema 1.1', sent_payload.Version === '1.1' && sent_payload.TranDtls.SupTyp === 'B2B' && sent_payload.DocDtls.Typ === 'INV' &&
        sent_payload.DocDtls.No === einv_doc.trans_no && /^\d{2}\/\d{2}\/\d{4}$/.test(sent_payload.DocDtls.Dt) &&
        sent_payload.SellerDtls.Gstin === '33AABCG1234D1Z5' && sent_payload.SellerDtls.Pin === 600002 && sent_payload.SellerDtls.Stcd === '33' && sent_payload.SellerDtls.Ph === '9876543210' &&
        sent_payload.BuyerDtls.Gstin === '33AABCR1234D1Z7' && sent_payload.BuyerDtls.Pos === '33' && sent_payload.BuyerDtls.Pin === 600001, sent_payload);
    check('payload item and totals are right (2 x 1000, CGST 180 + SGST 180)', sent_payload.ItemList.length === 1 && sent_payload.ItemList[0].HsnCd === '8471' && sent_payload.ItemList[0].IsServc === 'N' && sent_payload.ItemList[0].Unit === 'NOS' &&
        sent_payload.ItemList[0].Qty === 2 && sent_payload.ItemList[0].UnitPrice === 1000 && sent_payload.ItemList[0].TotAmt === 2000 && sent_payload.ItemList[0].AssAmt === 2000 && sent_payload.ItemList[0].GstRt === 18 &&
        sent_payload.ItemList[0].CgstAmt === 180 && sent_payload.ItemList[0].SgstAmt === 180 && sent_payload.ItemList[0].IgstAmt === 0 && sent_payload.ItemList[0].TotItemVal === 2360 &&
        sent_payload.ValDtls.AssVal === 2000 && sent_payload.ValDtls.CgstVal === 180 && sent_payload.ValDtls.TotInvVal === einv_doc.tot_amount, sent_payload.ItemList[0]);

    let pdf_before_irn = await pdf_of(einv_doc.trans_id);
    let generated = await einv('einvoice_generate', { trans_id: einv_doc.trans_id });
    check('IRN generated', generated.status === 'S' && /^[0-9a-f]{64}$/.test(generated.data.irn), generated);
    check('the IRN follows the IRP rule (SHA-256 of GSTIN + financial year + type + number)', generated.data.irn === expected_irn(einv_doc.trans_no, 'INV'), [generated.data.irn, expected_irn(einv_doc.trans_no, 'INV')]);
    let doc_with_irn = await get_doc(einv_doc.trans_id);
    check('the document stores the IRN, acknowledgement and QR text', doc_with_irn.einvoice.status === 'ACT' && doc_with_irn.einvoice.irn === generated.data.irn && !!doc_with_irn.einvoice.ack_no && !!doc_with_irn.einvoice.signed_qr && doc_with_irn.einvoice.provider === provider_name, doc_with_irn.einvoice);
    check('a second generate is refused', (await einv('einvoice_generate', { trans_id: einv_doc.trans_id })).status === 'E');
    let locked_edit = await call('transaction_save', { trans_id: einv_doc.trans_id, trans_type: 'SI', trans_date: today, con_id: reg_local, items: [{ item_id: item_a, qty: 1, rate: 1000 }] }, gst_token);
    check('an invoice with an IRN can not be edited', locked_edit.status === 'E' && locked_edit.code === 'EINVOICE_LOCKED', locked_edit);
    check('an invoice with an IRN can not be deleted', (await call('transaction_delete', { trans_id: einv_doc.trans_id }, gst_token)).code === 'EINVOICE_LOCKED');
    let pdf_with_irn = await pdf_of(einv_doc.trans_id);
    check('the PDF with the QR code and IRN is valid and bigger', pdf_with_irn.is_pdf && pdf_with_irn.size > pdf_before_irn.size + 500, [pdf_before_irn, pdf_with_irn]);

    let done_list = await einv('einvoice_worklist', { kind: 'einvoice_done' });
    let pending_list = await einv('einvoice_worklist', { kind: 'einvoice_pending' });
    check('worklists: the document is in "done" and not in "pending"', done_list.data.some(row => row.trans_id === einv_doc.trans_id) && !pending_list.data.some(row => row.trans_id === einv_doc.trans_id) && pending_list.total_count >= 1, [done_list.total_count, pending_list.total_count]);
    check('worklist kind is checked', (await einv('einvoice_worklist', { kind: 'nonsense' })).status === 'E');

    // ---- document rules
    let rule_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
    let unregistered_doc = (await save_doc('SI', unreg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
    check('e-invoice needs a registered buyer', (await einv('einvoice_check', { trans_id: unregistered_doc.trans_id })).data.errors.some(error => error.includes('valid GSTIN')));
    let bad_number_doc = (await call('transaction_save', { trans_type: 'SI', trans_no: '0BAD-1', trans_date: today, con_id: reg_local, items: [{ item_id: item_a, qty: 1, rate: 1000 }] }, gst_token)).data;
    check('a document number starting with 0 is refused', (await einv('einvoice_check', { trans_id: bad_number_doc.trans_id })).data.errors.some(error => error.includes('Document number')));
    let old_doc = (await call('transaction_save', { trans_type: 'SI', trans_date: '2022-01-01', con_id: reg_local, items: [{ item_id: item_a, qty: 1, rate: 1000 }] }, gst_token)).data;
    check('a document before 01 Sep 2022 is refused', (await einv('einvoice_check', { trans_id: old_doc.trans_id })).data.errors.some(error => error.includes('01 Sep 2022')));
    let no_hsn_item = (await call('item_save', { name: 'No HSN Item', type: 'P', uom: 'Nos', hs: '', sale_rate: 100, tax_id: tax_of('GST18'), opening_stk: 0 }, gst_token)).item_id;
    let no_hsn_doc = (await save_doc('SI', reg_local, [{ item_id: no_hsn_item, qty: 1, rate: 100 }])).data;
    check('an item without HSN is refused', (await einv('einvoice_check', { trans_id: no_hsn_doc.trans_id })).data.errors.some(error => error.includes('HSN code')));
    let odd_tax = (await call('tax_save', { name: 'GST 9%', details: [{ tax_type_code: 'CGST', tax_rate: 4.5, state_type: 'I' }, { tax_type_code: 'SGST', tax_rate: 4.5, state_type: 'I' }, { tax_type_code: 'IGST', tax_rate: 9, state_type: 'X' }] }, gst_token)).tax_id;
    let odd_tax_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000, tax_id: odd_tax }])).data;
    check('a GST rate the IRP does not know is refused', (await einv('einvoice_check', { trans_id: odd_tax_doc.trans_id })).data.errors.some(error => error.includes('9%')));
    let service_item = (await call('item_save', { name: 'Consulting', type: 'S', uom: 'Hrs', hs: '9983', sale_rate: 1000, tax_id: tax_of('GST18') }, gst_token)).item_id;
    let service_doc = (await save_doc('SI', reg_local, [{ item_id: service_item, qty: 2, rate: 1000 }])).data;
    let service_check = await einv('einvoice_check', { trans_id: service_doc.trans_id });
    check('a service with a SAC code passes and is marked as a service', service_check.data.errors.length === 0 && service_check.data.payload.ItemList[0].IsServc === 'Y' && service_check.data.payload.ItemList[0].Unit === 'OTH', service_check.data.errors);
    let inter_doc = (await save_doc('SI', reg_other, [{ item_id: item_b, qty: 100, rate: 100 }])).data;
    let inter_payload = (await einv('einvoice_check', { trans_id: inter_doc.trans_id })).data.payload;
    check('an inter-state invoice has IGST only and the buyer state as place of supply', inter_payload.ItemList[0].IgstAmt === 500 && inter_payload.ItemList[0].CgstAmt === 0 && inter_payload.BuyerDtls.Pos === '29' && inter_payload.BuyerDtls.Stcd === '29' && inter_payload.ItemList[0].Unit === 'PCS', inter_payload.ItemList[0]);

    // credit note of an invoice that has an IRN
    let note_source = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 3, rate: 1000 }])).data;
    await einv('einvoice_generate', { trans_id: note_source.trans_id });
    let credit_note = (await call('transaction_convert', { trans_id: note_source.trans_id, target_trans_type: 'SC' }, gst_token)).data;
    let note_check = await einv('einvoice_check', { trans_id: credit_note.trans_id });
    check('a credit note is sent as CRN with the referred invoice', note_check.data.errors.length === 0 && note_check.data.payload.DocDtls.Typ === 'CRN' && note_check.data.payload.RefDtls.PrecDocDtls[0].InvNo === note_source.trans_no, note_check.data);
    let note_irn = await einv('einvoice_generate', { trans_id: credit_note.trans_id });
    check('the credit note gets its own IRN', note_irn.status === 'S' && note_irn.data.irn === expected_irn(credit_note.trans_no, 'CRN'), note_irn);

    // ---- e-way bill by IRN
    let ewb_bad = await einv('ewb_check', { trans_id: einv_doc.trans_id, trans_mode: 1, distance: 120 });
    check('the e-way bill needs a vehicle or a transporter', ewb_bad.data.errors.some(error => error.includes('vehicle number')), ewb_bad.data);
    check('a wrong vehicle number is refused', (await einv('ewb_check', { trans_id: einv_doc.trans_id, vehicle_no: 'BADVEH', distance: 10 })).data.errors.some(error => error.includes('vehicle number looks wrong')));
    check('rail / air / ship need the transport document', (await einv('ewb_check', { trans_id: einv_doc.trans_id, trans_mode: 2, distance: 10 })).data.errors.some(error => error.includes('transport document')));
    check('a distance above 4000 km is refused', (await einv('ewb_check', { trans_id: einv_doc.trans_id, vehicle_no: 'TN09AB1234', distance: 5000 })).data.errors.some(error => error.includes('Distance')));
    check('an invalid transporter id is refused', (await einv('ewb_check', { trans_id: einv_doc.trans_id, vehicle_no: 'TN09AB1234', distance: 10, transporter_gstin: '123' })).data.errors.some(error => error.includes('transporter id')));
    check('a service-only invoice can not get an e-way bill', (await einv('ewb_check', { trans_id: service_doc.trans_id, vehicle_no: 'TN09AB1234', distance: 10 })).data.errors.some(error => error.includes('only services')));
    check('a credit note can not get an e-way bill', (await einv('ewb_check', { trans_id: credit_note.trans_id, vehicle_no: 'TN09AB1234', distance: 10 })).data.errors.some(error => error.includes('only for invoices')));

    let transport = { trans_id: einv_doc.trans_id, trans_mode: 1, distance: 120, vehicle_no: 'tn 09 ab-1234', vehicle_type: 'R', transporter_gstin: '33AABCT1234D1Z9', transporter_name: 'Fast Cargo' };
    let ewb_made = await einv('ewb_generate', transport);
    check('e-way bill generated through the IRN', ewb_made.status === 'S' && /^\d{12}$/.test(ewb_made.data.ewb_no) && ewb_made.data.via === 'irn', ewb_made);
    check('a value below Rs. 50,000 gives a warning, not an error', ewb_made.warnings.some(warning => warning.includes('below Rs. 50000')), ewb_made.warnings);
    let doc_with_ewb = await get_doc(einv_doc.trans_id);
    check('the document stores the e-way bill with the cleaned vehicle number', doc_with_ewb.ewb.status === 'ACT' && doc_with_ewb.ewb.vehicle_no === 'TN09AB1234' && doc_with_ewb.ewb.transporter_name === 'Fast Cargo' && !!doc_with_ewb.ewb.valid_till, doc_with_ewb.ewb);
    check('a second e-way bill is refused', (await einv('ewb_generate', transport)).status === 'E');
    check('the PDF with an e-way bill is valid', (await pdf_of(einv_doc.trans_id)).is_pdf);
    check('the IRN can not be cancelled while the e-way bill is active', (await einv('einvoice_cancel', { trans_id: einv_doc.trans_id, reason: 2 })).message.includes('Cancel the e-way bill'));
    check('worklist shows the e-way bill as done', (await einv('einvoice_worklist', { kind: 'ewb_done' })).data.some(row => row.trans_id === einv_doc.trans_id));

    check('vehicle update checks the vehicle number', (await einv('ewb_update_vehicle', { trans_id: einv_doc.trans_id, vehicle_no: 'X', from_place: 'Chennai', from_state: '33', reason_code: 1 })).status === 'E');
    check('vehicle update needs the place and state', (await einv('ewb_update_vehicle', { trans_id: einv_doc.trans_id, vehicle_no: 'TN10CD5678', from_place: '', from_state: '33', reason_code: 1 })).status === 'E');
    check('vehicle updated', (await einv('ewb_update_vehicle', { trans_id: einv_doc.trans_id, vehicle_no: 'TN10CD5678', from_place: 'Chennai', from_state: '33', reason_code: 1, reason_remark: 'Breakdown' })).status === 'S');
    let doc_after_vehicle = await get_doc(einv_doc.trans_id);
    check('the new vehicle and the history are saved', doc_after_vehicle.ewb.vehicle_no === 'TN10CD5678' && doc_after_vehicle.ewb.vehicle_history.length === 1, doc_after_vehicle.ewb);

    // ---- extend the validity and change the transporter (the fake IRP of the taxpro run does not have these two actions)
    if (provider_name === 'mock') {
        let extend_input = { trans_id: einv_doc.trans_id, vehicle_no: 'TN10CD5678', from_place: 'Salem', from_state: '33', from_pincode: '636001', remaining_distance: 450, reason_code: 5, reason_remark: 'Road block' };
        check('validity can not be extended long before it ends', (await einv('ewb_extend', extend_input)).code === 'EXTEND_WINDOW');
        let two_hours_left = new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
        await poke_transactions.updateOne({ trans_id: einv_doc.trans_id }, { $set: { 'ewb.valid_till': two_hours_left } });
        check('extend needs the PIN code of the place', (await einv('ewb_extend', { ...extend_input, from_pincode: '' })).code === 'PLACE_REQUIRED');
        check('extend needs the remaining distance', (await einv('ewb_extend', { ...extend_input, remaining_distance: 0 })).code === 'DISTANCE_INVALID');
        check('extend needs a reason', (await einv('ewb_extend', { ...extend_input, reason_code: 9 })).code === 'REASON_REQUIRED');
        check('validity extended 1 day per 200 km (450 km = 3 days)', (await einv('ewb_extend', extend_input)).status === 'S');
        let doc_after_extend = await get_doc(einv_doc.trans_id);
        check('the new end date and the history are saved', doc_after_extend.ewb.valid_till > two_hours_left && doc_after_extend.ewb.extend_history.length === 1 && doc_after_extend.ewb.extend_history[0].old_valid_till === two_hours_left, doc_after_extend.ewb);
        check('transporter update needs a valid GSTIN', (await einv('ewb_update_transporter', { trans_id: einv_doc.trans_id, transporter_gstin: '123' })).code === 'TRANSPORTER_INVALID');
        check('transporter updated', (await einv('ewb_update_transporter', { trans_id: einv_doc.trans_id, transporter_gstin: '33AABCT7777D1Z4', transporter_name: 'New Cargo' })).status === 'S');
        let doc_after_transporter = await get_doc(einv_doc.trans_id);
        check('the new transporter and the history are saved', doc_after_transporter.ewb.transporter_gstin === '33AABCT7777D1Z4' && doc_after_transporter.ewb.transporter_history.length === 1, doc_after_transporter.ewb);
        check('the same transporter again is refused', (await einv('ewb_update_transporter', { trans_id: einv_doc.trans_id, transporter_gstin: '33AABCT7777D1Z4' })).code === 'TRANSPORTER_SAME');
        check('a document without an e-way bill can not be extended', (await einv('ewb_extend', { ...extend_input, trans_id: sales_docs[2].data.trans_id })).code === 'EWB_NOT_ACTIVE');
    }
    check('e-way bill cancel needs a reason', (await einv('ewb_cancel', { trans_id: einv_doc.trans_id, reason: 9 })).status === 'E');
    check('e-way bill cancelled', (await einv('ewb_cancel', { trans_id: einv_doc.trans_id, reason: 2, remark: 'Order cancelled' })).status === 'S');
    check('a cancelled e-way bill can not be cancelled again', (await einv('ewb_cancel', { trans_id: einv_doc.trans_id, reason: 2 })).status === 'E');
    check('a cancelled e-way bill does not lock the document: it is still locked by the IRN', (await call('transaction_save', { trans_id: einv_doc.trans_id, trans_type: 'SI', trans_date: today, con_id: reg_local, items: [{ item_id: item_a, qty: 1, rate: 1000 }] }, gst_token)).code === 'EINVOICE_LOCKED');

    // ---- cancel the IRN
    check('IRN cancel needs a valid reason', (await einv('einvoice_cancel', { trans_id: einv_doc.trans_id, reason: 7 })).status === 'E');
    check('IRN cancel remark is limited to 100 characters', (await einv('einvoice_cancel', { trans_id: einv_doc.trans_id, reason: 2, remark: 'x'.repeat(101) })).status === 'E');
    check('IRN cancelled', (await einv('einvoice_cancel', { trans_id: einv_doc.trans_id, reason: 2, remark: 'Wrong quantity' })).status === 'S');
    let doc_cancelled = await get_doc(einv_doc.trans_id);
    check('the cancel is saved with the reason', doc_cancelled.einvoice.status === 'CNL' && doc_cancelled.einvoice.cancel_reason === 2 && doc_cancelled.einvoice.cancel_remark === 'Wrong quantity', doc_cancelled.einvoice);
    check('a cancelled IRN can not be cancelled again', (await einv('einvoice_cancel', { trans_id: einv_doc.trans_id, reason: 2 })).status === 'E');
    check('a cancelled document number can not be reported again', (await einv('einvoice_generate', { trans_id: einv_doc.trans_id })).message.includes('cancelled'));
    check('a document with a cancelled IRN can be deleted', (await call('transaction_delete', { trans_id: einv_doc.trans_id }, gst_token)).status === 'S');

    let cancel_delete_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
    await einv('einvoice_generate', { trans_id: cancel_delete_doc.trans_id });
    let cancel_and_delete = await einv('einvoice_cancel', { trans_id: cancel_delete_doc.trans_id, reason: 1, also_delete: true });
    check('cancel with also_delete removes the document too', cancel_and_delete.status === 'S' && (await einv('transaction_details', { trans_id: cancel_delete_doc.trans_id })).status === 'E', cancel_and_delete);

    // ---- the 24 hour window (the time is moved back in the database)
    let late_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
    await einv('einvoice_generate', { trans_id: late_doc.trans_id });
    await poke_transactions.updateOne({ trans_id: late_doc.trans_id, c_id: (await call('get_user_data', {}, gst_token)).data.company.c_id }, { $set: { 'einvoice.generated_on': new Date(Date.now() - 25 * 3600000) } });
    let late_cancel = await einv('einvoice_cancel', { trans_id: late_doc.trans_id, reason: 2 });
    check('an IRN older than 24 hours can not be cancelled', late_cancel.status === 'E' && late_cancel.code === 'CANCEL_TIMEOUT', late_cancel);
    let late_ewb_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
    await einv('einvoice_generate', { trans_id: late_ewb_doc.trans_id });
    await einv('ewb_generate', { trans_id: late_ewb_doc.trans_id, vehicle_no: 'TN09AB1234', distance: 50 });
    await poke_transactions.updateOne({ trans_id: late_ewb_doc.trans_id, c_id: (await call('get_user_data', {}, gst_token)).data.company.c_id }, { $set: { 'ewb.generated_on': new Date(Date.now() - 25 * 3600000) } });
    check('an e-way bill older than 24 hours can not be cancelled', (await einv('ewb_cancel', { trans_id: late_ewb_doc.trans_id, reason: 2 })).code === 'CANCEL_TIMEOUT');

    // ---- e-way bill without an IRN (invoice to an unregistered buyer, delivery challan)
    let direct_buyer = (await call('contact_save', { cs_type: 'C', name: 'Direct Buyer', state_code: '29', tax_no: '', addresses: [{ address1: '9 Brigade Road', city: 'Bengaluru', zip: '560025' }] }, gst_token)).con_id;
    let direct_doc = (await save_doc('SI', direct_buyer, [{ item_id: item_a, qty: 60, rate: 1000 }])).data;
    check('without an address the direct e-way bill is refused', (await einv('ewb_check', { trans_id: (await save_doc('SI', unreg_other, [{ item_id: item_a, qty: 1, rate: 1000 }])).data.trans_id, vehicle_no: 'TN09AB1234', distance: 10 })).data.errors.some(error => error.includes('address')));
    let direct_made = await einv('ewb_generate', { trans_id: direct_doc.trans_id, trans_mode: 1, distance: 350, vehicle_no: 'TN09AB1234' });
    check('direct e-way bill generated for an unregistered buyer', direct_made.status === 'S' && direct_made.data.via === 'direct' && /^\d{12}$/.test(direct_made.data.ewb_no) && direct_made.warnings.length === 0, direct_made);
    let challan = (await save_doc('SH', direct_buyer, [{ item_id: item_a, qty: 5, rate: 1000 }])).data;
    check('delivery challan gets an e-way bill', (await einv('ewb_generate', { trans_id: challan.trans_id, vehicle_no: 'TN09AB1234', distance: 100 })).status === 'S');
    check('a document with an active e-way bill can not be edited', (await call('transaction_save', { trans_id: direct_doc.trans_id, trans_type: 'SI', trans_date: today, con_id: direct_buyer, items: [{ item_id: item_a, qty: 1, rate: 1000 }] }, gst_token)).code === 'EWB_LOCKED');
    check('e-way bill pending list holds big invoices without e-way bill', (await einv('einvoice_worklist', { kind: 'ewb_pending' })).data.every(row => row.tot_amount >= 50000 && !(row.ewb && row.ewb.status === 'ACT')));

    // ---- transporters
    check('transporter needs a valid GSTIN', (await einv('transporter_save', { name: 'Bad', gstin: '123' })).status === 'E');
    let transporter = await einv('transporter_save', { name: 'Fast Cargo', gstin: '33AABCT1234D1Z9' });
    check('transporter saved', transporter.status === 'S', transporter);
    check('transporter GSTIN must be unique', (await einv('transporter_save', { name: 'Other', gstin: '33AABCT1234D1Z9' })).status === 'E');
    check('transporter list and delete', (await einv('transporter_list', {})).data.length === 1 && (await einv('transporter_delete', { tp_id: transporter.tp_id })).status === 'S' && (await einv('transporter_list', {})).data.length === 0);

    // ---- only with the real adapter (talking to the fake IRP): login errors and duplicate IRN recovery
    if (provider_name === 'taxpro') {
        let login_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
        await einv('einvoice_settings_save', { enabled: true, mode: 'sandbox', api_username: 'baduser', api_password: 'pw' });
        let bad_login = await einv('einvoice_generate', { trans_id: login_doc.trans_id });
        check('a wrong portal login gives a clear message', bad_login.status === 'E' && bad_login.message.includes('Login to the e-invoice portal failed') && bad_login.message.includes('1002'), bad_login);
        await einv('einvoice_settings_save', { enabled: true, mode: 'sandbox', api_username: 'gstuser', api_password: 'pw-secret-9' });
        let first_irn = await einv('einvoice_generate', { trans_id: login_doc.trans_id });
        check('the adapter logs in and registers the invoice', first_irn.status === 'S', first_irn);
        // the answer is lost: the IRN is removed here, the IRP answers "duplicate IRN" and the adapter takes the existing details
        await poke_transactions.updateOne({ trans_id: login_doc.trans_id }, { $unset: { einvoice: '' } });
        let recovered = await einv('einvoice_generate', { trans_id: login_doc.trans_id });
        check('a duplicate IRN (error 2150) is recovered with the same IRN', recovered.status === 'S' && recovered.data.irn === first_irn.data.irn, recovered);
        let bad_pin_doc = (await save_doc('SI', reg_local, [{ item_id: item_a, qty: 1, rate: 1000 }])).data;
        await poke_client.db(process.env.DB_NAME).collection('ob_contacts').updateOne({ con_id: reg_local }, { $set: { 'addresses.0.zip': '12' } });
        check('the check stops a wrong PIN before the IRP is called', (await einv('einvoice_generate', { trans_id: bad_pin_doc.trans_id })).message.includes('PIN code'));
    }
    check('the call log has the successes and the failures', (await poke_client.db(process.env.DB_NAME).collection('ob_einvoice_log').countDocuments({ is_ok: true })) > 5);
    await poke_client.close();

    console.log('Permissions');
    let role_list = await call('role_list', {}, token);
    let sales_role = role_list.data.find(role => role.role_code === 'S');
    let sales_email = `sales_${run_id}@example.com`;
    let new_user = await call('user_save', { name: 'Sales User', email: sales_email, password: 'Sales@123', role_id: sales_role.role_id }, token);
    check('sales user created', new_user.status === 'S', new_user);
    let sales_login = await call('login', { email: sales_email, password: 'Sales@123' });
    let sales_token = sales_login.token;
    let sales_items = await call('item_list', {}, sales_token);
    check('sales user can list items', sales_items.status === 'S', sales_items);
    let sales_report = await call('report_trial_balance', {}, sales_token);
    check('sales user can not open the trial balance', sales_report.status === 'E', sales_report);
    let sales_purchase = await call('transaction_save', { trans_type: 'PI', trans_date: today, con_id: supplier.con_id, items: [{ item_id: product_id, qty: 1 }] }, sales_token);
    check('sales user can not save a purchase bill', sales_purchase.status === 'E', sales_purchase);
    check('sales user can not open the GST returns', (await call('report_gstr1', { month: today.slice(0, 7) }, sales_token)).status === 'E' && (await call('report_gstr3b', { month: today.slice(0, 7) }, sales_token)).status === 'E');
    check('sales user can not use e-invoice, e-way bill or transporters', (await call('einvoice_generate', { trans_id: 1 }, sales_token)).status === 'E' && (await call('ewb_generate', { trans_id: 1 }, sales_token)).status === 'E' && (await call('transporter_list', {}, sales_token)).status === 'E' && (await call('einvoice_settings_get', {}, sales_token)).status === 'E');

    console.log(failed_checks === 0 ? '\nAll checks passed' : `\n${failed_checks} check(s) failed`);
    process.exit(failed_checks === 0 ? 0 : 1);
}

main().catch(error => {
    console.error('Smoke test crashed', error);
    process.exit(1);
});
