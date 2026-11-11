/*
 * Creates a demo company with a few customers, suppliers, items and transactions.
 *   npm run seed
 * Login values come from SEED_EMAIL / SEED_PASSWORD in .env (defaults are for local development only).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const { ensureIndexes } = require('../common/indexes');
const COMPANY_SETUP = require('../classes/class.company_setup');
const TRANSACTION = require('../classes/class.transaction');
const UTILS = require('../utils/util.functions');

const SEED_EMAIL = process.env.SEED_EMAIL || 'admin@demo.com';
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Admin@123';

async function createContact(dbobj, c_id, cs_type, name, state_code, tax_no) {
    let con_acc_id = await COMPANY_SETUP.createAccount(dbobj, c_id, {
        name: name, group_code: cs_type === 'C' ? 'SD' : 'SC', is_system: true
    });
    let con_id = await UTILS.getNextId(dbobj, 'ob_contacts');
    await dbobj.collection('ob_contacts').insertOne({
        con_id, c_id, cs_type, con_acc_id, name, company: name, email: '', phone: '', contact_person: '', tax_no, state_code,
        credit_days: 15, discount: 0, tds: 0, addresses: [], is_active: true, stat: 'A', crd_on: new Date()
    });
    return con_id;
}

async function createItem(dbobj, c_id, item, tax_id) {
    let item_id = await UTILS.getNextId(dbobj, 'ob_items');
    let is_inventory = item.type === 'P';
    await dbobj.collection('ob_items').insertOne({
        item_id, c_id, name: item.name, item_code: '', type: item.type, hs: item.hs || '', sku: item.sku || '', uom: item.uom,
        description: '', category_id: 0, tax_id, is_sale: true, is_purchase: true, is_inventory,
        sale_rate: item.sale_rate, purchase_rate: item.purchase_rate, mrp: 0, stk_level: item.stk_level || 0,
        opening_stk: 0, cur_stk: 0, is_active: true, stat: 'A', crd_on: new Date()
    });
    return item_id;
}

async function main() {
    let mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    let dbobj = mongoClient.db(process.env.DB_NAME);
    await ensureIndexes(dbobj);

    let existing_user = await dbobj.collection('ob_users').findOne({ email: SEED_EMAIL });
    if (existing_user) {
        console.log(`Seed skipped: ${SEED_EMAIL} already exists`);
        await mongoClient.close();
        return;
    }

    let { c_id } = await COMPANY_SETUP.createCompanyWithAdmin(
        dbobj,
        { name: 'Demo Traders', state_code: '33', email: SEED_EMAIL },
        { name: 'Demo Admin', email: SEED_EMAIL, password: SEED_PASSWORD }
    );
    let company = await UTILS.getCompany(dbobj, c_id);
    let gst18 = await dbobj.collection('ob_taxes').findOne({ c_id, tax_code: 'GST18' });
    let gst5 = await dbobj.collection('ob_taxes').findOne({ c_id, tax_code: 'GST5' });

    // Bank
    let bank_acc_id = await COMPANY_SETUP.createAccount(dbobj, c_id, {
        name: 'HDFC Bank - 1234', group_code: 'BA', opening_balance: 500000, is_system: true
    });
    await dbobj.collection('ob_banks').insertOne({
        bank_id: await UTILS.getNextId(dbobj, 'ob_banks'), c_id, acc_id: bank_acc_id, bank_name: 'HDFC Bank', acc_name: 'Demo Traders',
        acc_number: '1234', acc_type: 'C', branch_name: 'Chennai', ifsc_code: 'HDFC0000001', upi_id: '', stat: 'A', crd_on: new Date()
    });

    // The bank opening balance is balanced by the capital account, so the trial balance has no difference
    await dbobj.collection('ob_accounts').updateOne({ c_id, acc_code: 'OPENING_EQUITY' }, { $set: { opening_balance: -500000 } });

    // Contacts: one inside Tamil Nadu (state 33) and one outside (Karnataka, 29)
    let customer_chennai = await createContact(dbobj, c_id, 'C', 'Chennai Retail Stores', '33', '33AABCC1234D1Z5');
    let customer_bangalore = await createContact(dbobj, c_id, 'C', 'Bangalore Traders', '29', '29AABCB1234D1Z8');
    let supplier_mumbai = await createContact(dbobj, c_id, 'S', 'Mumbai Wholesale Supplies', '27', '27AABCM1234D1Z2');

    // Items
    let laptop = await createItem(dbobj, c_id, { name: 'Laptop 14"', type: 'P', sku: 'LAP-14', uom: 'Nos', hs: '8471', sale_rate: 55000, purchase_rate: 48000, stk_level: 3 }, gst18.tax_id);
    let mouse = await createItem(dbobj, c_id, { name: 'Wireless Mouse', type: 'P', sku: 'MOU-01', uom: 'Nos', hs: '8471', sale_rate: 800, purchase_rate: 500, stk_level: 10 }, gst18.tax_id);
    let notebook = await createItem(dbobj, c_id, { name: 'Notebook A4', type: 'P', sku: 'NB-A4', uom: 'Nos', hs: '4820', sale_rate: 60, purchase_rate: 40, stk_level: 50 }, gst5.tax_id);
    let installation = await createItem(dbobj, c_id, { name: 'Installation Service', type: 'S', uom: 'Hrs', hs: '9987', sale_rate: 1500, purchase_rate: 0 }, gst18.tax_id);

    let today = new Date();
    let stock_purchase = await TRANSACTION.save(dbobj, company, {
        trans_type: 'PI', trans_date: today, con_id: supplier_mumbai, ref: 'SUP/INV/221',
        items: [
            { item_id: laptop, qty: 10, rate: 48000 },
            { item_id: mouse, qty: 50, rate: 500 },
            { item_id: notebook, qty: 200, rate: 40 }
        ]
    }, SEED_EMAIL);
    await TRANSACTION.save(dbobj, company, {
        trans_type: 'PP', trans_date: today, con_id: supplier_mumbai, amount: 300000, pay_acc_id: bank_acc_id, pay_ref: 'NEFT 8821',
        allocations: [{ trans_id: stock_purchase.trans_id, amount: 300000 }]
    }, SEED_EMAIL);

    let invoice_in_state = await TRANSACTION.save(dbobj, company, {
        trans_type: 'SI', trans_date: today, con_id: customer_chennai,
        items: [{ item_id: laptop, qty: 2 }, { item_id: mouse, qty: 5, disc_percentage: 10 }, { item_id: installation, qty: 2 }]
    }, SEED_EMAIL);
    await TRANSACTION.save(dbobj, company, {
        trans_type: 'SP', trans_date: today, con_id: customer_chennai, amount: 50000, pay_acc_id: bank_acc_id, pay_ref: 'UPI 5521',
        allocations: [{ trans_id: invoice_in_state.trans_id, amount: 50000 }]
    }, SEED_EMAIL);
    await TRANSACTION.save(dbobj, company, {
        trans_type: 'SI', trans_date: today, con_id: customer_bangalore,
        items: [{ item_id: laptop, qty: 1 }, { item_id: notebook, qty: 100 }]
    }, SEED_EMAIL);

    console.log(`Seed finished. Login with ${SEED_EMAIL} (company: Demo Traders)`);
    await mongoClient.close();
}

main().catch(error => {
    console.error('Seed failed', error);
    process.exit(1);
});
