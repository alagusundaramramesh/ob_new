const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const { BusinessError } = require('../utils/util.error');
const PRICE_LIST = require('./class.price_list');
const REPORT = require('./class.report');

const TT = CONFIG.TRANS_TYPES;

/* Types that have items (rate x qty with tax) */
const ITEM_TYPES = [
    TT.ESTIMATE, TT.SALES_ORDER, TT.DELIVERY_CHALLAN, TT.SALES_INVOICE, TT.SALES_RETAIL,
    TT.SALES_CREDIT_NOTE, TT.SALES_DEBIT_NOTE,
    TT.PURCHASE_QUOTE, TT.PURCHASE_ORDER, TT.GOODS_RECEIPT, TT.PURCHASE_INVOICE,
    TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE
];

/* Types that create ledger (accounting) entries. Quotes, orders and challans do not */
const SALES_INVOICE_TYPES = [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE];
const SALES_RETURN_TYPES = [TT.SALES_CREDIT_NOTE];
const PURCHASE_INVOICE_TYPES = [TT.PURCHASE_INVOICE];
const PURCHASE_RETURN_TYPES = [TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE];
const RECEIPT_TYPES = [TT.SALES_PAYMENT, TT.PURCHASE_PAYMENT];
const JOURNAL_TYPES = [TT.JOURNAL, TT.CONTRA];

/* Types that move stock. IN adds to the stock, OUT reduces it. Debit notes only change the value */
const STOCK_IN_TYPES = [TT.SALES_CREDIT_NOTE, TT.PURCHASE_INVOICE, TT.GOODS_RECEIPT];
const STOCK_OUT_TYPES = [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.DELIVERY_CHALLAN, TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE];

/* Types that are billed documents, the customer/supplier balance depends on them */
const OUTSTANDING_TYPES = [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_DEBIT_NOTE, TT.PURCHASE_INVOICE];

class Transaction {

    hasItems(trans_type) {
        return ITEM_TYPES.includes(trans_type);
    }

    isSalesSide(trans_type) {
        return trans_type.startsWith('S');
    }

    hasLedger(trans_type) {
        return SALES_INVOICE_TYPES.includes(trans_type) || SALES_RETURN_TYPES.includes(trans_type) ||
            PURCHASE_INVOICE_TYPES.includes(trans_type) || PURCHASE_RETURN_TYPES.includes(trans_type) ||
            RECEIPT_TYPES.includes(trans_type) || JOURNAL_TYPES.includes(trans_type);
    }

    isOutstandingType(trans_type) {
        return OUTSTANDING_TYPES.includes(trans_type);
    }

    /* ------------------------------------------------------------------ */
    /* NUMBERING                                                          */
    /* ------------------------------------------------------------------ */

    /* Takes the next number of the default series of the transaction type, e.g. INV-12 */
    async nextTransNo(dbobj, c_id, trans_type) {
        let series = await dbobj.collection('ob_series').findOneAndUpdate(
            { c_id: c_id, trans_type: trans_type, is_default: true, stat: CONFIG.STAT_ACTIVE },
            { $inc: { nxt_number: 1 } },
            { returnDocument: 'before' }
        );
        if (!series) {
            throw new BusinessError(`Number series not found for transaction type ${trans_type}`);
        }
        return {
            series_id: series.series_id,
            trans_no: `${series.prefix}${series.nxt_number}${series.suffix || ''}`
        };
    }

    /* ------------------------------------------------------------------ */
    /* CALCULATION                                                        */
    /* ------------------------------------------------------------------ */

