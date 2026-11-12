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
    /*
     * Value of the stock of one item from its moves (oldest first).
     * FIFO: what goes out is taken from the oldest purchases first; what is left is valued at the cost of the newest purchases.
     * AVERAGE: weighted average cost, recalculated at every purchase.
     * A move with cost null (a sales return) comes in at the cost the stock has at that moment. A move without cost (opening stock,
     * stock adjustment) comes in at its rate. Stock that goes out when there is none is not valued (the stock is negative then).
     */
    valueItemStock(moves, method) {
        let layers = [];       // FIFO: [{ qty, cost }] oldest first
        let qty = 0, value = 0; // AVERAGE
        let last_cost = 0;
        for (const move of moves) {
            if (move.qty_in > 0) {
                let unit_cost;
                if (move.cost === null) {
                    unit_cost = method === 'FIFO'
                        ? (layers.reduce((sum, layer) => sum + layer.qty, 0) > 0 ? layers.reduce((sum, layer) => sum + layer.qty * layer.cost, 0) / layers.reduce((sum, layer) => sum + layer.qty, 0) : last_cost)
                        : (qty > 0 ? value / qty : last_cost);
                } else {
                    unit_cost = move.cost !== undefined ? move.cost : (move.rate || 0);
                }
                last_cost = unit_cost;
                layers.push({ qty: move.qty_in, cost: unit_cost });
                qty += move.qty_in;
                value += move.qty_in * unit_cost;
            }
            if (move.qty_out > 0) {
                let remaining = move.qty_out;
                while (remaining > 0 && layers.length > 0) {
                    let used = Math.min(remaining, layers[0].qty);
                    layers[0].qty -= used;
                    remaining -= used;
                    if (layers[0].qty <= 0) layers.shift();
                }
                let average_cost = qty > 0 ? value / qty : last_cost;
                value -= move.qty_out * average_cost;
                qty -= move.qty_out;
            }
        }
        if (method === 'FIFO') {
            return UTILS.round2(layers.reduce((sum, layer) => sum + layer.qty * layer.cost, 0));
        }
        return qty > 0 ? UTILS.round2(value) : 0;
    }

    async getStockPosition(dbobj, c_id, as_on_date, method = 'MASTER') {
        let valued_by_method = {};
        if (method === 'FIFO' || method === 'AVERAGE') {
            let all_moves = await dbobj.collection('ob_stock_ledger').find(
                { c_id: c_id, trans_date: { $lte: as_on_date } },
                { projection: { _id: 0, item_id: 1, qty_in: 1, qty_out: 1, rate: 1, cost: 1 } }).sort({ trans_date: 1, trans_id: 1 }).toArray();
            let moves_of_item = {};
            all_moves.forEach(move => {
                moves_of_item[move.item_id] = moves_of_item[move.item_id] || [];
                moves_of_item[move.item_id].push(move);
            });
            Object.keys(moves_of_item).forEach(item_id => { valued_by_method[item_id] = this.valueItemStock(moves_of_item[item_id], method); });
        }

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
            let has_method_value = method !== 'MASTER' && valued_by_method[item.item_id] !== undefined;
            let value = has_method_value ? valued_by_method[item.item_id] : UTILS.round2(qty * item.purchase_rate);
            return {
                item_id: item.item_id,
                name: item.name,
                sku: item.sku,
                uom: item.uom,
                stk_level: item.stk_level,
                qty: qty,
                rate: has_method_value ? (qty > 0 ? UTILS.round2(value / qty) : 0) : item.purchase_rate,
                value: value
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
