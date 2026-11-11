const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const SYS_DATA = require('../common/sys_data');

/* Shared queries of the account lists and the financial reports */
class Report {

    /*
     * Debit and credit totals per account from the ledger entries.
     * options.acc_ids  - only these accounts
     * options.from/to  - date range (Date), both optional
     * Returns { acc_id: { debit, credit } }
     */
    async getLedgerTotals(dbobj, c_id, options = {}) {
        let match = { c_id: c_id };
        if (options.acc_ids) {
            match.acc_id = { $in: options.acc_ids };
        }
        if (options.from || options.to) {
            match.trans_date = {};
            if (options.from) {
                match.trans_date.$gte = options.from;
            }
            if (options.to) {
                match.trans_date.$lte = options.to;
            }
        }
        let totals = await dbobj.collection('ob_trans_acc').aggregate([
            { $match: match },
            { $group: { _id: '$acc_id', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }
        ]).toArray();

        let total_map = {};
        totals.forEach(total => {
            total_map[total._id] = { debit: UTILS.round2(total.debit), credit: UTILS.round2(total.credit) };
        });
        return total_map;
    }

    /* Closing balance (debit positive) of each account including the opening balance. Returns { acc_id: balance } */
    async getAccountBalances(dbobj, c_id, acc_ids) {
        let accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, acc_id: { $in: acc_ids } }, { projection: { acc_id: 1, opening_balance: 1 } }).toArray();
        let totals = await this.getLedgerTotals(dbobj, c_id, { acc_ids: acc_ids });

        let balance_map = {};
        accounts.forEach(account => {
            let total = totals[account.acc_id] || { debit: 0, credit: 0 };
            balance_map[account.acc_id] = UTILS.round2((account.opening_balance || 0) + total.debit - total.credit);
        });
        return balance_map;
    }

    /* Group info (account type, report type) by group code */
    getGroupMap() {
        let group_map = {};
        SYS_DATA.ACCOUNT_GROUPS.forEach(group => {
            group_map[group[0]] = { group_code: group[0], name: group[1], parent_group_code: group[2], acc_type: group[3], rpt_type: group[4] };
        });
        return group_map;
    }

    /*
     * Trial balance rows: one row per account with opening, period movement and closing.
     * Used by the trial balance, profit and loss and balance sheet reports.
     */
    async getTrialBalanceRows(dbobj, c_id, from, to) {
        let accounts = await dbobj.collection('ob_accounts').find(
            { c_id: c_id, stat: CONFIG.STAT_ACTIVE }, { projection: { _id: 0 } }).toArray();
        let group_map = this.getGroupMap();

        // everything before "from" is the opening balance of the period
        let before_totals = from ? await this.getLedgerTotals(dbobj, c_id, { to: new Date(from.getTime() - 1) }) : {};
        let period_totals = await this.getLedgerTotals(dbobj, c_id, { from: from, to: to });

        return accounts.map(account => {
            let before = before_totals[account.acc_id] || { debit: 0, credit: 0 };
            let period = period_totals[account.acc_id] || { debit: 0, credit: 0 };
            let opening = UTILS.round2((account.opening_balance || 0) + before.debit - before.credit);
            let closing = UTILS.round2(opening + period.debit - period.credit);
            let group = group_map[account.group_code] || {};
            return {
                acc_id: account.acc_id,
                name: account.name,
                group_code: account.group_code,
                group_name: group.name || '',
                acc_type: group.acc_type || '',
                opening: opening,
                debit: period.debit,
                credit: period.credit,
                closing: closing
            };
        });
    }

    /* Reads from_date / to_date of a report request. Defaults to the current financial year */
    getDateRange(body, company) {
        let from = UTILS.toDate(body.from_date);
        let to = UTILS.toDate(body.to_date);
        if (!from || !to) {
            let financial_year = UTILS.getFinancialYear(new Date(), company.fy_start || CONFIG.DEFAULT_FY_START_MONTH);
            from = from || financial_year.start;
            to = to || financial_year.end;
        }
        return { from, to };
    }

    /*
     * Stock quantity and value of every inventory item on a date.
     * The value is quantity x the purchase rate of the item master (a simple valuation, not FIFO / average).
     * Returns [{ item_id, name, uom, qty, rate, value }]
     */
    async getStockPosition(dbobj, c_id, as_on_date) {
        let moves = await dbobj.collection('ob_stock_ledger').aggregate([
            { $match: { c_id: c_id, trans_date: { $lte: as_on_date } } },
            { $group: { _id: '$item_id', qty: { $sum: { $subtract: ['$qty_in', '$qty_out'] } } } }
        ]).toArray();
        let qty_map = {};
        moves.forEach(move => { qty_map[move._id] = move.qty; });

        let items = await dbobj.collection('ob_items').find(
            { c_id: c_id, is_inventory: true, stat: CONFIG.STAT_ACTIVE },
            { projection: { _id: 0, item_id: 1, name: 1, uom: 1, sku: 1, purchase_rate: 1, stk_level: 1 } }).sort({ name: 1 }).toArray();

        return items.map(item => {
            let qty = qty_map[item.item_id] || 0;
            return {
                item_id: item.item_id,
                name: item.name,
                sku: item.sku,
                uom: item.uom,
                stk_level: item.stk_level,
                qty: qty,
                rate: item.purchase_rate,
                value: UTILS.round2(qty * item.purchase_rate)
            };
        });
    }

    async getStockValue(dbobj, c_id, as_on_date) {
        let stock_position = await this.getStockPosition(dbobj, c_id, as_on_date);
        return UTILS.round2(stock_position.reduce((sum, item) => sum + item.value, 0));
    }

    /* Sum of tot_amount etc. of transactions of the given types in a period (register reports, dashboard) */
    async getTransactionTotals(dbobj, c_id, trans_types, from, to) {
        let totals = await dbobj.collection('ob_transactions').aggregate([
            { $match: { c_id: c_id, stat: CONFIG.STAT_ACTIVE, trans_type: { $in: trans_types }, trans_date: { $gte: from, $lte: to } } },
            { $group: { _id: null, taxable_amount: { $sum: '$taxable_amount' }, tot_tax: { $sum: '$tot_tax' }, tot_amount: { $sum: '$tot_amount' }, count: { $sum: 1 } } }
        ]).toArray();
        if (totals.length === 0) {
            return { taxable_amount: 0, tot_tax: 0, tot_amount: 0, count: 0 };
        }
        return {
            taxable_amount: UTILS.round2(totals[0].taxable_amount),
            tot_tax: UTILS.round2(totals[0].tot_tax),
            tot_amount: UTILS.round2(totals[0].tot_amount),
            count: totals[0].count
        };
    }
}

module.exports = new Report();
