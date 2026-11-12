/* Indexes of the collections. Created when the server starts (createIndex does nothing if the index already exists) */
async function ensureIndexes(dbobj) {
    await dbobj.collection('ob_users').createIndex({ email: 1 }, { unique: true });
    await dbobj.collection('ob_users').createIndex({ user_id: 1 }, { unique: true });
    await dbobj.collection('ob_companies').createIndex({ c_id: 1 }, { unique: true });
    await dbobj.collection('ob_company_users').createIndex({ user_id: 1, c_id: 1 });
    await dbobj.collection('ob_roles').createIndex({ c_id: 1, role_id: 1 });
    await dbobj.collection('ob_accounts').createIndex({ c_id: 1, acc_id: 1 }, { unique: true });
    await dbobj.collection('ob_accounts').createIndex({ c_id: 1, acc_code: 1 });
    await dbobj.collection('ob_contacts').createIndex({ c_id: 1, con_id: 1 }, { unique: true });
    await dbobj.collection('ob_contacts').createIndex({ c_id: 1, cs_type: 1, name: 1 });
    await dbobj.collection('ob_items').createIndex({ c_id: 1, item_id: 1 }, { unique: true });
    await dbobj.collection('ob_items').createIndex({ c_id: 1, name: 1 });
    await dbobj.collection('ob_taxes').createIndex({ c_id: 1, tax_id: 1 });
    await dbobj.collection('ob_series').createIndex({ c_id: 1, trans_type: 1 });
    await dbobj.collection('ob_transactions').createIndex({ c_id: 1, trans_id: 1 }, { unique: true });
    await dbobj.collection('ob_transactions').createIndex({ c_id: 1, trans_type: 1, trans_date: -1 });
    await dbobj.collection('ob_transactions').createIndex({ c_id: 1, con_id: 1 });
    await dbobj.collection('ob_trans_acc').createIndex({ c_id: 1, acc_id: 1, trans_date: 1 });
    await dbobj.collection('ob_trans_acc').createIndex({ c_id: 1, trans_id: 1 });
    await dbobj.collection('ob_stock_ledger').createIndex({ c_id: 1, item_id: 1, trans_date: 1 });
    await dbobj.collection('ob_stock_ledger').createIndex({ c_id: 1, trans_id: 1 });
    await dbobj.collection('ob_price_lists').createIndex({ c_id: 1, price_list_id: 1 });
    await dbobj.collection('ob_einvoice_log').createIndex({ c_id: 1, trans_id: 1, at: -1 });
    await dbobj.collection('ob_einvoice_credentials').createIndex({ c_id: 1 }, { unique: true });
    await dbobj.collection('ob_transporters').createIndex({ c_id: 1, tp_id: 1 });
    await dbobj.collection('ob_reminders').createIndex({ c_id: 1, trans_id: 1, sent_on: -1 });
    await dbobj.collection('ob_recurring').createIndex({ stat: 1, is_active: 1, next_date: 1 });
    await dbobj.collection('ob_bank_transactions').createIndex({ c_id: 1, bank_id: 1, btr_date: -1 });
    await dbobj.collection('ob_office_assets').createIndex({ c_id: 1, asset_id: 1 }, { unique: true });
    await dbobj.collection('ob_office_assets').createIndex({ c_id: 1, asset_tag: 1 });
    await dbobj.collection('ob_office_assignments').createIndex({ c_id: 1, assignment_id: 1 }, { unique: true });
    await dbobj.collection('ob_office_assignments').createIndex({ c_id: 1, asset_id: 1, from_date: -1 });
}

module.exports = { ensureIndexes };