    /*
     * Calculates every item line, the tax split and the totals.
     * input.items: [{ item_id, qty, rate, disc_percentage, disc_amount, tax_id, ... }]
     * Returns a new object, the input is not changed.
     */
    async calculate(dbobj, company, input) {
        let tax_ids = input.items.map(item => item.tax_id).filter(tax_id => tax_id);
        let taxes = await dbobj.collection('ob_taxes')
            .find({ c_id: company.c_id, tax_id: { $in: tax_ids } }).toArray();
        let tax_map = {};
        taxes.forEach(tax => { tax_map[tax.tax_id] = tax; });

        // Inside the state: CGST + SGST. Outside the state: IGST. A supply to an SEZ or an export is always IGST
        let is_inter_state_supply = input.gst_treatment === 'SEZ' || input.gst_treatment === 'EXPORT';
        let same_state = !is_inter_state_supply && (!input.dst_state_code || !company.state_code || input.dst_state_code === company.state_code);
        let state_type = same_state ? 'I' : 'X';
        // Zero rated (export / SEZ without payment of tax): the rate is kept for the return, but no tax is charged
        let is_zero_rated = !!input.zero_rated;
        // Reverse charge purchase: the supplier is paid the taxable value only, the buyer pays the tax to the government
        let is_reverse_charge = !!input.reverse_charge;
        let include_tax = !!input.include_tax && !is_zero_rated;

        let tax_summary = {};
        let items = input.items.map(item => {
            let qty = Number(item.qty) || 0;
            let rate = Number(item.rate) || 0;
            let gross_amount = qty * rate;
            let disc_amount = item.disc_percentage
                ? gross_amount * Number(item.disc_percentage) / 100
                : Number(item.disc_amount) || 0;
            let line_amount = gross_amount - disc_amount;

            let tax = tax_map[item.tax_id];
            let tax_details = tax
                ? tax.details.filter(detail => detail.state_type === state_type || detail.state_type === 'A')
                : [];
            let total_tax_rate = tax_details.reduce((sum, detail) => sum + detail.tax_rate, 0);

            let taxable_amount = include_tax ? line_amount / (1 + total_tax_rate / 100) : line_amount;
            let item_taxes = tax_details.map(detail => ({
                tax_type_code: detail.tax_type_code,
                tax_rate: detail.tax_rate,
                tax_value: is_zero_rated ? 0 : UTILS.round2(taxable_amount * detail.tax_rate / 100)
            }));
            item_taxes.forEach(item_tax => {
                let summary_key = `${item_tax.tax_type_code}_${item_tax.tax_rate}`;
                if (!tax_summary[summary_key]) {
                    tax_summary[summary_key] = { tax_type_code: item_tax.tax_type_code, tax_rate: item_tax.tax_rate, tax_value: 0 };
                }
                tax_summary[summary_key].tax_value = UTILS.round2(tax_summary[summary_key].tax_value + item_tax.tax_value);
            });

            taxable_amount = UTILS.round2(taxable_amount);
            let tax_value = item_taxes.reduce((sum, item_tax) => sum + item_tax.tax_value, 0);
            return {
                item_id: item.item_id,
                item_name: item.item_name,
                item_desc: item.item_desc || '',
                item_type: item.item_type || 'P',
                hs: item.hs || '',
                unit: item.unit || '',
                qty: qty,
                free_qty: Number(item.free_qty) || 0,
                rate: rate,
                disc_percentage: Number(item.disc_percentage) || 0,
                disc_amount: UTILS.round2(disc_amount),
                taxable_amount: taxable_amount,
                tax_id: item.tax_id || 0,
                tax_name: tax ? tax.name : '',
                taxes: item_taxes,
                item_total: UTILS.round2(is_reverse_charge ? taxable_amount : taxable_amount + tax_value),
                loc_id: item.loc_id || 0
            };
        });

        let taxable_amount = UTILS.round2(items.reduce((sum, item) => sum + item.taxable_amount, 0));
        // With reverse charge the tax is not part of the amount of the document (it stays in item.taxes and tax_summary for the ledger and the returns)
        let tot_tax = UTILS.round2(items.reduce((sum, item) => sum + item.item_total - item.taxable_amount, 0));
        let raw_total = UTILS.round2(taxable_amount + tot_tax);
        let tot_amount = input.round_off === false ? raw_total : Math.round(raw_total);

        return {
            items: items,
            tax_summary: Object.values(tax_summary),
            taxable_amount: taxable_amount,
            tot_tax: tot_tax,
            round_amount: UTILS.round2(tot_amount - raw_total),
            tot_amount: tot_amount
        };
    }

    /* ------------------------------------------------------------------ */
    /* LEDGER (double entry)                                              */
    /* ------------------------------------------------------------------ */

    async findAccountId(dbobj, c_id, acc_code) {
        let account = await dbobj.collection('ob_accounts').findOne(
            { c_id: c_id, acc_code: acc_code, stat: CONFIG.STAT_ACTIVE },
            { projection: { acc_id: 1 } }
        );
        if (!account) {
            throw new BusinessError(`System account ${acc_code} not found`);
        }
        return account.acc_id;
    }

    /* Ledger account of a customer or supplier. Cash sales without a contact use the Cash account */
    async findContactAccountId(dbobj, c_id, con_id) {
        if (!con_id) {
            return this.findAccountId(dbobj, c_id, 'CASH');
        }
        let contact = await dbobj.collection('ob_contacts').findOne(
            { c_id: c_id, con_id: con_id, stat: CONFIG.STAT_ACTIVE },
            { projection: { con_acc_id: 1 } }
        );
        if (!contact) {
            throw new BusinessError('Contact not found');
        }
        return contact.con_acc_id;
    }

