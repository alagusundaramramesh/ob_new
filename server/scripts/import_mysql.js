/*
 * Copies the data of ONE company from the old PHP (MySQL) database into the MongoDB collections of this project.
 *
 *   node scripts/import_mysql.js --company 3 --dry-run     (reads and converts, writes nothing)
 *   node scripts/import_mysql.js --company 3               (writes to MongoDB)
 *
 * MySQL connection: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (same values as the PHP env.php).
 * No MySQL driver? Export each table to <table>.json and use:  --from-json ./export_folder
 * Read docs/MYSQL_IMPORT.md before running it on real data.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const { ensureIndexes } = require('../common/indexes');
const SYS_DATA = require('../common/sys_data');
const CONFIG = require('../common/inc.config');
const UTILS = require('../utils/util.functions');
const TRANSACTION = require('../classes/class.transaction');
const COMPANY_SETUP = require('../classes/class.company_setup');

const args = process.argv.slice(2);
const getArg = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const IS_DRY_RUN = args.includes('--dry-run');
const C_ID = parseInt(getArg('--company'));
const JSON_FOLDER = getArg('--from-json');

/* ---------------------------------------------------------------- reading the source */

// phpMyAdmin writes every value as text ("59", "100.00"). The MySQL driver gives real numbers, so JSON rows are converted the same way.
// These columns hold text that only looks like a number sometimes (item code 123, phone, invoice number), so they stay text.
const TEXT_COLUMNS = [
    'name', 'company', 'itemCode', 'SKU', 'HS', 'hsDesc', 'phone', 'zip', 'tNo', 'prefix', 'suffix', 'taxNo', 'taxCode', 'pRef', 'ref',
    'descr', 'desc', 'saleDesc', 'purchaseDesc', 'printName', 'email', 'address1', 'address2', 'city', 'contactPerson', 'contactPersonMobile',
    'accCode', 'accCustomCode', 'sName', 'loginName', 'password', 'bankName', 'accName', 'accNumber', 'ifsc', 'stateCode', 'countryCode',
    'groupCode', 'roleCode', 'roleName', 'tType', 'refTtype', 'status', 'uom', 'currency', 'currencyCode', 'shortName', 'addInfo'
];

function numbersFromText(row) {
    let converted = {};
    for (let [column, value] of Object.entries(row)) {
        let looksNumeric = typeof value === 'string' && /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(value);
        converted[column] = looksNumeric && !TEXT_COLUMNS.includes(column) ? Number(value) : value;
    }
    return converted;
}

async function openSource() {
    if (JSON_FOLDER && fs.statSync(JSON_FOLDER).isFile()) {
        // One file from phpMyAdmin (Export > JSON): [{type: "table", name, data: [rows]}, ...]
        let tables = {};
        JSON.parse(fs.readFileSync(JSON_FOLDER, 'utf8'))
            .filter(entry => entry.type === 'table')
            .forEach(entry => { tables[entry.name] = (entry.data || []).map(numbersFromText); });
        return {
            async rows(table) { return tables[table] || []; },
            async close() { }
        };
    }
    if (JSON_FOLDER) {
        return {
            async rows(table) {
                let file = path.join(JSON_FOLDER, `${table}.json`);
                return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).map(numbersFromText) : [];
            },
            async close() { }
        };
    }
    let mysql = require('mysql2/promise'); // npm install mysql2 (only needed for this script)
    let connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST || 'localhost', user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '', database: process.env.MYSQL_DATABASE || 'outputbooks',
        decimalNumbers: true, dateStrings: true
    });
    return {
        // table names are fixed in this file, c_id is passed as a parameter
        async rows(table, where, params) {
            let [result] = await connection.query(`SELECT * FROM \`${table}\` ${where || ''}`, params || []);
            return result;
        },
        async close() { await connection.end(); }
    };
}

/* With --from-json the rows are filtered here; with MySQL the same filter is done by the query */
function forCompany(rows, field = 'cId') {
    return rows.filter(row => Number(row[field]) === C_ID);
}

const asDate = value => UTILS.toDate(value && String(value).startsWith('0000') ? null : value);
const num = value => Number(value) || 0;

/* ---------------------------------------------------------------- converters (MySQL row -> Mongo document) */

function convertCompany(row) {
    return {
        c_id: row.id, name: row.name, address1: row.address1 || '', address2: row.address2 || '', city: row.city || '', zip: row.zip || '',
        state_code: row.stateCode || '', country_code: row.countryCode || 'IN', currency: row.currency || 'INR',
        fy_start: num(row.fyStart) || 4, email: row.email || '', phone: row.phone || '', tax_no: '',
        locked_till: asDate(row.lockedTill), allow_negative_stock: true, stat: CONFIG.STAT_ACTIVE, crd_on: new Date()
    };
}

