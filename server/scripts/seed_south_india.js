/*
 * Demo data for every feature of OutputBooks: two South Indian companies in one database.
 *   npm run seed:sti            creates the data (skipped when it already exists)
 *   npm run seed:sti -- --reset drops the demo database first and creates it again
 *
 * Database: ob_demo (SEED_DB_NAME in .env can change it). Set DB_NAME=ob_demo in .env to open it in the app.
 * Login: owner@srimurugan.demo / Admin@123 (the owner can switch between both companies).
 *
 * Everything is posted through TRANSACTION.save, the same code the API uses, so the ledger, stock, GST and
 * numbering are the real ones. The random numbers use a fixed seed: every run gives the same data.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');
const { ensureIndexes } = require('../common/indexes');
const COMPANY_SETUP = require('../classes/class.company_setup');
const TRANSACTION = require('../classes/class.transaction');
const EINVOICE = require('../classes/class.einvoice');
const REPORT = require('../classes/class.report');
const SECRET = require('../classes/class.secret');
const OVERDUE_INVOICES = require('../api/cronjobs/overdue_invoices');
const UTILS = require('../utils/util.functions');
const { TEXTILES, HARDWARE } = require('./seed_data_south_india');

const DB_NAME = process.env.SEED_DB_NAME || 'ob_demo';
const PASSWORD = process.env.SEED_PASSWORD || 'Admin@123';
const OWNER_EMAIL = 'owner@srimurugan.demo';
const DAY_MS = 86400000;
const round2 = UTILS.round2;

/* ------------------------------------------------------------------ */
/* small helpers                                                      */
/* ------------------------------------------------------------------ */