    /* Builds the debit / credit lines of a transaction. Does not touch the database except for account lookups */
    async buildLedgerLines(dbobj, trans) {
        let c_id = trans.c_id;
        let lines = [];
        let add_line = (acc_id, debit, credit, desc) => {
            if (!debit && !credit) {
                return;
            }
            lines.push({ acc_id, debit: UTILS.round2(debit), credit: UTILS.round2(credit), desc: desc || '' });
        };
        let tax_account_suffix = this.isSalesSide(trans.trans_type) ? '_OUT' : '_IN';

        if (SALES_INVOICE_TYPES.includes(trans.trans_type) || SALES_RETURN_TYPES.includes(trans.trans_type) ||
            PURCHASE_INVOICE_TYPES.includes(trans.trans_type) || PURCHASE_RETURN_TYPES.includes(trans.trans_type)) {

            let is_sales_side = this.isSalesSide(trans.trans_type);
            // Invoices increase the receivable / expense. Returns do the opposite
            let is_normal = SALES_INVOICE_TYPES.includes(trans.trans_type) || PURCHASE_INVOICE_TYPES.includes(trans.trans_type);
            let contact_acc_id = await this.findContactAccountId(dbobj, c_id, trans.con_id);
            let value_acc_code = is_sales_side
                ? (is_normal ? 'SALES' : 'SALES_RETURN')
                : (is_normal ? 'PURCHASE' : 'PURCHASE_RETURN');
            let value_acc_id = await this.findAccountId(dbobj, c_id, value_acc_code);

            // Sales invoice: Dr customer, Cr sales + tax.  Purchase invoice: Dr purchase + tax, Cr supplier
            let contact_is_debit = is_sales_side === is_normal;
            let value_is_debit = !contact_is_debit;

            let contact_desc = `${trans.trans_type} ${trans.trans_no}`;
            add_line(contact_acc_id, contact_is_debit ? trans.tot_amount : 0, contact_is_debit ? 0 : trans.tot_amount, contact_desc);
            add_line(value_acc_id, value_is_debit ? trans.taxable_amount : 0, value_is_debit ? 0 : trans.taxable_amount, contact_desc);
            for (const tax_line of trans.tax_summary) {
                let tax_acc_id = await this.findAccountId(dbobj, c_id, `${tax_line.tax_type_code}${tax_account_suffix}`);
                add_line(tax_acc_id, value_is_debit ? tax_line.tax_value : 0, value_is_debit ? 0 : tax_line.tax_value, contact_desc);
                if (trans.reverse_charge) {
                    // Reverse charge: the buyer owes the same tax to the government, so the credit is matched by a liability
                    let liability_acc_id = await this.findAccountId(dbobj, c_id, `${tax_line.tax_type_code}_OUT`);
                    add_line(liability_acc_id, value_is_debit ? 0 : tax_line.tax_value, value_is_debit ? tax_line.tax_value : 0, `${contact_desc} (reverse charge)`);
                }
            }
            if (trans.round_amount) {
                let round_acc_id = await this.findAccountId(dbobj, c_id, 'ROUND_OFF');
                // The contact line already includes the round off, so the round off goes on the value side
                let round_is_debit = value_is_debit ? trans.round_amount > 0 : trans.round_amount < 0;
                add_line(round_acc_id, round_is_debit ? Math.abs(trans.round_amount) : 0, round_is_debit ? 0 : Math.abs(trans.round_amount), 'Round off');
            }

            // Amount paid at the time of billing (retail sale, cash purchase)
            for (const payment of trans.payments || []) {
                let paid_is_debit = is_sales_side; // sales: money comes in
                add_line(payment.acc_id, paid_is_debit ? payment.amount : 0, paid_is_debit ? 0 : payment.amount, 'Payment');
                add_line(contact_acc_id, paid_is_debit ? 0 : payment.amount, paid_is_debit ? payment.amount : 0, 'Payment');
            }
        }

        if (RECEIPT_TYPES.includes(trans.trans_type)) {
            let contact_acc_id = await this.findContactAccountId(dbobj, c_id, trans.con_id);
            let cash_amount = UTILS.round2(trans.tot_amount - (trans.tds_amount || 0));
            if (trans.trans_type === TT.SALES_PAYMENT) {
                // Receipt: Dr bank/cash (and TDS receivable), Cr customer
                add_line(trans.pay_acc_id, cash_amount, 0, trans.pay_ref);
                if (trans.tds_amount) {
                    add_line(await this.findAccountId(dbobj, c_id, 'TDS_RECEIVABLE'), trans.tds_amount, 0, 'TDS');
                }
                add_line(contact_acc_id, 0, trans.tot_amount, trans.pay_ref);
            } else {
                // Payment: Dr supplier, Cr bank/cash
                add_line(contact_acc_id, trans.tot_amount, 0, trans.pay_ref);
                add_line(trans.pay_acc_id, 0, trans.tot_amount, trans.pay_ref);
            }
        }

        if (JOURNAL_TYPES.includes(trans.trans_type)) {
            for (const journal_line of trans.lines) {
                add_line(journal_line.acc_id, journal_line.debit || 0, journal_line.credit || 0, journal_line.desc);
            }
        }

        let total_debit = UTILS.round2(lines.reduce((sum, line) => sum + line.debit, 0));
        let total_credit = UTILS.round2(lines.reduce((sum, line) => sum + line.credit, 0));
        if (total_debit !== total_credit) {
            throw new BusinessError(`Debit (${total_debit}) and credit (${total_credit}) are not equal`);
        }
        return lines;
    }

    async postLedger(dbobj, trans) {
        if (!this.hasLedger(trans.trans_type)) {
            return;
        }
        let lines = await this.buildLedgerLines(dbobj, trans);
        if (lines.length === 0) {
            return;
        }
        let entries = lines.map(line => ({
            trans_id: trans.trans_id,
            c_id: trans.c_id,
            trans_type: trans.trans_type,
            trans_no: trans.trans_no,
            trans_date: trans.trans_date,
            acc_id: line.acc_id,
            debit: line.debit,
            credit: line.credit,
            desc: line.desc,
            con_id: trans.con_id || 0
        }));
        await dbobj.collection('ob_trans_acc').insertMany(entries);
    }

    /* ------------------------------------------------------------------ */
    /* STOCK                                                              */
    /* ------------------------------------------------------------------ */