function convertContact(row, addresses) {
    return {
        con_id: row.id, c_id: C_ID, cs_type: row.csType, name: row.name, company: row.company || '', email: row.email || '',
        phone: row.contactPersonMobile || '', contact_person: row.contactPerson || '', tax_no: row.taxNo || '',
        state_code: row.stateCode || '', credit_days: num(row.salesDue), discount: num(row.salesDiscount), tds: num(row.tds),
        con_acc_id: num(row.conAccId), // 0 when the PHP contact has no ledger account, a new one is created later
        addresses: addresses.map(address => ({
            type: address.addrType, address1: address.address1, address2: address.address2, city: address.city,
            state_code: address.stateCode, zip: address.zip, phone: address.phone
        })),
        is_active: !!row.isActive, stat: CONFIG.STAT_ACTIVE, crd_on: new Date()
    };
}

function convertItem(row) {
    return {
        item_id: row.itemId, c_id: C_ID, name: row.name, item_code: row.itemCode || '', type: row.type === 'S' ? 'S' : 'P',
        hs: row.HS || '', sku: row.SKU || '', uom: row.uom || '', description: row.saleDesc || '', category_id: 0,
        tax_id: num(row.taxId), is_sale: !!row.isSale, is_purchase: !!row.isPurchase, is_inventory: !!row.isInventory,
        sale_rate: num(row.saleRate), purchase_rate: num(row.purchaseRate), mrp: num(row.mrp), stk_level: num(row.stkLevel),
        opening_stk: 0, cur_stk: 0, php_cur_stk: num(row.curStk), // php_cur_stk is removed after the stock check
        is_active: !!row.isActive, stat: CONFIG.STAT_ACTIVE, crd_on: new Date()
    };
}

function convertTax(row, details) {
    return {
        tax_id: row.id, c_id: C_ID, name: row.name, tax_code: row.taxCode || '',
        details: details.map(detail => ({ tax_type_code: detail.taxTypeCode, tax_rate: num(detail.taxRate), state_type: detail.stateType || 'A' })),
        is_default: !!row.isDefault, is_active: !!row.isActive, stat: CONFIG.STAT_ACTIVE
    };
}

