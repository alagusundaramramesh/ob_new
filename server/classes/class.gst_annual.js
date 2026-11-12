const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const { BusinessError } = require('../utils/util.error');
const GST_RETURN = require('./class.gst_return');

const TT = CONFIG.TRANS_TYPES;
const r2 = UTILS.round2;
const HEADS = ['iamt', 'camt', 'samt', 'csamt'];

/*
 * Annual figures: GSTR-9 (regular scheme) and GSTR-4 (composition scheme).
 * Both are summaries of the figures to type into the portal. No JSON file is made for them.
 */
class GstAnnual {

    /* "2026" -> the financial year that starts in 2026 (the start month is the company's), with the 12 months as "YYYY-MM" */
    getYear(company, year) {
        let start_year = Number(year);
        if (!start_year || start_year < 2017 || start_year > 2100) {
            throw new BusinessError('Choose the financial year', 'YEAR_REQUIRED');
        }
        let start_month = company.fy_start || 4;
        let months = [];
        for (let index = 0; index < 12; index++) {
            let date = new Date(Date.UTC(start_year, start_month - 1 + index, 1));
            months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
        }
        return {
            label: `${start_year}-${String(start_year + 1).slice(2)}`, months: months,
            from: new Date(Date.UTC(start_year, start_month - 1, 1)), to: new Date(Date.UTC(start_year, start_month - 1 + 12, 0))
        };
    }

    /* ------------------------------------------------------------------ GSTR-9 */

    async buildGstr9(dbobj, company, year) {
        GST_RETURN.checkRegularScheme(company);
        let fy = this.getYear(company, year);
        let gstin = GST_RETURN.getGstin(company);

        let months = [];
        for (const month of fy.months) {
            let gstr1 = await GST_RETURN.buildGstr1(dbobj, company, month);
            let gstr3b = await GST_RETURN.buildGstr3b(dbobj, company, month);
            let summary = gstr1.summary;
            months.push({
                month: month,
                documents: summary.documents,
                b2c_txval: r2(summary.b2cl.txval + summary.b2cs.txval),
                b2b_txval: r2(summary.b2b.txval - summary.sez.txval),
                sez_txval: summary.sez.txval,
                export_txval: summary.exp.txval,
                notes_txval: summary.notes_txval,
                nil_txval: summary.nil.amount,
                output: gstr3b.summary.output,
                zero_rated: gstr3b.summary.zero_rated,
                reverse_charge: gstr3b.summary.reverse_charge,
                itc: gstr3b.summary.itc,
                payable: gstr3b.summary.payable,
            });
        }

        let total = (pick) => r2(months.reduce((sum, month) => sum + pick(month), 0));
        let total_heads = (pick) => Object.fromEntries(HEADS.map(head => [head, total(month => pick(month)[head])]));
        let output = total_heads(month => month.output);
        let zero_rated = total_heads(month => month.zero_rated);
        let reverse_charge = total_heads(month => month.reverse_charge);
        let itc = total_heads(month => month.itc);
        let payable = total_heads(month => month.payable);

        return {
            fy: fy.label, gstin: gstin, months: months,
            tables: {
                // Part II: outward supplies
                '4A': { text: 'Supplies to unregistered buyers (B2C)', txval: total(month => month.b2c_txval) },
                '4B': { text: 'Supplies to registered buyers (B2B)', txval: total(month => month.b2b_txval) },
                '4C': { text: 'Exports', txval: total(month => month.export_txval) },
                '4D': { text: 'Supplies to SEZ', txval: total(month => month.sez_txval) },
                '4I_4J': { text: 'Credit notes and debit notes (credit notes negative)', txval: total(month => month.notes_txval) },
                '5': { text: 'Nil rated supplies', txval: total(month => month.nil_txval) },
                // Part III: input tax credit
                '6': { text: 'Input tax credit availed (normal purchases and reverse charge)', ...itc },
                '6_rcm': { text: 'of which on reverse charge purchases', ...reverse_charge },
                // Part IV: tax paid
                '9': { text: 'Tax payable as per the monthly returns (output + export IGST + reverse charge - credit)', ...payable },
                '9_output': { text: 'Output tax on outward supplies', ...output },
                '9_zero_rated': { text: 'IGST on exports / SEZ (zero rated, with payment)', iamt: zero_rated.iamt, csamt: zero_rated.csamt },
            },
            warnings: [
                'These are figures to enter in GSTR-9 on the GST portal. No JSON file is made for GSTR-9',
                'Supplies of the previous year reported late, amendments and the HSN summary of inward supplies are not included',
                'Tables 6 to 8 (comparison of the credit with GSTR-2A / 2B) need the portal data: use the GSTR-2B reconciliation for each month',
            ],
        };
    }