    /* Stock moves of a transaction: [{ item_id, qty_in, qty_out }] */
    async buildStockMoves(dbobj, trans) {
        let is_in = STOCK_IN_TYPES.includes(trans.trans_type);
        let is_out = STOCK_OUT_TYPES.includes(trans.trans_type);
        if (!is_in && !is_out) {
            return [];
        }
        // An invoice made from a delivery challan / goods receipt does not move the stock again
        if (trans.ref_id && trans.ref_trans_type && [TT.DELIVERY_CHALLAN, TT.GOODS_RECEIPT].includes(trans.ref_trans_type)) {
            return [];
        }
        let item_ids = trans.items.map(item => item.item_id);
        let inventory_items = await dbobj.collection('ob_items').find(
            { c_id: trans.c_id, item_id: { $in: item_ids }, is_inventory: true },
            { projection: { item_id: 1, name: 1 } }
        ).toArray();
        let inventory_item_ids = inventory_items.map(inventory_item => inventory_item.item_id);

        return trans.items
            .filter(item => inventory_item_ids.includes(item.item_id))
            .map(item => {
                let qty = item.qty + (item.free_qty || 0);
                return {
                    item_id: item.item_id,
                    item_name: item.item_name,
                    qty_in: is_in ? qty : 0,
                    qty_out: is_out ? qty : 0,
                    rate: item.rate,
                    // Cost per unit of what comes in on a purchase (after discount, without tax, free quantity included). null = a sales return:
                    // the stock valuation (FIFO / average) then uses the cost the stock had at that time
                    cost: is_in ? (this.isSalesSide(trans.trans_type) ? null : UTILS.round2(item.taxable_amount / qty)) : undefined,
                    loc_id: item.loc_id || 0
                };
            });
    }

    /* Checks the stock before saving. Only when the company does not allow negative stock */
    async checkStockAvailable(dbobj, company, stock_moves) {
        if (company.allow_negative_stock !== false) {
            return;
        }
        for (const stock_move of stock_moves) {
            if (!stock_move.qty_out) {
                continue;
            }
            let item = await dbobj.collection('ob_items').findOne(
                { c_id: company.c_id, item_id: stock_move.item_id },
                { projection: { cur_stk: 1, name: 1 } }
            );
            if (!item || (item.cur_stk || 0) < stock_move.qty_out) {
                throw new BusinessError(`Insufficient stock for ${stock_move.item_name}`);
            }
        }
    }