/* One document with its items, taxes, payments and allocations */
function convertTransaction(row, parts) {
    let items = parts.items.map(item => {
        let taxes = parts.taxRows.filter(tax => tax.transItemID === item.id)
            .map(tax => ({ tax_type_code: tax.taxTypeCode, tax_rate: num(tax.taxRate), tax_value: num(tax.taxValue) }));
        return {
            item_id: item.itemId, item_name: item.itemName, item_desc: item.itemDesc || '', item_type: item.itemType || 'P', hs: item.itemHS || '',
            unit: item.unit || '', qty: num(item.qty), free_qty: num(item.freeQty), rate: num(item.rate),
            disc_percentage: num(item.discPercentage), disc_amount: num(item.discAmount), taxable_amount: num(item.taxableAmount),
            tax_id: num(item.taxId), tax_name: item.taxName || '', taxes: taxes, item_total: num(item.itemTotal), loc_id: 0
        };
    });
    let tax_summary = {};
    items.forEach(item => item.taxes.forEach(tax => {
        let key = `${tax.tax_type_code}_${tax.tax_rate}`;
        tax_summary[key] = tax_summary[key] || { tax_type_code: tax.tax_type_code, tax_rate: tax.tax_rate, tax_value: 0 };
        tax_summary[key].tax_value = UTILS.round2(tax_summary[key].tax_value + tax.tax_value);
    }));

    let payments = parts.payRows.map(pay => ({ acc_id: pay.pAccId, pay_mode_id: pay.pMode, ref: pay.pRef || '', amount: num(pay.pAmount) }));
    let inline_paid = TRANSACTION.hasItems(row.tType) && TRANSACTION.hasLedger(row.tType)
        ? UTILS.round2(payments.reduce((sum, pay) => sum + pay.amount, 0)) : 0;
    let received_by_receipts = UTILS.round2(parts.receivedRows.reduce((sum, allocation) => sum + num(allocation.allotAmt), 0));

    let transaction = {
        trans_id: row.id, c_id: C_ID, trans_type: row.tType, trans_no: row.tNo, series_id: num(row.seriesId),
        trans_date: asDate(row.tDate), due_date: asDate(row.dueDate), ref: row.ref || '', notes: row.notes || '',
        con_id: num(row.conId), con_name: row.conName || '', con_tax_no: row.conTaxNo || '', dst_state_code: row.dstStateCode || '',
        include_tax: !!row.includeTax, items: items, tax_summary: Object.values(tax_summary),
        taxable_amount: num(row.taxableAmount), tot_tax: num(row.totTax), round_amount: num(row.roundAmount), tot_amount: num(row.totAmount),
        payments: TRANSACTION.hasItems(row.tType) ? payments : [], inline_paid: inline_paid,
        rec_amt: UTILS.round2(inline_paid + received_by_receipts),
        ref_id: num(row.ref_id), ref_trans_type: row.refTtype || '',
        stat: CONFIG.STAT_ACTIVE, updated_by: row.updatedBy || '', updated_on: new Date(), crd_on: new Date(),
        status: CONFIG.TRANS_STATUS.SENT
    };

    if (!TRANSACTION.hasItems(row.tType)) {
        delete transaction.items; delete transaction.tax_summary;
        delete transaction.payments; delete transaction.inline_paid;
    }
    if (row.tType === 'SP' || row.tType === 'PP') {
        let pay = parts.payRows[0] || {};
        transaction.pay_acc_id = num(pay.pAccId);
        transaction.pay_mode_id = num(pay.pMode);
        transaction.pay_ref = pay.pRef || '';
        transaction.tds_amount = num(row.tdsAmount);
        transaction.allocations = parts.givenRows.map(allocation => ({ trans_id: allocation.allotTransId, amount: num(allocation.allotAmt) }));
        transaction.status = CONFIG.TRANS_STATUS.PAID;
    }
    if (row.tType === 'J' || row.tType === 'JC') {
        transaction.lines = parts.ledgerRows.map(line => ({ acc_id: line.accId, debit: num(line.debit), credit: num(line.credit), desc: line.desc || '' }));
        transaction.tot_amount = UTILS.round2(transaction.lines.reduce((sum, line) => sum + line.debit, 0));
        transaction.status = CONFIG.TRANS_STATUS.PAID;
    }
    if (TRANSACTION.isOutstandingType(row.tType)) {
        transaction.status = TRANSACTION.getPaidStatus(transaction.tot_amount, transaction.rec_amt);
    }
    return transaction;
}

/* ---------------------------------------------------------------- the import */