/* Same numbers on every run */
function createRandom(seed) {
    let state = seed;
    return function random() {
        state = (state + 0x6D2B79F5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
const random = createRandom(2026);

function randomInt(min, max) {
    return min + Math.floor(random() * (max - min + 1));
}

function randomPick(list) {
    return list[Math.floor(random() * list.length)];
}

function randomAmount(range) {
    return range[0] === range[1] ? range[0] : round2(randomInt(range[0] * 100, range[1] * 100) / 100);
}

function pickWeighted(list) {
    let total = list.reduce((sum, entry) => sum + (entry.weight || 1), 0);
    let roll = random() * total;
    for (const entry of list) {
        roll -= entry.weight || 1;
        if (roll < 0) {
            return entry;
        }
    }
    return list[list.length - 1];
}

function shuffle(list) {
    let copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        let j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function addDays(date, days) {
    return new Date(date.getTime() + days * DAY_MS);
}

function digits(count) {
    let text = String(randomInt(1, 9));
    while (text.length < count) {
        text += String(randomInt(0, 9));
    }
    return text;
}

/* ------------------------------------------------------------------ */
/* users and companies                                                */
/* ------------------------------------------------------------------ */

async function findOrCreateUser(dbobj, c_id, user_input, role_code) {
    let role = await dbobj.collection('ob_roles').findOne({ c_id, role_code, stat: 'A' });
    let user = await dbobj.collection('ob_users').findOne({ email: user_input.email });
    if (!user) {
        user = {
            user_id: await UTILS.getNextId(dbobj, 'ob_users'), name: user_input.name, email: user_input.email,
            password: await bcrypt.hash(PASSWORD, 10), phone: user_input.phone || '', default_c_id: c_id,
            is_prime_user: false, is_active: true, stat: 'A', crd_on: new Date()
        };
        await dbobj.collection('ob_users').insertOne(user);
    }
    await dbobj.collection('ob_company_users').updateOne(
        { user_id: user.user_id, c_id }, { $set: { role_id: role.role_id, stat: 'A' } }, { upsert: true });
    return user;
}

/* Same steps as the company_create endpoint */
async function createSecondCompany(dbobj, owner, company_input) {
    let c_id = await UTILS.getNextId(dbobj, 'ob_companies');
    await dbobj.collection('ob_companies').insertOne({
        c_id, name: company_input.name, address1: '', address2: '', city: '', zip: '', state_code: company_input.state_code,
        country_code: 'IN', currency: 'INR', fy_start: 4, email: owner.email, phone: owner.phone || '', tax_no: '',
        locked_till: null, allow_negative_stock: true, stat: 'A', crd_on: new Date()
    });
    let admin_role_id = await COMPANY_SETUP.createDefaults(dbobj, c_id);
    await dbobj.collection('ob_company_users').insertOne({ user_id: owner.user_id, c_id, role_id: admin_role_id, stat: 'A' });
    return c_id;
}

/* ------------------------------------------------------------------ */
/* master data                                                        */
/* ------------------------------------------------------------------ */

async function createMasters(ctx) {
    let { dbobj, c_id, config } = ctx;

    // company details, printing, reminders, e-invoice switch
    await dbobj.collection('ob_companies').updateOne({ c_id }, {
        $set: {
            ...config.company,
            reminder_settings: { enabled: true, before_due_days: 3, overdue_repeat_days: 7, max_overdue_reminders: 3 }
        }
    });

    // categories
    ctx.category_ids = {};
    for (const category of config.categories) {
        let category_id = await UTILS.getNextId(dbobj, 'ob_categories');
        await dbobj.collection('ob_categories').insertOne({
            category_id, c_id, name: category.name, parent_id: category.parent ? ctx.category_ids[category.parent] : 0, stat: 'A', crd_on: new Date()
        });
        ctx.category_ids[category.name] = category_id;
    }

    // taxes and payment modes already exist (created with the company)
    let taxes = await dbobj.collection('ob_taxes').find({ c_id }).toArray();
    ctx.tax_ids = {};
    taxes.forEach(tax => { ctx.tax_ids[tax.tax_code] = tax.tax_id; });
    let pay_modes = await dbobj.collection('ob_payment_modes').find({ c_id }).toArray();
    ctx.pay_mode_ids = {};
    pay_modes.forEach(pay_mode => { ctx.pay_mode_ids[pay_mode.name] = pay_mode.pay_mode_id; });

    // items
    ctx.items = [];
    for (const item of config.items) {
        let is_inventory = (item.type || 'P') === 'P';
        let item_id = await UTILS.getNextId(dbobj, 'ob_items');
        await dbobj.collection('ob_items').insertOne({
            item_id, c_id, name: item.name, item_code: '', type: item.type || 'P', hs: item.hs, sku: item.sku || '', uom: item.uom,
            description: '', category_id: ctx.category_ids[item.category], tax_id: ctx.tax_ids[`GST${item.gst}`],
            is_sale: true, is_purchase: is_inventory, is_inventory, sale_rate: item.sale, purchase_rate: item.purchase, mrp: item.mrp || 0,
            stk_level: item.stk_level || 0, opening_stk: 0, cur_stk: 0, is_active: true, stat: 'A', crd_on: new Date()
        });
        ctx.items.push({ ...item, item_id, type: item.type || 'P', is_inventory });
    }
    ctx.item_by_name = {};
    ctx.items.forEach(item => { ctx.item_by_name[item.name] = item; });
    ctx.freight_item = ctx.items.find(item => item.is_freight);

    // price lists
    let fy_year = ctx.fy.start.getUTCFullYear();
    ctx.price_list_ids = {};
    for (const price_list of config.price_lists) {
        let price_list_id = await UTILS.getNextId(dbobj, 'ob_price_lists');
        await dbobj.collection('ob_price_lists').insertOne({
            price_list_id, c_id, name: price_list.name, list_type: price_list.list_type, adjust_percent: price_list.adjust_percent,
            rates: (price_list.rates || []).map(rate => ({ item_id: ctx.item_by_name[rate.item].item_id, rate: rate.rate })),
            valid_from: price_list.valid_from ? UTILS.toDate(`${fy_year}-${price_list.valid_from}`) : null,
            valid_till: price_list.valid_till ? UTILS.toDate(`${fy_year}-${price_list.valid_till}`) : null,
            is_active: true, mdy_on: new Date(), stat: 'A', crd_on: new Date()
        });
        ctx.price_list_ids[price_list.name] = price_list_id;
    }

    // extra ledger accounts, the bank accounts and the cash opening balance
    ctx.account_ids = {};
    for (const account of config.accounts) {
        ctx.account_ids[account.name] = await COMPANY_SETUP.createAccount(dbobj, c_id, {
            name: account.name, group_code: account.group_code, opening_balance: account.opening || 0, is_system: false
        });
    }
    let system_accounts = await dbobj.collection('ob_accounts').find({ c_id }).toArray();
    system_accounts.forEach(account => { ctx.account_ids[account.name] = account.acc_id; });
    ctx.cash_acc_id = ctx.account_ids.Cash;
    await dbobj.collection('ob_accounts').updateOne({ c_id, acc_id: ctx.cash_acc_id }, { $set: { opening_balance: config.cash_opening } });

    ctx.banks = [];
    for (const bank of config.banks) {
        let acc_id = await COMPANY_SETUP.createAccount(dbobj, c_id, {
            name: `${bank.bank_name} - ${bank.acc_number}`, group_code: bank.acc_type === 'O' ? 'BO' : 'BA',
            opening_balance: bank.opening_balance, is_system: true
        });
        let bank_id = await UTILS.getNextId(dbobj, 'ob_banks');
        await dbobj.collection('ob_banks').insertOne({
            bank_id, c_id, acc_id, bank_name: bank.bank_name, acc_name: bank.acc_name, acc_number: bank.acc_number, acc_type: bank.acc_type,
            branch_name: bank.branch_name, ifsc_code: bank.ifsc_code, upi_id: bank.upi_id, mdy_on: new Date(), stat: 'A', crd_on: new Date()
        });
        ctx.banks.push({ bank_id, acc_id });
    }
    await dbobj.collection('ob_companies').updateOne({ c_id }, {
        $set: {
            print_settings: {
                template: 'modern', accent_color: config.accent_color, footer_text: config.footer_text, terms: config.print_terms,
                show_bank: true, bank_id: ctx.banks[0].bank_id, show_signature: true
            }
        }
    });

    // transporters (used by the e-way bill)
    ctx.transporters = [];
    for (const transporter of config.transporters) {
        let tp_id = await UTILS.getNextId(dbobj, 'ob_transporters');
        await dbobj.collection('ob_transporters').insertOne({ tp_id, c_id, name: transporter.name, gstin: transporter.gstin, stat: 'A', crd_on: new Date() });
        ctx.transporters.push(transporter);
    }

    // customers and suppliers. A supplier opening balance is a credit (we owe money)
    ctx.customers = [];
    ctx.suppliers = [];
    ctx.contact_by_id = {};
    for (const contact_input of config.customers) {
        ctx.customers.push(await createContact(ctx, 'C', contact_input));
    }
    for (const contact_input of config.suppliers) {
        ctx.suppliers.push(await createContact(ctx, 'S', contact_input));
    }
    ctx.contact_by_name = {};
    [...ctx.customers, ...ctx.suppliers].forEach(contact => { ctx.contact_by_name[contact.name] = contact; });

    // the opening balances of every account must balance, the difference goes to the capital account
    let accounts = await dbobj.collection('ob_accounts').find({ c_id, acc_code: { $ne: 'OPENING_EQUITY' } }).toArray();
    let opening_total = round2(accounts.reduce((sum, account) => sum + (account.opening_balance || 0), 0));
    await dbobj.collection('ob_accounts').updateOne({ c_id, acc_code: 'OPENING_EQUITY' }, { $set: { opening_balance: -opening_total } });
}

async function createContact(ctx, cs_type, contact_input) {
    let { dbobj, c_id } = ctx;
    let opening = contact_input.opening || 0;
    let con_acc_id = await COMPANY_SETUP.createAccount(dbobj, c_id, {
        name: contact_input.name, group_code: cs_type === 'C' ? 'SD' : 'SC', opening_balance: cs_type === 'C' ? opening : -opening, is_system: true
    });
    let con_id = await UTILS.getNextId(dbobj, 'ob_contacts');
    let email_name = contact_input.name.toLowerCase().replace(/[^a-z]/g, '');
    await dbobj.collection('ob_contacts').insertOne({
        con_id, c_id, cs_type, con_acc_id, name: contact_input.name, company: contact_input.name,
        email: `${email_name}@example.com`, phone: contact_input.phone, contact_person: '',
        tax_no: contact_input.gstin || '', state_code: contact_input.state, credit_days: contact_input.credit_days || 0,
        discount: 0, tds: contact_input.tds || 0, reminders_off: false,
        price_list_id: contact_input.price_list ? ctx.price_list_ids[contact_input.price_list] : 0,
        addresses: [{ label: 'Billing', address1: contact_input.address1, address2: '', city: contact_input.city, zip: contact_input.zip, state_code: contact_input.state }],
        is_active: true, stat: 'A', crd_on: new Date(), mdy_on: new Date()
    });
    let contact = { ...contact_input, con_id, con_acc_id, cs_type };
    ctx.contact_by_id[con_id] = contact;
    return contact;
}

/* ------------------------------------------------------------------ */
/* day by day helpers                                                 */
/* ------------------------------------------------------------------ */

async function save(ctx, input) {
    return TRANSACTION.save(ctx.dbobj, ctx.company, input, ctx.user_email);
}

/* Things to do on a later day (receipts, next steps of a quote > order > invoice chain ...) */
function schedule(ctx, date, task) {
    if (date > ctx.today) {
        return;
    }
    let key = date.getTime();
    if (!ctx.queue.has(key)) {
        ctx.queue.set(key, []);
    }
    ctx.queue.get(key).push(task);
}

async function runTask(ctx, task, description) {
    try {
        await task();
    } catch (error) {
        ctx.failures += 1;
        console.warn(`  ! ${description} failed: ${error.message}`);
    }
}

async function runQueue(ctx, date) {
    let tasks = ctx.queue.get(date.getTime()) || [];
    ctx.queue.delete(date.getTime());
    for (const task of tasks) {
        await runTask(ctx, task, `Scheduled task on ${date.toISOString().slice(0, 10)}`);
    }
}

async function loadStock(ctx) {
    let items = await ctx.dbobj.collection('ob_items').find({ c_id: ctx.c_id, is_inventory: true }).toArray();
    let stock = {};
    items.forEach(item => { stock[item.item_id] = item.cur_stk; });
    return stock;
}

/* Total of a document before it is saved: needed for amounts paid at billing time */
async function previewTotal(ctx, input) {
    let contact = await TRANSACTION.getContact(ctx.dbobj, ctx.c_id, input.trans_type, input.con_id);
    let items = await TRANSACTION.fillItemDetails(ctx.dbobj, ctx.c_id, input.trans_type, input.items, contact, UTILS.toDate(input.trans_date));
    let calculated = await TRANSACTION.calculate(ctx.dbobj, ctx.company, { items, dst_state_code: contact ? contact.state_code : '' });
    return calculated.tot_amount;
}

/* Mode, bank / cash account and reference of one receipt or payment */
function pickPayment(ctx, amount, is_receipt) {
    let roll = random();
    let mode = is_receipt
        ? (roll < 0.5 ? 'Bank Transfer' : roll < 0.72 ? 'UPI' : roll < 0.92 ? 'Cheque' : 'Cash')
        : (roll < 0.7 ? 'Bank Transfer' : 'Cheque');
    if (mode === 'Cash' && amount > 20000) {
        mode = 'Bank Transfer';
    }
    let pay_acc_id = ctx.banks[0].acc_id;
    let pay_ref = `NEFT ${digits(8)}`;
    if (mode === 'UPI') {
        pay_acc_id = ctx.banks[ctx.banks.length > 1 ? 1 : 0].acc_id;
        pay_ref = `UPI ${digits(12)}`;
    } else if (mode === 'Cheque') {
        pay_ref = `CHQ ${digits(6)}`;
    } else if (mode === 'Cash') {
        pay_acc_id = ctx.cash_acc_id;
        pay_ref = 'Cash';
    }
    return { pay_acc_id, pay_mode_id: ctx.pay_mode_ids[mode], pay_ref };
}

/* Receipt from a customer / payment to a supplier for part or all of one invoice */
async function settleInvoice(ctx, trans_id, fraction, date) {
    let invoice = await ctx.dbobj.collection('ob_transactions').findOne({ c_id: ctx.c_id, trans_id, stat: 'A' });
    let pending_amount = round2(invoice.tot_amount - (invoice.rec_amt || 0));
    let amount = Math.min(round2(invoice.tot_amount * fraction), pending_amount);
    if (amount < 1) {
        return;
    }
    let is_sales = invoice.trans_type !== 'PI';
    let contact = ctx.contact_by_id[invoice.con_id];
    await save(ctx, {
        trans_type: is_sales ? 'SP' : 'PP', trans_date: date, con_id: invoice.con_id, amount,
        tds_amount: is_sales ? round2(amount * (contact.tds || 0) / 100) : 0,
        ...pickPayment(ctx, amount, is_sales), allocations: [{ trans_id, amount }]
    });
}

/* Decides how the customer / supplier pays an invoice: in full, in parts, partly, or not yet */
function planPayments(ctx, date, invoice, is_sales) {
    let pay_on = (days, fraction) => schedule(ctx, addDays(date, days), () => settleInvoice(ctx, invoice.trans_id, fraction, addDays(date, days)));
    let roll = random();
    if (roll < (is_sales ? 0.66 : 0.72)) {
        pay_on(randomInt(4, is_sales ? 40 : 45), 1);
    } else if (roll < (is_sales ? 0.8 : 0.84)) {
        pay_on(randomInt(5, 20), 0.5);
        if (random() < 0.7) {
            pay_on(randomInt(30, 70), 1);
        }
    } else if (roll < (is_sales ? 0.88 : 0.92)) {
        pay_on(randomInt(10, 30), 0.4);
    }
    // otherwise unpaid: it ages and shows in the outstanding and overdue reports
}

/* The next documents of a chain (quote > order > challan > invoice). Stops at today: the rest stays pending */
function continueChain(ctx, source, next_types, lags, date, on_done) {
    if (next_types.length === 0) {
        if (on_done) {
            on_done(source, date);
        }
        return;
    }
    let next_date = addDays(date, lags[0]);
    schedule(ctx, next_date, async () => {
        let saved = await save(ctx, TRANSACTION.copyInput(source, next_types[0], next_date));
        continueChain(ctx, saved, next_types.slice(1), lags.slice(1), next_date, on_done);
    });
}

/* ------------------------------------------------------------------ */
/* sales                                                              */
/* ------------------------------------------------------------------ */

function buildLine(ctx, item, qty_range, stock, stock_share) {
    let qty = randomInt(qty_range[0], qty_range[1]);
    if (item.is_inventory) {
        qty = Math.min(qty, Math.floor((stock[item.item_id] || 0) * stock_share));
    }
    if (qty < 1) {
        return null;
    }
    if (item.is_inventory) {
        stock[item.item_id] -= qty;
    }
    let line = { item_id: item.item_id, qty };
    if (random() < 0.15) {
        line.disc_percentage = randomPick([2, 3, 5]);
    }
    return line;
}

function pickWholesaleLines(ctx, customer, stock) {
    let candidates = ctx.items.filter(item => !item.is_freight && (!customer.categories || customer.categories.includes(item.category)));
    let lines = [];
    for (const item of shuffle(candidates).slice(0, randomInt(1, 4))) {
        let line = buildLine(ctx, item, item.wh_qty, stock, 0.4);
        if (line) {
            lines.push(line);
        }
    }
    return lines;
}

function pickRetailLines(ctx, stock) {
    let candidates = ctx.items.filter(item => item.is_inventory ? true : item.retail);
    let lines = [];
    for (const item of shuffle(candidates).slice(0, randomInt(1, 2))) {
        let line = buildLine(ctx, item, item.rt_qty, stock, 0.2);
        if (line) {
            lines.push(line);
        }
    }
    return lines;
}

async function createWholesaleSale(ctx, date, stock) {
    let customer = pickWeighted(ctx.customers.filter(contact => !contact.retail_only));
    let lines = pickWholesaleLines(ctx, customer, stock);
    if (lines.length === 0) {
        return;
    }
    let roll = random();

    // quote > order > challan / invoice. The chain is created over the next days
    if (roll < ctx.config.chain_prob) {
        let quote = await save(ctx, { trans_type: 'SE', trans_date: date, con_id: customer.con_id, items: lines });
        let types = random() < 0.5 ? ['SO', 'SH', 'SI'] : ['SO', 'SI'];
        let lags = types.length === 3 ? [2, 3, 2] : [2, 4];
        continueChain(ctx, quote, types, lags, date, (invoice, invoice_date) => planPayments(ctx, invoice_date, invoice, true));
        return;
    }
    // quotes and orders that were never converted
    if (roll < ctx.config.chain_prob + 0.04) {
        await save(ctx, { trans_type: 'SE', trans_date: date, con_id: customer.con_id, items: lines });
        return;
    }

    let invoice_input = { trans_type: 'SI', trans_date: date, con_id: customer.con_id, items: lines };
    // some customers pay a part at the time of billing
    if (random() < 0.1) {
        let total = await previewTotal(ctx, invoice_input);
        invoice_input.payments = [{ acc_id: ctx.banks[0].acc_id, pay_mode_id: ctx.pay_mode_ids['UPI'], ref: `UPI ${digits(12)}`, amount: round2(total * 0.3) }];
    }
    let invoice = await save(ctx, invoice_input);
    planPayments(ctx, date, invoice, true);

    // sales return and extra charge notes
    let note_roll = random();
    if (note_roll < 0.05) {
        let credit_date = addDays(date, randomInt(5, 20));
        schedule(ctx, credit_date, async () => {
            let credit_input = TRANSACTION.copyInput(invoice, 'SC', credit_date);
            credit_input.items = [{ ...credit_input.items[0], qty: Math.min(credit_input.items[0].qty, randomInt(1, 2)) }];
            await save(ctx, credit_input);
        });
    } else if (note_roll < 0.07 && ctx.freight_item) {
        let debit_date = addDays(date, randomInt(1, 5));
        schedule(ctx, debit_date, () => save(ctx, {
            trans_type: 'SD', trans_date: debit_date, con_id: customer.con_id, ref: invoice.trans_no, ref_id: invoice.trans_id, ref_trans_type: 'SI',
            items: [{ item_id: ctx.freight_item.item_id, qty: 1 }]
        }));
    }
}

async function createRetailSale(ctx, date, stock) {
    let lines = pickRetailLines(ctx, stock);
    if (lines.length === 0) {
        return;
    }
    // most retail sales have no customer record
    let named_customers = ctx.customers.filter(contact => contact.retail_only);
    let customer = random() < 0.2 && named_customers.length > 0 ? randomPick(named_customers) : null;
    let sale_input = { trans_type: 'SR', trans_date: date, con_id: customer ? customer.con_id : 0, items: lines };
    let total = await previewTotal(ctx, sale_input);
    sale_input.payments = [{ amount: total, ...pickRetailPayment(ctx, total) }];
    await save(ctx, sale_input);
}

function pickRetailPayment(ctx, amount) {
    // a shop counter mostly takes cash
    if (random() < 0.55 && amount <= 20000) {
        return { acc_id: ctx.cash_acc_id, pay_mode_id: ctx.pay_mode_ids['Cash'], ref: 'Cash' };
    }
    let payment = pickPayment(ctx, amount, true);
    return { acc_id: payment.pay_acc_id, pay_mode_id: payment.pay_mode_id, ref: payment.pay_ref };
}

/* Invoices that repeat every month for a customer (a hotel, a school ...) */
async function createStandingOrders(ctx, date) {
    for (const order of ctx.config.standing_orders) {
        if (date.getUTCDate() !== order.day) {
            continue;
        }
        let customer = ctx.contact_by_name[order.customer];
        let invoice = await save(ctx, {
            trans_type: 'SI', trans_date: date, con_id: customer.con_id, ref: `${order.customer} - monthly supply`,
            items: order.lines.map(line => ({ item_id: ctx.item_by_name[line.item].item_id, qty: line.qty }))
        });
        planPayments(ctx, date, invoice, true);
    }
}

/* ------------------------------------------------------------------ */
/* purchases                                                          */
/* ------------------------------------------------------------------ */

function purchaseLines(ctx, supplier, item_filter, qty_share) {
    return ctx.items
        .filter(item => item.is_inventory && item.supplier === supplier.name && item_filter(item))
        .map(item => ({ item_id: item.item_id, qty: Math.max(1, Math.round(item.initial_qty * qty_share)) }));
}

async function buyInitialStock(ctx, date) {
    for (const supplier of ctx.suppliers) {
        let lines = purchaseLines(ctx, supplier, () => true, 1);
        if (lines.length === 0) {
            continue;
        }
        let bill = await save(ctx, { trans_type: 'PI', trans_date: date, con_id: supplier.con_id, ref: `${supplier.name.slice(0, 3).toUpperCase()}/${digits(4)}`, items: lines });
        planPayments(ctx, date, bill, false);
    }
}

/* Every week: items below 40% of the first purchase are bought again. Some purchases follow quote > order > receipt > bill */
async function restock(ctx, date, stock) {
    for (const supplier of ctx.suppliers) {
        let lines = purchaseLines(ctx, supplier, item => {
            let is_low = (stock[item.item_id] || 0) < Math.max(item.stk_level * 2, item.initial_qty * 0.4);
            return is_low && !item.low_at_end && !ctx.pending_restock.has(item.item_id);
        }, 0.6);
        if (lines.length === 0) {
            continue;
        }
        let ref = `${supplier.name.slice(0, 3).toUpperCase()}/${digits(4)}`;
        if (random() < 0.3) {
            lines.forEach(line => ctx.pending_restock.add(line.item_id));
            let quote = await save(ctx, { trans_type: 'PQ', trans_date: date, con_id: supplier.con_id, items: lines });
            continueChain(ctx, quote, ['PO', 'GR', 'PI'], [2, 3, 2], date, (bill, bill_date) => {
                lines.forEach(line => ctx.pending_restock.delete(line.item_id));
                planPayments(ctx, bill_date, bill, false);
            });
            continue;
        }
        let bill = await save(ctx, { trans_type: 'PI', trans_date: date, con_id: supplier.con_id, ref, items: lines });
        planPayments(ctx, date, bill, false);

        // a few purchases are returned to the supplier
        if (random() < 0.08) {
            let return_type = random() < 0.7 ? 'PC' : 'PD';
            let return_date = addDays(date, randomInt(3, 10));
            schedule(ctx, return_date, async () => {
                let return_input = TRANSACTION.copyInput(bill, return_type, return_date);
                return_input.items = [{ ...return_input.items[0], qty: Math.min(return_input.items[0].qty, randomInt(1, 3)) }];
                await save(ctx, return_input);
            });
        }
    }
}

/* ------------------------------------------------------------------ */
/* expenses, contra and stock adjustments                             */
/* ------------------------------------------------------------------ */

async function getCashBalance(ctx) {
    let cash_account = await ctx.dbobj.collection('ob_accounts').findOne({ c_id: ctx.c_id, acc_id: ctx.cash_acc_id });
    let totals = await ctx.dbobj.collection('ob_trans_acc').aggregate([
        { $match: { c_id: ctx.c_id, acc_id: ctx.cash_acc_id } }, { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }
    ]).toArray();
    let movement = totals.length > 0 ? totals[0].debit - totals[0].credit : 0;
    return round2(cash_account.opening_balance + movement);
}

function creditAccount(ctx, key) {
    return key === 'cash' ? ctx.cash_acc_id : ctx.banks[Number(key.replace('bank', ''))].acc_id;
}

async function postMonthlyJournals(ctx, date) {
    let month = date.getUTCMonth() + 1;
    for (let journal of ctx.config.monthly_journals) {
        if (date.getUTCDate() !== journal.day || (journal.months && !journal.months.includes(month))) {
            continue;
        }
        let lines = journal.lines.map(line => ({ acc_id: ctx.account_ids[line.account], amount: randomAmount(line.amount) }));
        let total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
        // an expense is paid from the bank when the shop has no cash for it
        if (journal.credit === 'cash' && await getCashBalance(ctx) < total) {
            journal = { ...journal, credit: 'bank0' };
        }
        let is_income = !journal.credit; // income: debit the bank, credit the income account
        let journal_lines = is_income
            ? [{ acc_id: creditAccount(ctx, journal.debit), debit: total, desc: journal.desc }, ...lines.map(line => ({ acc_id: line.acc_id, credit: line.amount, desc: journal.desc }))]
            : [...lines.map(line => ({ acc_id: line.acc_id, debit: line.amount, desc: journal.desc })), { acc_id: creditAccount(ctx, journal.credit), credit: total, desc: journal.desc }];
        await save(ctx, { trans_type: 'J', trans_date: date, notes: journal.desc, lines: journal_lines });
    }
}

/* Cash deposited into the bank */
async function postContra(ctx, date) {
    let { contra } = ctx.config;
    if (!contra.days.includes(date.getUTCDate())) {
        return;
    }
    // only the cash the shop really has is deposited
    let cash_balance = await getCashBalance(ctx);
    let amount = Math.min(randomAmount(contra.amount), Math.floor((cash_balance - 10000) / 1000) * 1000);
    if (amount < 5000) {
        return;
    }
    await save(ctx, {
        trans_type: 'JC', trans_date: date, notes: 'Cash deposited in bank',
        lines: [{ acc_id: creditAccount(ctx, contra.to), debit: amount, desc: 'Cash deposit' }, { acc_id: creditAccount(ctx, contra.from), credit: amount, desc: 'Cash deposit' }]
    });
}

async function adjustStock(ctx, item, qty, date, notes) {
    await ctx.dbobj.collection('ob_stock_ledger').insertOne({
        trans_id: 0, c_id: ctx.c_id, trans_type: 'ST', trans_no: notes, trans_date: date, item_id: item.item_id,
        qty_in: qty > 0 ? qty : 0, qty_out: qty < 0 ? -qty : 0, rate: item.purchase, loc_id: 0
    });
    await ctx.dbobj.collection('ob_items').updateOne({ c_id: ctx.c_id, item_id: item.item_id }, { $inc: { cur_stk: qty } });
}

/* ------------------------------------------------------------------ */
/* the simulation                                                     */
/* ------------------------------------------------------------------ */

function isFestivalSeason(date) {
    let month_day = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
    return month_day >= 1001 && month_day <= 1110;
}

async function simulateYear(ctx) {
    let products = ctx.items.filter(item => item.is_inventory);
    let first_day = addDays(ctx.fy.start, 1);
    let adjust_days = [0.25, 0.5, 0.75].map(share => addDays(first_day, Math.floor((ctx.today - first_day) / DAY_MS * share)).getTime());

    for (let date = first_day; date <= ctx.today; date = addDays(date, 1)) {
        await runQueue(ctx, date);
        let day_number = Math.round((date - first_day) / DAY_MS);
        let is_sunday = date.getUTCDay() === 0;
        let festival = isFestivalSeason(date);

        if (day_number === 0) {
            await runTask(ctx, () => buyInitialStock(ctx, date), 'Initial stock purchase');
        }
        let stock = await loadStock(ctx);

        if (!is_sunday) {
            if (random() < ctx.config.wholesale_prob + (festival ? 0.2 : 0)) {
                await runTask(ctx, () => createWholesaleSale(ctx, date, stock), 'Wholesale sale');
            }
            if (random() < ctx.config.wholesale_extra_prob) {
                await runTask(ctx, () => createWholesaleSale(ctx, date, stock), 'Wholesale sale');
            }
        }
        let retail_range = ctx.config.retail_per_day;
        let retail_count = randomInt(retail_range[0], retail_range[1] + (festival ? 2 : 0));
        for (let i = 0; i < retail_count; i++) {
            await runTask(ctx, () => createRetailSale(ctx, date, stock), 'Retail sale');
        }
        if (day_number > 0 && day_number % 7 === 0) {
            await runTask(ctx, () => restock(ctx, date, stock), 'Restock');
        }
        await runTask(ctx, () => createStandingOrders(ctx, date), 'Standing order');
        await runTask(ctx, () => postMonthlyJournals(ctx, date), 'Monthly journal');
        await runTask(ctx, () => postContra(ctx, date), 'Cash deposit');

        // stock count corrections: one damaged piece, one found piece, one count difference
        if (adjust_days.includes(date.getTime())) {
            let item = randomPick(products);
            let qty = randomPick([-2, 3, -1]);
            await runTask(ctx, () => adjustStock(ctx, item, qty, date, qty < 0 ? 'Damaged / shop soiled' : 'Physical count correction'), 'Stock adjustment');
        }
    }
    await runQueue(ctx, ctx.today);

    // items that are not bought again: stock falls below the reorder level (reorder report)
    for (const item of products.filter(product => product.low_at_end)) {
        let current = await ctx.dbobj.collection('ob_items').findOne({ c_id: ctx.c_id, item_id: item.item_id });
        let target = Math.max(0, item.stk_level - 2);
        if (current.cur_stk > target) {
            await adjustStock(ctx, item, target - current.cur_stk, ctx.today, 'Stock count: below reorder level');
        }
    }
}

/* ------------------------------------------------------------------ */
/* recurring invoices, e-invoice, reminders, bank statements          */
/* ------------------------------------------------------------------ */

async function createRecurringProfiles(ctx) {
    for (const profile of ctx.config.recurring) {
        let customer = ctx.contact_by_name[profile.customer];
        let template = await ctx.dbobj.collection('ob_transactions')
            .find({ c_id: ctx.c_id, con_id: customer.con_id, trans_type: 'SI', stat: 'A' }).sort({ trans_date: -1 }).limit(1).next();
        if (!template) {
            continue;
        }
        await ctx.dbobj.collection('ob_recurring').insertOne({
            recurring_id: await UTILS.getNextId(ctx.dbobj, 'ob_recurring'), c_id: ctx.c_id, name: profile.name, source_trans_id: template.trans_id,
            trans_type: 'SI', frequency: profile.frequency, next_date: addDays(ctx.today, profile.days_ahead), end_date: null,
            auto_email: profile.auto_email, is_active: true, run_count: 0, last_error: '', mdy_on: new Date(), stat: 'A', crd_on: new Date()
        });
    }
}

/* Switches e-invoice on (test provider), generates IRNs for most B2B invoices and e-way bills for the big ones */
async function createEinvoices(ctx) {
    let { dbobj, c_id } = ctx;
    await dbobj.collection('ob_einvoice_credentials').updateOne({ c_id }, {
        $set: { api_username: ctx.config.api_username, api_password_enc: SECRET.encrypt('demo-password'), updated_on: new Date() }
    }, { upsert: true });
    await dbobj.collection('ob_companies').updateOne({ c_id }, { $set: { einvoice_settings: { enabled: true, mode: 'sandbox', ewb_only: false } } });
    let company = await UTILS.getCompany(dbobj, c_id);

    // invoices of the last 3 weeks stay pending, so the worklist shows both done and pending documents
    let pending_from = addDays(ctx.today, -21);
    let invoices = await dbobj.collection('ob_transactions').find({
        c_id, trans_type: 'SI', stat: 'A', con_tax_no: { $ne: '' }, trans_date: { $lt: pending_from }
    }).sort({ trans_date: 1 }).toArray();

    let done = [];
    for (const invoice of invoices) {
        if (random() < 0.85) {
            await runTask(ctx, async () => { await EINVOICE.generate(dbobj, company, invoice.trans_id, ctx.user_email); done.push(invoice); }, `E-invoice ${invoice.trans_no}`);
        }
    }

    let vehicles = ['TN66AB1234', 'TN38BC5521', 'TN37CD9087', 'KA01EF4410', 'TN09GH7765'];
    let ewb_done = [];
    for (const invoice of done.filter(entry => entry.tot_amount >= 50000)) {
        if (random() < 0.6) {
            let transporter = randomPick(ctx.transporters);
            await runTask(ctx, async () => {
                await EINVOICE.generateEwb(dbobj, company, invoice.trans_id, {
                    trans_mode: 1, distance: randomInt(40, 700), vehicle_no: randomPick(vehicles), vehicle_type: 'R',
                    transporter_gstin: transporter.gstin, transporter_name: transporter.name
                }, ctx.user_email);
                ewb_done.push(invoice);
            }, `E-way bill ${invoice.trans_no}`);
        }
    }
    // one vehicle change and one cancelled e-way bill, one cancelled IRN
    if (ewb_done.length > 0) {
        await runTask(ctx, () => EINVOICE.updateVehicle(dbobj, company, ewb_done[0].trans_id, {
            vehicle_no: 'TN66XY4321', reason_code: 1, from_place: 'Avinashi', from_state: '33', reason_remark: 'Tyre puncture'
        }, ctx.user_email), 'E-way bill vehicle update');
    }
    if (ewb_done.length > 1) {
        await runTask(ctx, () => EINVOICE.cancelEwb(dbobj, company, ewb_done[1].trans_id, 4, 'Goods not dispatched', ctx.user_email), 'E-way bill cancel');
    }
    let irn_without_ewb = done.find(invoice => !ewb_done.includes(invoice));
    if (irn_without_ewb) {
        await runTask(ctx, () => EINVOICE.cancel(dbobj, company, irn_without_ewb.trans_id, 2, 'Wrong quantity entered', ctx.user_email), 'E-invoice cancel');
    }
}

/* Reminder history for invoices that are overdue (the real mails need SMTP) */
async function createReminderLog(ctx) {
    let overdue_invoices = await ctx.dbobj.collection('ob_transactions').find({ c_id: ctx.c_id, status: 'O', stat: 'A' }).sort({ due_date: 1 }).limit(15).toArray();
    for (const invoice of overdue_invoices) {
        let contact = ctx.contact_by_id[invoice.con_id];
        let pending_amount = round2(invoice.tot_amount - (invoice.rec_amt || 0));
        let reminders = [{ kind: 'before', sent_on: addDays(invoice.due_date, -3) }, { kind: 'overdue', sent_on: addDays(invoice.due_date, 3) }];
        if (random() < 0.5) {
            reminders.push({ kind: 'overdue', sent_on: addDays(invoice.due_date, 10) });
        }
        for (const reminder of reminders) {
            if (reminder.sent_on > ctx.today) {
                continue;
            }
            await ctx.dbobj.collection('ob_reminders').insertOne({
                reminder_id: await UTILS.getNextId(ctx.dbobj, 'ob_reminders'), c_id: ctx.c_id, trans_id: invoice.trans_id, trans_no: invoice.trans_no,
                kind: reminder.kind, sent_to: `${contact.name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`, pending_amount, sent_on: reminder.sent_on, status: 'sent'
            });
        }
    }
}

/* Bank statement lines for the bank ledger. Old entries are matched, the last 3 weeks are not in the statement yet */
async function createBankStatements(ctx) {
    let reconcile_before = addDays(ctx.today, -21);
    for (const bank of ctx.banks) {
        let entries = await ctx.dbobj.collection('ob_trans_acc').find({ c_id: ctx.c_id, acc_id: bank.acc_id }).sort({ trans_date: 1 }).toArray();
        for (const entry of entries) {
            if (entry.trans_date >= reconcile_before || random() > 0.9) {
                continue;
            }
            await ctx.dbobj.collection('ob_bank_transactions').insertOne({
                btr_id: await UTILS.getNextId(ctx.dbobj, 'ob_bank_transactions'), c_id: ctx.c_id, bank_id: bank.bank_id,
                btr_date: addDays(entry.trans_date, randomInt(0, 2)), description: entry.desc || entry.trans_no, chq_no: '',
                // the bank statement is the other way round: money paid into the bank is a credit
                debit: entry.credit, credit: entry.debit, matched_trans_id: entry.trans_id, is_reconciled: true, stat: 'A', crd_on: new Date()
            });
        }
        // charges that the bank deducted and the books do not have yet
        for (let month_start = new Date(Date.UTC(ctx.fy.start.getUTCFullYear(), ctx.fy.start.getUTCMonth(), 1)); month_start < reconcile_before; month_start = new Date(Date.UTC(month_start.getUTCFullYear(), month_start.getUTCMonth() + 1, 1))) {
            await ctx.dbobj.collection('ob_bank_transactions').insertOne({
                btr_id: await UTILS.getNextId(ctx.dbobj, 'ob_bank_transactions'), c_id: ctx.c_id, bank_id: bank.bank_id, btr_date: addDays(month_start, 27),
                description: 'SMS and service charges', chq_no: '', debit: 177, credit: 0, matched_trans_id: 0, is_reconciled: false, stat: 'A', crd_on: new Date()
            });
        }
    }
}

/* ------------------------------------------------------------------ */
/* checks and summary                                                 */
/* ------------------------------------------------------------------ */

async function printSummary(ctx) {
    let { dbobj, c_id } = ctx;
    let counts = await dbobj.collection('ob_transactions').aggregate([
        { $match: { c_id, stat: 'A' } }, { $group: { _id: '$trans_type', count: { $sum: 1 }, total: { $sum: '$tot_amount' } } }, { $sort: { _id: 1 } }
    ]).toArray();
    console.log(`\n${ctx.config.company.name} (c_id ${c_id}), ${ctx.failures} failed steps`);
    console.log('  documents: ' + counts.map(entry => `${entry._id} ${entry.count}`).join(', '));

    let rows = await REPORT.getTrialBalanceRows(dbobj, c_id, null, ctx.today);
    let difference = round2(rows.reduce((sum, row) => sum + row.closing, 0));
    console.log(`  trial balance difference: ${difference} ${difference === 0 ? '(OK)' : '<-- SHOULD BE 0'}`);
    for (const bank of ctx.banks) {
        let row = rows.find(entry => entry.acc_id === bank.acc_id);
        console.log(`  ${row.name}: ${row.closing}`);
    }
    console.log(`  cash: ${rows.find(entry => entry.acc_id === ctx.cash_acc_id).closing}`);

    let negative_stock = await dbobj.collection('ob_items').countDocuments({ c_id, is_inventory: true, cur_stk: { $lt: 0 } });
    let low_stock = await dbobj.collection('ob_items').countDocuments({ c_id, is_inventory: true, $expr: { $lte: ['$cur_stk', '$stk_level'] } });
    let irn_count = await dbobj.collection('ob_transactions').countDocuments({ c_id, 'einvoice.status': 'ACT' });
    let ewb_count = await dbobj.collection('ob_transactions').countDocuments({ c_id, 'ewb.status': 'ACT' });
    let overdue_count = await dbobj.collection('ob_transactions').countDocuments({ c_id, status: 'O', stat: 'A' });
    console.log(`  items with negative stock: ${negative_stock}, at or below reorder level: ${low_stock}`);
    console.log(`  overdue invoices: ${overdue_count}, active IRN: ${irn_count}, active e-way bills: ${ewb_count}`);
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

async function seedCompany(dbobj, c_id, config, user_email) {
    let today = UTILS.toDate(new Date());
    let ctx = {
        dbobj, c_id, config, user_email, today, fy: UTILS.getFinancialYear(today, 4), queue: new Map(),
        pending_restock: new Set(), failures: 0
    };
    ctx.company = await UTILS.getCompany(dbobj, c_id);
    await createMasters(ctx);
    ctx.company = await UTILS.getCompany(dbobj, c_id);

    for (const user_input of config.users) {
        await findOrCreateUser(dbobj, c_id, user_input, user_input.role_code);
    }
    console.log(`Creating transactions for ${config.company.name} ...`);
    await simulateYear(ctx);
    await createRecurringProfiles(ctx);
    await OVERDUE_INVOICES.run(dbobj);
    await createReminderLog(ctx);
    if (config.einvoice) {
        await createEinvoices(ctx);
    }
    await createBankStatements(ctx);
    return ctx;
}

async function main() {
    let mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    let dbobj = mongoClient.db(DB_NAME);
    console.log(`Database: ${DB_NAME}`);

    if (process.argv.includes('--reset')) {
        await dbobj.dropDatabase();
        console.log('Database dropped');
    }
    await ensureIndexes(dbobj);
    if (await dbobj.collection('ob_users').findOne({ email: OWNER_EMAIL })) {
        console.log(`Seed skipped: ${OWNER_EMAIL} already exists. Run with --reset to create the data again`);
        await mongoClient.close();
        return;
    }

    let { c_id, user: owner } = await COMPANY_SETUP.createCompanyWithAdmin(
        dbobj,
        { name: TEXTILES.company.name, state_code: TEXTILES.company.state_code, email: OWNER_EMAIL },
        { name: 'Murugan Subramanian', email: OWNER_EMAIL, password: PASSWORD, phone: '9843000001' }
    );
    let textiles = await seedCompany(dbobj, c_id, TEXTILES, OWNER_EMAIL);

    let hardware_c_id = await createSecondCompany(dbobj, owner, { name: HARDWARE.company.name, state_code: HARDWARE.company.state_code });
    let hardware = await seedCompany(dbobj, hardware_c_id, HARDWARE, OWNER_EMAIL);
    await dbobj.collection('ob_users').updateOne({ user_id: owner.user_id }, { $set: { default_c_id: c_id } });

    await printSummary(textiles);
    await printSummary(hardware);
    console.log(`\nDone. Set DB_NAME=${DB_NAME} in server/.env, then log in with ${OWNER_EMAIL} / ${PASSWORD}`);
    console.log('Other users (same password): accountant@, sales@, store@, retail@srimurugan.demo and manager@kovaihw.demo');
    await mongoClient.close();
}

main().catch(error => {
    console.error('Seed failed', error);
    process.exit(1);
});