    /* ------------------------------------------------------------------ GSTR-4 / CMP-08 */

    /*
     * Composition scheme. Tax = turnover x composition rate (company.composition_rate, for example 1% for traders and manufacturers,
     * 5% for restaurants, 6% for other services), half CGST and half SGST. Quarter 1 is the first three months of the financial year.
     */
    async buildGstr4(dbobj, company, year) {
        if (company.gst_scheme !== 'COMPOSITION') {
            throw new BusinessError('GSTR-4 is for companies under the composition scheme. Choose the scheme in Settings > Company', 'NOT_COMPOSITION');
        }
        let fy = this.getYear(company, year);
        let gstin = GST_RETURN.getGstin(company);
        let rate = Number(company.composition_rate) || 1;

        let sales = await GST_RETURN.loadDocuments(dbobj, company.c_id,
            [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_CREDIT_NOTE, TT.SALES_DEBIT_NOTE], fy.from, fy.to);
        let purchases = await GST_RETURN.loadDocuments(dbobj, company.c_id,
            [TT.PURCHASE_INVOICE, TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE], fy.from, fy.to);

        let quarter_of = (date) => {
            let month_text = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
            return Math.floor(fy.months.indexOf(month_text) / 3);
        };
        let quarters = [0, 1, 2, 3].map(index => ({ quarter: index + 1, turnover: 0, tax: 0, cgst: 0, sgst: 0 }));
        sales.forEach(document => {
            let sign = document.trans_type === TT.SALES_CREDIT_NOTE ? -1 : 1;
            quarters[quarter_of(new Date(document.trans_date))].turnover += document.taxable_amount * sign;
        });
        quarters.forEach(quarter => {
            quarter.turnover = r2(quarter.turnover);
            quarter.tax = r2(quarter.turnover * rate / 100);
            quarter.cgst = r2(quarter.tax / 2);
            quarter.sgst = r2(quarter.tax - quarter.cgst);
        });

        // Inward supplies of the year: from registered, from unregistered, and the ones on reverse charge (tax to pay)
        let inward = { registered: 0, unregistered: 0, reverse_charge_txval: 0, reverse_charge_tax: 0 };
        purchases.forEach(document => {
            let sign = document.trans_type === TT.PURCHASE_INVOICE ? 1 : -1;
            if (document.reverse_charge) {
                inward.reverse_charge_txval += document.taxable_amount * sign;
                inward.reverse_charge_tax += document.tax_summary.reduce((sum, tax_line) => sum + tax_line.tax_value, 0) * sign;
                return;
            }
            let is_registered = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test((document.con_tax_no || '').trim().toUpperCase());
            inward[is_registered ? 'registered' : 'unregistered'] += document.taxable_amount * sign;
        });
        Object.keys(inward).forEach(key => { inward[key] = r2(inward[key]); });

        let turnover = r2(quarters.reduce((sum, quarter) => sum + quarter.turnover, 0));
        let tax = r2(quarters.reduce((sum, quarter) => sum + quarter.tax, 0));
        return {
            fy: fy.label, gstin: gstin, rate: rate, quarters: quarters, inward: inward,
            totals: { turnover: turnover, tax: tax, cgst: r2(quarters.reduce((sum, quarter) => sum + quarter.cgst, 0)), sgst: r2(quarters.reduce((sum, quarter) => sum + quarter.sgst, 0)) },
            warnings: [
                `Tax is calculated at ${rate}% of the turnover of each quarter (set the rate in Settings > Company). Check the rate for your kind of business`,
                'These are figures for CMP-08 (quarterly payment) and GSTR-4 (annual return). No JSON file is made for them',
                'Tax on reverse charge purchases is paid separately in cash and is not part of the composition tax',
            ],
        };
    }
}

module.exports = new GstAnnual();