async function main() {
    if (!C_ID) {
        console.log('Usage: node scripts/import_mysql.js --company <cId> [--dry-run] [--from-json <folder>]');
        process.exit(1);
    }
    let source = await openSource();
    let report = {};
    let write = {}; // collection name -> documents to insert

    let q = (table, field = 'cId') => (JSON_FOLDER
        ? source.rows(table).then(rows => forCompany(rows, field))
        : source.rows(table, `WHERE \`${field}\` = ?`, [C_ID]));

    let [company_rows] = [JSON_FOLDER ? (await source.rows('ob_companies')).filter(row => Number(row.id) === C_ID) : await source.rows('ob_companies', 'WHERE id = ?', [C_ID])];
    if (company_rows.length === 0) {
        throw new Error(`Company ${C_ID} not found in ob_companies`);
    }
    write.ob_companies = [convertCompany(company_rows[0])];

    // Users of the company and their roles
    let company_users = await q('ob_compusers');
    let all_users = await source.rows('ob_users');
    let users = all_users.filter(user => company_users.some(company_user => company_user.userId === user.id));
    let roles = await q('ob_role');
    let permissions = await q('ob_role_permissions');
    // PHP role codes -> codes of this app. PHP A (Administrator) is C here (all modules), PHP C (Accountant) is F here. Other codes match.
    const roleCodeOfThisApp = { A: 'C', C: 'F', S: 'S', I: 'I', R: 'R' };
    write.ob_roles = roles.map(role => ({
        role_id: role.roleId, c_id: C_ID, role_code: roleCodeOfThisApp[role.roleCode] || 'U', role_name: role.roleName, is_system: !!role.is_system, stat: 'A',
        permissions: permissions.filter(permission => permission.roleId === role.roleId && num(permission.actionRights) > 0).map(permission => permission.modCode)
    }));
    write.ob_users = users.map(user => ({
        user_id: user.id, name: user.name, email: String(user.email).toLowerCase().trim(), password: null, // PHP hash is not usable: user resets the password
        phone: user.phone || '', default_c_id: C_ID, is_prime_user: !!user.isPrimeUser, is_active: !!user.isActive, stat: 'A', crd_on: new Date()
    }));
    write.ob_company_users = company_users.map(company_user => ({ user_id: company_user.userId, c_id: C_ID, role_id: company_user.roleId, stat: 'A' }));

    // Accounts, contacts, items, categories
    write.ob_accounts = (await q('ob_account')).map(account => ({
        acc_id: account.id, c_id: C_ID, name: account.name, group_code: account.groupCode, acc_code: '', descr: account.descr || '',
        opening_balance: num(account.balance), is_system: !!account.systemRec, is_active: !!account.isActive, stat: 'A', crd_on: new Date()
    }));
    let contact_addresses = await q('ob_contacts_address');
    // csType B is a PHP branch (like "Main Branch"), not a customer or supplier
    let customers_and_suppliers = (await q('ob_contacts')).filter(contact => contact.csType === 'C' || contact.csType === 'S');
    write.ob_contacts = customers_and_suppliers.map(contact => convertContact(contact, contact_addresses.filter(address => address.conId === contact.id)));
    write.ob_items = (await q('ob_items')).map(convertItem);
    write.ob_categories = (await q('ob_category')).map(category => ({ category_id: category.id, c_id: C_ID, name: category.name, parent_id: num(category.pId), stat: 'A', crd_on: new Date() }));

    // Taxes, numbering, payment modes
    let tax_details = await q('ob_taxdetail');
    write.ob_taxes = (await q('ob_tax')).map(tax => convertTax(tax, tax_details.filter(detail => detail.taxId === tax.id)));
    write.ob_series = (await q('ob_series')).map(series => ({
        series_id: series.id, c_id: C_ID, trans_type: series.tType, prefix: series.prefix || '', suffix: series.suffix || '',
        nxt_number: num(series.nxtNumber), is_default: true, stat: 'A'
    }));
    write.ob_payment_modes = (await q('ob_paymentmode')).map(mode => ({
        pay_mode_id: mode.id, c_id: C_ID, name: mode.name, acc_group_code: mode.accGroupCode, is_active: !!mode.isActive, stat: 'A'
    }));

    // Banks
    write.ob_banks = (await q('ob_bank', 'cid')).map(bank => ({
        bank_id: bank.id, c_id: C_ID, acc_id: bank.accId, bank_name: bank.bankName, acc_name: bank.accName, acc_number: bank.accNumber || '',
        acc_type: bank.accType || 'S', branch_name: bank.branchName || '', ifsc_code: bank.ifscRouteCode || '', upi_id: bank.upiId || '', stat: 'A', crd_on: new Date()
    }));

    // Documents + ledger
    let trans_rows = (await q('ob_trans')).filter(row => row.status !== 'X' && row.status !== 'V');
    let all_items = await q('ob_trans_items');
    let all_tax_rows = await q('ob_trans_tax');
    let all_pay_rows = await q('ob_trans_pay');
    let all_allocations = await q('ob_trans_payment');
    let all_ledger = await q('ob_trans_acc');
    write.ob_transactions = trans_rows.map(row => convertTransaction(row, {
        items: all_items.filter(item => item.transId === row.id),
        taxRows: all_tax_rows.filter(tax => tax.transId === row.id),
        payRows: all_pay_rows.filter(pay => pay.transId === row.id),
        receivedRows: all_allocations.filter(allocation => allocation.allotTransId === row.id),
        givenRows: all_allocations.filter(allocation => allocation.transId === row.id),
        ledgerRows: all_ledger.filter(line => line.transId === row.id)
    }));
    // The ledger is copied as the PHP application posted it
    let imported_ids = new Set(trans_rows.map(row => row.id));
    write.ob_trans_acc = all_ledger.filter(line => imported_ids.has(line.transId)).map(line => {
        let trans = trans_rows.find(row => row.id === line.transId);
        return {
            trans_id: line.transId, c_id: C_ID, trans_type: trans.tType, trans_no: trans.tNo, trans_date: asDate(trans.tDate),
            acc_id: line.accId, debit: num(line.debit), credit: num(line.credit), desc: line.desc || '', con_id: num(line.conId)
        };
    });

    for (const [collection, docs] of Object.entries(write)) {
        report[collection] = docs.length;
    }
    console.log('Converted:', report);
    await source.close();
    if (IS_DRY_RUN) {
        console.log('Dry run: nothing was written');
        return;
    }
    await writeToMongo(write);
}