    async postStock(dbobj, trans, stock_moves) {
        if (stock_moves.length === 0) {
            return;
        }
        let stock_entries = stock_moves.map(stock_move => ({
            trans_id: trans.trans_id,
            c_id: trans.c_id,
            trans_type: trans.trans_type,
            trans_no: trans.trans_no,
            trans_date: trans.trans_date,
            item_id: stock_move.item_id,
            qty_in: stock_move.qty_in,
            qty_out: stock_move.qty_out,
            rate: stock_move.rate,
            cost: stock_move.cost, // stock in only (see buildStockMoves)
            loc_id: stock_move.loc_id
        }));
        await dbobj.collection('ob_stock_ledger').insertMany(stock_entries);
        for (const stock_move of stock_moves) {
            await dbobj.collection('ob_items').updateOne(
                { c_id: trans.c_id, item_id: stock_move.item_id },
                { $inc: { cur_stk: stock_move.qty_in - stock_move.qty_out } }
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* RECEIPT / PAYMENT ALLOCATION                                       */
    /* ------------------------------------------------------------------ */

    /* paid / unpaid status of a billed document */
    getPaidStatus(tot_amount, rec_amt) {
        return rec_amt >= tot_amount - 0.005 ? CONFIG.TRANS_STATUS.PAID : CONFIG.TRANS_STATUS.SENT;
    }

    /* Validates the allocations of a receipt / payment and adds them to the rec_amt of the invoices */
    async applyAllocations(dbobj, trans) {
        for (const allocation of trans.allocations || []) {
            let invoice = await dbobj.collection('ob_transactions').findOne(
                { c_id: trans.c_id, trans_id: allocation.trans_id, stat: CONFIG.STAT_ACTIVE }
            );
            let new_rec_amt = UTILS.round2((invoice.rec_amt || 0) + allocation.amount);
            await dbobj.collection('ob_transactions').updateOne(
                { c_id: trans.c_id, trans_id: allocation.trans_id },
                { $set: { rec_amt: new_rec_amt, status: this.getPaidStatus(invoice.tot_amount, new_rec_amt) } }
            );
        }
    }

    /* Throws when an allocation is not valid (wrong contact, more than the pending amount ...) */
    async validateAllocations(dbobj, trans) {
        let allocated_total = 0;
        for (const allocation of trans.allocations || []) {
            let invoice = await dbobj.collection('ob_transactions').findOne(
                { c_id: trans.c_id, trans_id: allocation.trans_id, stat: CONFIG.STAT_ACTIVE }
            );
            if (!invoice) {
                throw new BusinessError(`Invoice ${allocation.trans_id} not found`);
            }
            if (!this.isOutstandingType(invoice.trans_type)) {
                throw new BusinessError(`${invoice.trans_no} can not be paid`);
            }
            if (invoice.con_id !== trans.con_id) {
                throw new BusinessError(`${invoice.trans_no} belongs to another contact`);
            }
            let pending_amount = UTILS.round2(invoice.tot_amount - (invoice.rec_amt || 0));
            if (allocation.amount > pending_amount + 0.005) {
                throw new BusinessError(`Amount for ${invoice.trans_no} is more than the pending amount ${pending_amount}`);
            }
            allocated_total += allocation.amount;
        }
        if (UTILS.round2(allocated_total) > trans.tot_amount + 0.005) {
            throw new BusinessError('Allocated amount is more than the amount received');
        }
    }

    /* ------------------------------------------------------------------ */
    /* REMOVE EFFECTS (used by edit and delete)                           */
    /* ------------------------------------------------------------------ */

    /* Removes the ledger entries, the stock moves and the allocations of an existing transaction */
    async removeEffects(dbobj, trans) {
        await dbobj.collection('ob_trans_acc').deleteMany({ c_id: trans.c_id, trans_id: trans.trans_id });

        let stock_entries = await dbobj.collection('ob_stock_ledger')
            .find({ c_id: trans.c_id, trans_id: trans.trans_id }).toArray();
        for (const stock_entry of stock_entries) {
            await dbobj.collection('ob_items').updateOne(
                { c_id: trans.c_id, item_id: stock_entry.item_id },
                { $inc: { cur_stk: stock_entry.qty_out - stock_entry.qty_in } }
            );
        }
        await dbobj.collection('ob_stock_ledger').deleteMany({ c_id: trans.c_id, trans_id: trans.trans_id });

        for (const allocation of trans.allocations || []) {
            let invoice = await dbobj.collection('ob_transactions').findOne(
                { c_id: trans.c_id, trans_id: allocation.trans_id }
            );
            if (!invoice) {
                continue;
            }
            let new_rec_amt = Math.max(0, UTILS.round2((invoice.rec_amt || 0) - allocation.amount));
            await dbobj.collection('ob_transactions').updateOne(
                { c_id: trans.c_id, trans_id: allocation.trans_id },
                { $set: { rec_amt: new_rec_amt, status: this.getPaidStatus(invoice.tot_amount, new_rec_amt) } }
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* SAVE / DELETE                                                      */
    /* ------------------------------------------------------------------ */

    /* Books can not be changed on or before the "locked till" date of the company */
    checkBooksLocked(company, trans_date) {
        if (company.locked_till && trans_date <= new Date(company.locked_till)) {
            throw new BusinessError('Books are locked till ' + new Date(company.locked_till).toISOString().slice(0, 10), 'BOOKS_LOCKED');
        }
    }

    /* Loads the customer / supplier of the transaction and checks it is the right kind of contact */
    async getContact(dbobj, c_id, trans_type, con_id) {
        let needs_contact = !JOURNAL_TYPES.includes(trans_type);
        if (!con_id) {
            // A retail sale can be made without a customer (cash sale)
            if (needs_contact && trans_type !== TT.SALES_RETAIL) {
                throw new BusinessError('Select a customer / supplier', 'CONTACT_REQUIRED');
            }
            return null;
        }
        if (JOURNAL_TYPES.includes(trans_type)) {
            return null;
        }
        let contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, con_id: con_id, stat: CONFIG.STAT_ACTIVE });
        if (!contact) {
            throw new BusinessError('Customer / supplier not found', 'CONTACT_NOT_FOUND');
        }
        let expected_cs_type = this.isSalesSide(trans_type) ? 'C' : 'S';
        if (contact.cs_type !== expected_cs_type) {
            throw new BusinessError(expected_cs_type === 'C' ? 'Select a customer' : 'Select a supplier', 'CONTACT_TYPE_MISMATCH');
        }
        if (!contact.is_active) {
            throw new BusinessError(`${contact.name} is inactive`, 'CONTACT_INACTIVE');
        }
        return contact;
    }

    /* Adds name, hs, unit, default rate and tax from the item master to the lines the client sent */
    async fillItemDetails(dbobj, c_id, trans_type, input_items, contact, trans_date) {
        // The price list of the customer / supplier gives the rate when the client did not send one
        let price_list = await PRICE_LIST.findForContact(dbobj, c_id, contact, trans_date);
        let item_ids = input_items.map(input_item => input_item.item_id);
        let master_items = await dbobj.collection('ob_items')
            .find({ c_id: c_id, item_id: { $in: item_ids }, stat: CONFIG.STAT_ACTIVE }).toArray();
        let item_map = {};
        master_items.forEach(master_item => { item_map[master_item.item_id] = master_item; });

        let is_sales_side = this.isSalesSide(trans_type);
        return input_items.map(input_item => {
            let master_item = item_map[input_item.item_id];
            if (!master_item) {
                throw new BusinessError(`Item ${input_item.item_id} not found`, 'ITEM_NOT_FOUND');
            }
            if (!(Number(input_item.qty) > 0)) {
                throw new BusinessError(`Quantity is required for ${master_item.name}`, 'QTY_REQUIRED');
            }
            let default_rate = is_sales_side ? master_item.sale_rate : master_item.purchase_rate;
            if (price_list) {
                default_rate = PRICE_LIST.getRate(price_list, master_item.item_id, default_rate, input_item.qty);
            }
            // The discount of a customer is the default discount of every line, unless the line has its own
            let has_own_discount = input_item.disc_percentage !== undefined || input_item.disc_amount !== undefined;
            let default_discount = is_sales_side && !has_own_discount && contact && contact.discount ? contact.discount : undefined;
            return {
                ...input_item,
                disc_percentage: default_discount !== undefined ? default_discount : input_item.disc_percentage,
                item_name: input_item.item_name || master_item.name,
                item_type: master_item.type,
                hs: input_item.hs || master_item.hs || '',
                unit: input_item.unit || master_item.uom || '',
                rate: input_item.rate === undefined || input_item.rate === '' ? default_rate : input_item.rate,
                tax_id: input_item.tax_id === undefined ? master_item.tax_id : input_item.tax_id
            };
        });
    }

    async findPaymentAccount(dbobj, c_id, acc_id) {
        let account = await dbobj.collection('ob_accounts').findOne(
            { c_id: c_id, acc_id: acc_id, stat: CONFIG.STAT_ACTIVE, group_code: { $in: ['BA', 'CH'] } },
            { projection: { acc_id: 1 } }
        );
        if (!account) {
            throw new BusinessError('Select a valid bank / cash account', 'PAYMENT_ACCOUNT_INVALID');
        }
        return account;
    }

    /*
     * Export / SEZ, zero rated and reverse charge: sets the flags on the document and refuses the combinations that are not possible.
     * zero_rated: sales to an SEZ or an export without payment of tax. reverse_charge: purchase invoices and returns only.
     */
    applyGstFlags(trans, input, company) {
        let is_sales = this.isSalesSide(trans.trans_type);
        let is_export_or_sez = trans.gst_treatment === 'EXPORT' || trans.gst_treatment === 'SEZ';

        if (is_sales && is_export_or_sez) {
            trans.zero_rated = !!input.zero_rated;
        } else if (input.zero_rated) {
            throw new BusinessError('"Without payment of tax" is only for sales to an SEZ or an export customer', 'ZERO_RATED_NOT_ALLOWED');
        }
        if (trans.gst_treatment === 'EXPORT' && is_sales) {
            trans.dst_state_code = '96'; // place of supply "Other countries"
        }

        if (!is_sales) {
            trans.reverse_charge = !!input.reverse_charge;
        } else if (input.reverse_charge) {
            throw new BusinessError('Reverse charge is only for purchases', 'REVERSE_CHARGE_NOT_ALLOWED');
        }
    }

    /*
     * Credit limit of a customer: a sale that makes the customer owe more than the limit is refused (when the contact has "block" on).
     * What the customer owes now + what this document adds (total - paid now; on an edit, the old document is taken out first).
     */
    async checkCreditLimit(dbobj, trans, contact, old_trans) {
        if (!contact || !(contact.credit_limit > 0) || contact.credit_block === false || !SALES_INVOICE_TYPES.includes(trans.trans_type)) {
            return;
        }
        let added = trans.tot_amount - (trans.inline_paid || 0);
        if (old_trans) {
            added -= old_trans.tot_amount - (old_trans.inline_paid || 0);
        }
        if (added <= 0) {
            return;
        }
        let balance_map = await REPORT.getAccountBalances(dbobj, trans.c_id, [contact.con_acc_id]);
        let owed_now = balance_map[contact.con_acc_id] || 0;
        if (UTILS.round2(owed_now + added) > contact.credit_limit + 0.005) {
            throw new BusinessError(
                `Credit limit of ${contact.name} is ${contact.credit_limit}. The customer owes ${UTILS.round2(owed_now)} and this document adds ${UTILS.round2(added)}`,
                'CREDIT_LIMIT_EXCEEDED');
        }
    }

    /* A composition dealer (the supplier, or this company) can not charge GST on its bills */
    checkTaxAllowed(trans, company) {
        let is_sales = this.isSalesSide(trans.trans_type);
        let tax_charged = trans.tax_summary.some(tax_line => tax_line.tax_value > 0);
        if (!is_sales && trans.gst_treatment === 'COMP' && tax_charged) {
            throw new BusinessError('The supplier is a composition dealer and can not charge GST. Remove the tax from the items', 'COMPOSITION_SUPPLIER_TAX');
        }
        if (is_sales && company.gst_scheme === 'COMPOSITION' && tax_charged) {
            throw new BusinessError('This company is registered under the composition scheme and can not charge GST. Use items without tax', 'COMPOSITION_COMPANY_TAX');
        }
    }

    /* Turns the client input into the transaction document (nothing is written here) */
    async buildTransaction(dbobj, company, input, contact, user_email) {
        let trans_type = input.trans_type;
        let trans = {
            c_id: company.c_id,
            trans_type: trans_type,
            trans_date: UTILS.toDate(input.trans_date),
            due_date: UTILS.toDate(input.due_date),
            ref: input.ref || '',
            notes: input.notes || '',
            con_id: contact ? contact.con_id : 0,
            con_name: contact ? contact.name : (input.con_name || ''),
            con_tax_no: contact ? contact.tax_no : '',
            dst_state_code: input.dst_state_code || (contact ? contact.state_code : '') || '',
            ref_id: input.ref_id || 0,
            ref_trans_type: input.ref_trans_type || '',
            include_tax: !!input.include_tax,
            gst_treatment: contact && contact.gst_treatment ? contact.gst_treatment : 'REG', // REG, SEZ, EXPORT or COMP (see contact_save)
            zero_rated: false,
            reverse_charge: false,
            status: CONFIG.TRANS_STATUS.SENT,
            payments: [],
            inline_paid: 0,
            rec_amt: 0,
            stat: CONFIG.STAT_ACTIVE,
            updated_by: user_email,
            updated_on: new Date()
        };
        if (!trans.due_date && contact && contact.credit_days && this.isOutstandingType(trans_type)) {
            trans.due_date = new Date(trans.trans_date.getTime() + contact.credit_days * 86400000);
        }

        if (this.hasItems(trans_type)) {
            if (!Array.isArray(input.items) || input.items.length === 0) {
                throw new BusinessError('Add at least one item', 'ITEMS_REQUIRED');
            }
            let items = await this.fillItemDetails(dbobj, company.c_id, trans_type, input.items, contact, trans.trans_date);
            this.applyGstFlags(trans, input, company);
            let calculated = await this.calculate(dbobj, company, {
                items: items,
                dst_state_code: trans.dst_state_code,
                include_tax: trans.include_tax,
                gst_treatment: trans.gst_treatment,
                zero_rated: trans.zero_rated,
                reverse_charge: trans.reverse_charge,
                round_off: input.round_off
            });
            Object.assign(trans, calculated);
            this.checkTaxAllowed(trans, company);

            // Amount paid at the time of billing
            if (this.hasLedger(trans_type) && Array.isArray(input.payments)) {
                for (const input_payment of input.payments) {
                    let amount = UTILS.round2(input_payment.amount);
                    if (!(amount > 0)) {
                        continue;
                    }
                    await this.findPaymentAccount(dbobj, company.c_id, input_payment.acc_id);
                    trans.payments.push({ acc_id: input_payment.acc_id, pay_mode_id: input_payment.pay_mode_id || 0, ref: input_payment.ref || '', amount: amount });
                }
                trans.inline_paid = UTILS.round2(trans.payments.reduce((sum, payment) => sum + payment.amount, 0));
                if (trans.inline_paid > trans.tot_amount + 0.005) {
                    throw new BusinessError('Paid amount is more than the total amount', 'PAID_MORE_THAN_TOTAL');
                }
            }
        } else if (RECEIPT_TYPES.includes(trans_type)) {
            let amount = UTILS.round2(input.amount);
            if (!(amount > 0)) {
                throw new BusinessError('Amount is required', 'AMOUNT_REQUIRED');
            }
            await this.findPaymentAccount(dbobj, company.c_id, input.pay_acc_id);
            trans.tot_amount = amount;
            trans.tds_amount = UTILS.round2(input.tds_amount || 0);
            trans.pay_acc_id = input.pay_acc_id;
            trans.pay_mode_id = input.pay_mode_id || 0;
            trans.pay_ref = input.pay_ref || '';
            trans.allocations = (input.allocations || [])
                .map(allocation => ({ trans_id: allocation.trans_id, amount: UTILS.round2(allocation.amount) }))
                .filter(allocation => allocation.amount > 0);
            trans.status = CONFIG.TRANS_STATUS.PAID;
        } else {
            // Journal and contra
            let lines = (input.lines || []).filter(line => line.debit || line.credit);
            if (lines.length < 2) {
                throw new BusinessError('A journal needs at least two lines', 'JOURNAL_LINES_REQUIRED');
            }
            for (const line of lines) {
                if (line.debit && line.credit) {
                    throw new BusinessError('A line can not have both debit and credit', 'JOURNAL_LINE_INVALID');
                }
                let account = await dbobj.collection('ob_accounts').findOne(
                    { c_id: company.c_id, acc_id: line.acc_id, stat: CONFIG.STAT_ACTIVE }, { projection: { acc_id: 1 } });
                if (!account) {
                    throw new BusinessError(`Account ${line.acc_id} not found`, 'ACCOUNT_NOT_FOUND');
                }
            }
            trans.lines = lines.map(line => ({
                acc_id: line.acc_id,
                debit: UTILS.round2(line.debit || 0),
                credit: UTILS.round2(line.credit || 0),
                desc: line.desc || ''
            }));
            trans.tot_amount = UTILS.round2(trans.lines.reduce((sum, line) => sum + line.debit, 0));
            trans.status = CONFIG.TRANS_STATUS.PAID;
        }
        return trans;
    }

    /*
     * Input of transaction_save for a new document of target_type with the items of an existing one.
     * Used by transaction_convert and by the recurring invoices.
     */
    copyInput(source_trans, target_type, trans_date) {
        return {
            trans_type: target_type,
            trans_date: trans_date,
            con_id: source_trans.con_id,
            dst_state_code: source_trans.dst_state_code,
            include_tax: source_trans.include_tax,
            ref: source_trans.trans_no,
            ref_id: source_trans.trans_id,
            ref_trans_type: source_trans.trans_type,
            notes: source_trans.notes,
            items: source_trans.items.map(item => ({
                item_id: item.item_id, item_name: item.item_name, item_desc: item.item_desc, hs: item.hs, unit: item.unit,
                qty: item.qty, free_qty: item.free_qty, rate: item.rate, disc_percentage: item.disc_percentage,
                disc_amount: item.disc_amount, tax_id: item.tax_id
            }))
        };
    }

    /* Creates or updates a transaction with all its effects. Returns the saved document */
    async save(dbobj, company, input, user_email) {
        if (!Object.values(TT).includes(input.trans_type)) {
            throw new BusinessError('Invalid transaction type', 'INVALID_TRANS_TYPE');
        }
        let trans_date = UTILS.toDate(input.trans_date);
        if (!trans_date) {
            throw new BusinessError('Transaction date is required', 'DATE_REQUIRED');
        }
        this.checkBooksLocked(company, trans_date);

        let old_trans = null;
        if (input.trans_id) {
            old_trans = await dbobj.collection('ob_transactions').findOne(
                { c_id: company.c_id, trans_id: input.trans_id, stat: CONFIG.STAT_ACTIVE });
            if (!old_trans) {
                throw new BusinessError('Transaction not found', 'TRANS_NOT_FOUND');
            }
            if (old_trans.trans_type !== input.trans_type) {
                throw new BusinessError('Transaction type can not be changed', 'TRANS_TYPE_CHANGED');
            }
            this.checkBooksLocked(company, old_trans.trans_date);
            if (old_trans.einvoice) {
                throw new BusinessError('This document has an e-invoice (IRN) and can not be changed. Cancel the e-invoice within 24 hours and create a new document, or issue a credit note', 'EINVOICE_LOCKED');
            }
            if (old_trans.ewb && old_trans.ewb.status === 'ACT') {
                throw new BusinessError('This document has an active e-way bill and can not be changed. Cancel the e-way bill first', 'EWB_LOCKED');
            }
        }

        let contact = await this.getContact(dbobj, company.c_id, input.trans_type, input.con_id);
        let trans = await this.buildTransaction(dbobj, company, input, contact, user_email);

        if (old_trans) {
            trans.trans_id = old_trans.trans_id;
            trans.trans_no = old_trans.trans_no;
            trans.series_id = old_trans.series_id;
            trans.crd_on = old_trans.crd_on;
            // keep what the receipts already paid, replace only the amount paid at billing time
            trans.rec_amt = UTILS.round2((old_trans.rec_amt || 0) - (old_trans.inline_paid || 0));
            if (this.isOutstandingType(trans.trans_type) && trans.tot_amount < trans.rec_amt - 0.005) {
                throw new BusinessError('Total can not be less than the amount already received / paid', 'TOTAL_BELOW_PAID');
            }
        }
        trans.rec_amt = UTILS.round2((trans.rec_amt || 0) + trans.inline_paid);
        if (this.isOutstandingType(trans.trans_type)) {
            trans.status = this.getPaidStatus(trans.tot_amount, trans.rec_amt);
        }
        await this.checkCreditLimit(dbobj, trans, contact, old_trans);

        let old_effects_removed = false;
        let doc_written = false;
        let allocations_applied = false;
        try {
            if (old_trans) {
                await this.removeEffects(dbobj, old_trans);
                old_effects_removed = true;
            }
            if (RECEIPT_TYPES.includes(trans.trans_type)) {
                await this.validateAllocations(dbobj, trans);
            }

            if (!old_trans) {
                let numbering = await this.nextTransNo(dbobj, company.c_id, trans.trans_type);
                trans.trans_id = await UTILS.getNextId(dbobj, 'ob_transactions');
                trans.trans_no = input.trans_no || numbering.trans_no;
                trans.series_id = numbering.series_id;
                trans.crd_on = new Date();
            }

            let stock_moves = await this.buildStockMoves(dbobj, trans);
            await this.checkStockAvailable(dbobj, company, stock_moves);

            if (old_trans) {
                await dbobj.collection('ob_transactions').replaceOne({ c_id: company.c_id, trans_id: trans.trans_id }, trans);
            } else {
                await dbobj.collection('ob_transactions').insertOne(trans);
            }
            doc_written = true;

            await this.postLedger(dbobj, trans);
            await this.postStock(dbobj, trans, stock_moves);
            await this.applyAllocations(dbobj, trans);
            allocations_applied = true;
        } catch (err) {
            await this.rollbackSave(dbobj, trans, old_trans, { old_effects_removed, doc_written, allocations_applied });
            throw err;
        }
        return trans;
    }

    /* Puts the database back to what it was before a failed save */
    async rollbackSave(dbobj, trans, old_trans, progress) {
        try {
            if (progress.doc_written) {
                let new_effects = { ...trans, allocations: progress.allocations_applied ? trans.allocations : [] };
                await this.removeEffects(dbobj, new_effects);
                if (old_trans) {
                    await dbobj.collection('ob_transactions').replaceOne({ c_id: trans.c_id, trans_id: trans.trans_id }, old_trans);
                } else {
                    await dbobj.collection('ob_transactions').deleteOne({ c_id: trans.c_id, trans_id: trans.trans_id });
                }
            }
            if (old_trans && progress.old_effects_removed) {
                await this.postLedger(dbobj, old_trans);
                await this.postStock(dbobj, old_trans, await this.buildStockMoves(dbobj, old_trans));
                await this.applyAllocations(dbobj, old_trans);
            }
        } catch (rollback_error) {
            console.error('Rollback of transaction save failed', { trans_id: trans.trans_id, reason: rollback_error.message });
        }
    }

    /* Soft delete. The ledger and stock effects are removed */
    async remove(dbobj, company, trans_id) {
        let trans = await dbobj.collection('ob_transactions').findOne(
            { c_id: company.c_id, trans_id: trans_id, stat: CONFIG.STAT_ACTIVE });
        if (!trans) {
            throw new BusinessError('Transaction not found', 'TRANS_NOT_FOUND');
        }
        this.checkBooksLocked(company, trans.trans_date);

        if (trans.einvoice && trans.einvoice.status === 'ACT') {
            throw new BusinessError('Cancel the e-invoice (IRN) first. It can be cancelled within 24 hours of generation', 'EINVOICE_LOCKED');
        }
        if (trans.ewb && trans.ewb.status === 'ACT') {
            throw new BusinessError('Cancel the e-way bill first', 'EWB_LOCKED');
        }
        let paid_by_receipts = UTILS.round2((trans.rec_amt || 0) - (trans.inline_paid || 0));
        if (paid_by_receipts > 0.005) {
            throw new BusinessError('Delete the receipts / payments of this document first', 'HAS_RECEIPTS');
        }
        let referring_trans = await dbobj.collection('ob_transactions').findOne(
            { c_id: company.c_id, ref_id: trans_id, stat: CONFIG.STAT_ACTIVE }, { projection: { trans_no: 1 } });
        if (referring_trans) {
            throw new BusinessError(`Used in ${referring_trans.trans_no}. Delete that first`, 'HAS_REFERENCES');
        }

        await this.removeEffects(dbobj, trans);
        await dbobj.collection('ob_transactions').updateOne(
            { c_id: company.c_id, trans_id: trans_id },
            { $set: { stat: CONFIG.STAT_DELETED, deleted_on: new Date() } }
        );
        return trans;
    }
}

module.exports = new Transaction();