async function writeToMongo(write) {
    let mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    let dbobj = mongoClient.db(process.env.DB_NAME);
    await ensureIndexes(dbobj);

    if (await dbobj.collection('ob_companies').findOne({ c_id: C_ID })) {
        throw new Error(`Company ${C_ID} already exists in MongoDB. Import stops so nothing is duplicated`);
    }

    // A user who already exists (another company) is kept as is and only linked to this company
    for (const user of write.ob_users) {
        if (await dbobj.collection('ob_users').findOne({ email: user.email })) {
            let existing = await dbobj.collection('ob_users').findOne({ email: user.email });
            write.ob_company_users.filter(link => link.user_id === user.user_id).forEach(link => { link.user_id = existing.user_id; });
            user.skip = true;
        }
    }
    write.ob_users = write.ob_users.filter(user => !user.skip);

    for (const [collection, docs] of Object.entries(write)) {
        if (docs.length > 0) {
            await dbobj.collection(collection).insertMany(docs);
        }
    }

    // PHP keeps the payment modes as shared system rows (cId 0), so a company has none of its own: give it the default ones
    if (write.ob_payment_modes.length === 0) {
        await COMPANY_SETUP.createPaymentModes(dbobj, C_ID);
    }

    // Contacts without a ledger account get one
    for (const contact of write.ob_contacts.filter(item => !item.con_acc_id)) {
        let con_acc_id = await COMPANY_SETUP.createAccount(dbobj, C_ID, { name: contact.name, group_code: contact.cs_type === 'C' ? 'SD' : 'SC', is_system: true });
        await dbobj.collection('ob_contacts').updateOne({ c_id: C_ID, con_id: contact.con_id }, { $set: { con_acc_id } });
    }

    // The transaction engine looks accounts up by acc_code (SALES, CGST_OUT ...): match them by name, create the missing ones
    for (const [name, group_code, acc_code] of SYS_DATA.DEFAULT_ACCOUNTS.filter(account => account[2])) {
        let matched = await dbobj.collection('ob_accounts').updateOne({ c_id: C_ID, name, acc_code: '' }, { $set: { acc_code } });
        if (matched.matchedCount === 0 && !await dbobj.collection('ob_accounts').findOne({ c_id: C_ID, acc_code })) {
            await COMPANY_SETUP.createAccount(dbobj, C_ID, { name, group_code, acc_code, is_system: true });
        }
    }

    // Stock: rebuild the movements from the documents, then add one opening entry so the quantity equals the PHP quantity
    let imported_items = write.ob_items;
    for (const transaction of write.ob_transactions) {
        let stock_moves = await TRANSACTION.buildStockMoves(dbobj, transaction);
        await TRANSACTION.postStock(dbobj, transaction, stock_moves);
    }
    for (const item of imported_items.filter(entry => entry.is_inventory)) {
        let current = await dbobj.collection('ob_items').findOne({ c_id: C_ID, item_id: item.item_id });
        let difference = UTILS.round2(item.php_cur_stk - current.cur_stk);
        if (difference) {
            await dbobj.collection('ob_stock_ledger').insertOne({
                trans_id: 0, c_id: C_ID, trans_type: 'OP', trans_no: 'Opening stock', trans_date: new Date(Date.UTC(2000, 0, 1)), item_id: item.item_id,
                qty_in: difference > 0 ? difference : 0, qty_out: difference < 0 ? -difference : 0, rate: item.purchase_rate, loc_id: 0
            });
        }
        await dbobj.collection('ob_items').updateOne({ c_id: C_ID, item_id: item.item_id }, { $set: { cur_stk: item.php_cur_stk, opening_stk: difference }, $unset: { php_cur_stk: '' } });
    }

    // Id counters continue after the highest imported id
    let counters = {
        ob_companies: 'c_id', ob_users: 'user_id', ob_roles: 'role_id', ob_accounts: 'acc_id', ob_contacts: 'con_id', ob_items: 'item_id',
        ob_categories: 'category_id', ob_taxes: 'tax_id', ob_series: 'series_id', ob_payment_modes: 'pay_mode_id', ob_banks: 'bank_id', ob_transactions: 'trans_id'
    };
    for (const [collection, field] of Object.entries(counters)) {
        let highest = await dbobj.collection(collection).find({}).sort({ [field]: -1 }).limit(1).toArray();
        if (highest.length > 0) {
            await dbobj.collection('ob_counters').updateOne({ _id: collection }, { $max: { seq: highest[0][field] } }, { upsert: true });
        }
    }
    console.log('Import finished. Users must use "Forgot password" to set a new password.');
    await mongoClient.close();
}

main().catch(error => {
    console.error('Import failed:', error.message);
    process.exit(1);
});
