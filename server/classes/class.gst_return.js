const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const { BusinessError } = require('../utils/util.error');

const TT = CONFIG.TRANS_TYPES;

// Unregistered inter-state invoices above this value go to the B2CL table (Rs. 2.5 lakh)
const B2CL_LIMIT = 250000;

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Unit of the item master -> unit quantity code of the GST portal (anything else is OTH)
const UQC_MAP = {
    NOS: 'NOS', NO: 'NOS', PCS: 'PCS', PC: 'PCS', KGS: 'KGS', KG: 'KGS', GMS: 'GMS', GM: 'GMS', LTR: 'LTR', L: 'LTR', MTR: 'MTR', M: 'MTR',
    BOX: 'BOX', PAC: 'PAC', PKT: 'PAC', SET: 'SET', DOZ: 'DOZ', BAG: 'BAG', UNT: 'UNT', UNIT: 'UNT', BTL: 'BTL', CTN: 'CTN', PAIR: 'PRS', PRS: 'PRS'
};

const r2 = UTILS.round2;

/*
 * GSTR-1 and GSTR-3B of a month, built from the documents of the month.
 * The JSON follows the structure of the GST portal offline tool; import it there (or upload it) and check the
 * tables before filing, because the portal rules change from time to time.
 */
class GstReturn {

    /* '2026-11' -> { from, to, fp: '112026' } */
    getPeriod(month) {
        let match = /^(\d{4})-(\d{2})$/.exec(month || '');
        if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
            throw new BusinessError('Choose a month', 'MONTH_REQUIRED');
        }
        let year = Number(match[1]);
        let month_number = Number(match[2]);
        return {
            from: new Date(Date.UTC(year, month_number - 1, 1)),
            to: new Date(Date.UTC(year, month_number, 0)),
            fp: `${match[2]}${year}`
        };
    }

    /* A company under the composition scheme files CMP-08 / GSTR-4, not GSTR-1 and GSTR-3B */
    checkRegularScheme(company) {
        if (company.gst_scheme === 'COMPOSITION') {
            throw new BusinessError('This company is under the composition scheme. Use the GSTR-4 report instead of GSTR-1 and GSTR-3B', 'COMPOSITION_SCHEME');
        }
    }

    getGstin(company) {
        let gstin = (company.tax_no || '').trim().toUpperCase();
        if (!GSTIN_PATTERN.test(gstin)) {
            throw new BusinessError('Enter a valid 15 character GSTIN of the company in Settings > Company', 'GSTIN_REQUIRED');
        }
        return gstin;
    }

    dateText(value) {
        let date = new Date(value);
        return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
    }

    /* Place of supply as a 2 digit state code */
    getPos(transaction, company_state) {
        return String(transaction.dst_state_code || company_state).padStart(2, '0').slice(-2);
    }

    /* Tax amounts of one item line by head, and the GST rate (CGST + SGST, or IGST; cess is not part of the rate) */
    analyseItem(item) {
        let amounts = { iamt: 0, camt: 0, samt: 0, csamt: 0, rt: 0 };
        for (const tax of item.taxes || []) {
            if (tax.tax_type_code === 'IGST') amounts.iamt += tax.tax_value;
            else if (tax.tax_type_code === 'CGST') amounts.camt += tax.tax_value;
            else if (tax.tax_type_code === 'SGST' || tax.tax_type_code === 'UTGST') amounts.samt += tax.tax_value;
            else if (tax.tax_type_code === 'CESS') amounts.csamt += tax.tax_value;
            if (tax.tax_type_code !== 'CESS') amounts.rt += tax.tax_rate;
        }
        return {
            ...amounts, txval: item.taxable_amount, hs: item.hs, unit: item.unit, qty: item.qty,
            item_type: item.item_type, name: item.item_name, value: item.item_total
        };
    }

    /* Adds up the tax heads of a list of analysed items */
    sumHeads(rows) {
        return {
            txval: r2(rows.reduce((sum, row) => sum + row.txval, 0)),
            iamt: r2(rows.reduce((sum, row) => sum + row.iamt, 0)),
            camt: r2(rows.reduce((sum, row) => sum + row.camt, 0)),
            samt: r2(rows.reduce((sum, row) => sum + row.samt, 0)),
            csamt: r2(rows.reduce((sum, row) => sum + row.csamt, 0))
        };
    }

    /* "itms" of an invoice / note: the taxed items grouped by rate (include_zero: exports and SEZ also report items with rate 0) */
    buildItms(rows, include_zero) {
        let by_rate = {};
        rows.filter(row => row.rt > 0 || include_zero).forEach(row => {
            by_rate[row.rt] = by_rate[row.rt] || [];
            by_rate[row.rt].push(row);
        });
        return Object.keys(by_rate).map(Number).sort((a, b) => a - b).map((rate, index) => ({
            num: index + 1,
            itm_det: { rt: rate, ...this.sumHeads(by_rate[rate]) }
        }));
    }

    async loadDocuments(dbobj, c_id, trans_types, from, to) {
        return dbobj.collection('ob_transactions').find(
            { c_id: c_id, stat: CONFIG.STAT_ACTIVE, trans_type: { $in: trans_types }, trans_date: { $gte: from, $lte: to } },
            { projection: { _id: 0 } }).sort({ trans_date: 1, trans_id: 1 }).toArray();
    }

    /*
     * Table 13, documents issued during the period: for every kind of document and number series the first and last number,
     * how many exist and how many were cancelled (deleted). Counted from the saved documents, so a number that was never saved is not a gap here.
     */
    async buildDocIssue(dbobj, c_id, from, to) {
        const NATURES = [
            { doc_num: 1, types: [TT.SALES_INVOICE, TT.SALES_RETAIL] },
            { doc_num: 4, types: [TT.SALES_DEBIT_NOTE] },
            { doc_num: 5, types: [TT.SALES_CREDIT_NOTE] },
        ];
        let documents = await dbobj.collection('ob_transactions').find(
            { c_id: c_id, trans_type: { $in: NATURES.flatMap(nature => nature.types) }, stat: { $in: [CONFIG.STAT_ACTIVE, CONFIG.STAT_DELETED] }, trans_date: { $gte: from, $lte: to } },
            { projection: { _id: 0, trans_id: 1, trans_no: 1, trans_type: 1, series_id: 1, stat: 1 } }).sort({ trans_id: 1 }).toArray();

        let doc_det = [];
        for (const nature of NATURES) {
            let by_series = {};
            documents.filter(document => nature.types.includes(document.trans_type)).forEach(document => {
                by_series[document.series_id] = by_series[document.series_id] || [];
                by_series[document.series_id].push(document);
            });
            let docs = Object.values(by_series).map((series_documents, index) => {
                let cancelled = series_documents.filter(document => document.stat === CONFIG.STAT_DELETED).length;
                return {
                    num: index + 1, from: series_documents[0].trans_no, to: series_documents[series_documents.length - 1].trans_no,
                    totnum: series_documents.length, cancel: cancelled, net_issue: series_documents.length - cancelled
                };
            });
            if (docs.length > 0) {
                doc_det.push({ doc_num: nature.doc_num, docs: docs });
            }
        }
        return doc_det;
    }

    /* ------------------------------------------------------------------ GSTR-1 */

    async buildGstr1(dbobj, company, month) {
        this.checkRegularScheme(company);
        let period = this.getPeriod(month);
        let gstin = this.getGstin(company);
        let company_state = gstin.slice(0, 2);
        let documents = await this.loadDocuments(dbobj, company.c_id,
            [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_CREDIT_NOTE, TT.SALES_DEBIT_NOTE], period.from, period.to);

        let warnings = [];
        let b2b = {}, b2cl = {}, b2cs = {}, cdnr = {}, cdnur = [], nil = {}, hsn = {}, exp = {};
        let counts = { b2b: 0, b2cl: 0, b2cs_documents: 0, cdnr: 0, cdnur: 0, exp: 0, sez: 0 };
        let section_txval = { b2b: 0, b2cl: 0, b2cs: 0, notes: 0, exp: 0, sez: 0 }; // taxable value per table, credit notes negative
        let tax_rows = [];                                           // every taxed row with the sign applied, for the tax totals

        for (const document of documents) {
            let is_note = document.trans_type === TT.SALES_CREDIT_NOTE || document.trans_type === TT.SALES_DEBIT_NOTE;
            let is_credit = document.trans_type === TT.SALES_CREDIT_NOTE;
            let sign = is_credit ? -1 : 1;
            let rows = document.items.map(item => this.analyseItem(item));
            let pos = this.getPos(document, company_state);
            let is_inter = pos !== company_state;

            // A buyer GSTIN that is not valid is treated as unregistered, and the user is told
            let buyer_gstin = (document.con_tax_no || '').trim().toUpperCase();
            let is_registered = GSTIN_PATTERN.test(buyer_gstin);
            let is_export = document.gst_treatment === 'EXPORT';
            let is_sez = document.gst_treatment === 'SEZ' && is_registered;
            if (document.gst_treatment === 'SEZ' && !is_registered) {
                warnings.push(`${document.trans_no}: the customer ${document.con_name} is marked as SEZ but has no valid GSTIN, so the document is reported as a normal sale`);
            }
            // Invoice type of the portal: SEWP / SEWOP for an SEZ (with / without payment of tax), R for the rest
            let inv_typ = is_sez ? (document.zero_rated ? 'SEWOP' : 'SEWP') : 'R';
            if (buyer_gstin && !is_registered) {
                warnings.push(`${document.trans_no}: the GSTIN "${document.con_tax_no}" of ${document.con_name} is not valid, so it is reported as an unregistered buyer`);
            }
            rows.forEach(row => {
                if (row.rt > 0 && !row.hs) {
                    warnings.push(`${document.trans_no}: item "${row.name}" has no HSN / SAC code`);
                }
            });
            if (document.items.some(item => item.taxes.length === 0 && item.tax_id)) {
                warnings.push(`${document.trans_no}: a tax is set but has no rate for this place of supply`);
            }

            // Nil rated supplies (rate 0) go to the nil table
            let supply_type = `${is_inter ? 'INTER' : 'INTRA'}${is_registered ? 'B2B' : 'B2C'}`;
            let nil_value = r2(rows.filter(row => row.rt === 0).reduce((sum, row) => sum + row.txval, 0));
            if (nil_value && !is_export && !is_sez) {
                nil[supply_type] = r2((nil[supply_type] || 0) + nil_value * sign);
            }

            // HSN summary (credit notes reduce it)
            rows.filter(row => row.hs).forEach(row => {
                let is_service = row.item_type === 'S';
                let uqc = is_service ? 'NA' : (UQC_MAP[String(row.unit || '').toUpperCase()] || 'OTH');
                let key = `${row.hs}|${uqc}|${row.rt}`;
                hsn[key] = hsn[key] || { hsn_sc: row.hs, desc: row.name.slice(0, 30), uqc, rt: row.rt, qty: 0, val: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
                let entry = hsn[key];
                entry.qty += (is_service ? 0 : row.qty) * sign;
                entry.val += row.value * sign;
                ['txval', 'iamt', 'camt', 'samt', 'csamt'].forEach(head => { entry[head] += row[head] * sign; });
            });

            // Exports and SEZ also report the items with rate 0
            let reports_zero_rate = is_export || is_sez;
            let itms = this.buildItms(rows, reports_zero_rate);
            if (itms.length === 0) {
                continue; // everything on the document is nil rated
            }
            let taxed_rows = rows.filter(row => row.rt > 0 || reports_zero_rate).map(row => this.signed(row, sign));
            tax_rows.push(...taxed_rows);
            let taxed_txval = r2(taxed_rows.reduce((sum, row) => sum + row.txval, 0));

            // Exports: table 6A (invoices) and the unregistered notes table (notes)
            if (is_export) {
                let export_type = document.zero_rated ? 'WOPAY' : 'WPAY';
                let export_items = itms.map(itm => ({ num: itm.num, itm_det: { rt: itm.itm_det.rt, txval: itm.itm_det.txval, iamt: itm.itm_det.iamt, csamt: itm.itm_det.csamt } }));
                if (is_note) {
                    cdnur.push({
                        typ: document.zero_rated ? 'EXPWOP' : 'EXPWP', ntty: is_credit ? 'C' : 'D', nt_num: document.trans_no,
                        nt_dt: this.dateText(document.trans_date), val: document.tot_amount, pos: '96', itms: export_items
                    });
                    counts.cdnur++;
                    section_txval.notes = r2(section_txval.notes + taxed_txval);
                } else {
                    exp[export_type] = exp[export_type] || [];
                    exp[export_type].push({
                        inum: document.trans_no, idt: this.dateText(document.trans_date), val: document.tot_amount,
                        sbpcode: '', sbnum: '', sbdt: '', itms: export_items
                    });
                    counts.exp++;
                    section_txval.exp = r2(section_txval.exp + taxed_txval);
                }
                continue;
            }
            if (is_sez) {
                counts.sez++;
                section_txval.sez = r2(section_txval.sez + taxed_txval);
            }

            if (is_note) {
                let note = {
                    ntty: is_credit ? 'C' : 'D', nt_num: document.trans_no, nt_dt: this.dateText(document.trans_date),
                    val: document.tot_amount, pos: pos, rchrg: 'N', inv_typ: inv_typ, itms: itms
                };
                if (is_registered) {
                    cdnr[buyer_gstin] = cdnr[buyer_gstin] || [];
                    cdnr[buyer_gstin].push(note);
                    counts.cdnr++;
                    section_txval.notes = r2(section_txval.notes + taxed_txval);
                    continue;
                }
                if (is_inter && document.tot_amount > B2CL_LIMIT) {
                    let { inv_typ, rchrg, ...unregistered_note } = note;
                    cdnur.push({ typ: 'B2CL', ...unregistered_note });
                    counts.cdnur++;
                    section_txval.notes = r2(section_txval.notes + taxed_txval);
                    continue;
                }
                // other unregistered notes adjust the B2C small table below
            } else if (is_registered) {
                b2b[buyer_gstin] = b2b[buyer_gstin] || [];
                b2b[buyer_gstin].push({ inum: document.trans_no, idt: this.dateText(document.trans_date), val: document.tot_amount, pos, rchrg: 'N', inv_typ: inv_typ, itms });
                counts.b2b++;
                section_txval.b2b = r2(section_txval.b2b + taxed_txval);
                continue;
            } else if (is_inter && document.tot_amount > B2CL_LIMIT) {
                b2cl[pos] = b2cl[pos] || [];
                b2cl[pos].push({
                    inum: document.trans_no, idt: this.dateText(document.trans_date), val: document.tot_amount,
                    itms: itms.map(itm => ({ num: itm.num, itm_det: { rt: itm.itm_det.rt, txval: itm.itm_det.txval, iamt: itm.itm_det.iamt, csamt: itm.itm_det.csamt } }))
                });
                counts.b2cl++;
                section_txval.b2cl = r2(section_txval.b2cl + taxed_txval);
                continue;
            }

            // B2C small: totals by place of supply and rate (credit notes are subtracted)
            counts.b2cs_documents++;
            section_txval.b2cs = r2(section_txval.b2cs + taxed_txval);
            itms.forEach(itm => {
                let key = `${pos}|${itm.itm_det.rt}`;
                b2cs[key] = b2cs[key] || { sply_ty: is_inter ? 'INTER' : 'INTRA', rt: itm.itm_det.rt, typ: 'OE', pos, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
                ['txval', 'iamt', 'camt', 'samt', 'csamt'].forEach(head => { b2cs[key][head] += itm.itm_det[head] * sign; });
            });
        }

        // Output: only the heads that belong to the supply type
        let clean_b2cs = Object.values(b2cs).map(row => {
            let entry = { sply_ty: row.sply_ty, rt: row.rt, typ: row.typ, pos: row.pos, txval: r2(row.txval) };
            if (row.sply_ty === 'INTER') entry.iamt = r2(row.iamt);
            else { entry.camt = r2(row.camt); entry.samt = r2(row.samt); }
            entry.csamt = r2(row.csamt);
            return entry;
        });
        let hsn_rows = Object.values(hsn).map((row, index) => ({
            num: index + 1, hsn_sc: row.hsn_sc, desc: row.desc, uqc: row.uqc, qty: r2(row.qty), rt: row.rt, val: r2(row.val),
            txval: r2(row.txval), iamt: r2(row.iamt), camt: r2(row.camt), samt: r2(row.samt), csamt: r2(row.csamt)
        }));

        let json = {
            gstin: gstin, fp: period.fp, gt: 0, cur_gt: 0,
            b2b: Object.keys(b2b).map(ctin => ({ ctin, inv: b2b[ctin] })),
            b2cl: Object.keys(b2cl).map(pos => ({ pos, inv: b2cl[pos] })),
            b2cs: clean_b2cs,
            cdnr: Object.keys(cdnr).map(ctin => ({ ctin, nt: cdnr[ctin] })),
            cdnur: cdnur,
            exp: Object.keys(exp).map(ex_tp => ({ exp_typ: ex_tp, inv: exp[ex_tp] })),
            doc_issue: { doc_det: await this.buildDocIssue(dbobj, company.c_id, period.from, period.to) },
            nil: { inv:Object.keys(nil).filter(type => nil[type]).map(sply_ty => ({ sply_ty, expt_amt: 0, nil_amt: nil[sply_ty], ngsup_amt: 0 })) },
            hsn: { data: hsn_rows }
        };

        // Totals for the screen (the document tables are not read again)
        let tax_total = this.sumHeads(tax_rows);
        let summary = {
            documents: documents.length,
            b2b: { count: counts.b2b, txval: section_txval.b2b },
            b2cl: { count: counts.b2cl, txval: section_txval.b2cl },
            b2cs: { documents: counts.b2cs_documents, txval: section_txval.b2cs },
            cdnr: { count: counts.cdnr },
            cdnur: { count: counts.cdnur },
            exp: { count: counts.exp, txval: section_txval.exp },
            sez: { count: counts.sez, txval: section_txval.sez },
            doc_issue: { series: json.doc_issue.doc_det.reduce((sum, nature) => sum + nature.docs.length, 0) },
            notes_txval: section_txval.notes,
            nil: { amount: r2(Object.values(nil).reduce((sum, value) => sum + value, 0)) },
            hsn_lines: hsn_rows.length
        };
        json.cur_gt = r2(tax_total.txval + summary.nil.amount);
        warnings.push('"gt" (aggregate turnover of the previous financial year) is 0: fill it in the GST offline tool. "cur_gt" is the taxable turnover of this month');

        return { period: period.fp, gstin, json, summary: { ...summary, tax: tax_total }, warnings: [...new Set(warnings)] };
    }

    /* ------------------------------------------------------------------ GSTR-3B */

    async buildGstr3b(dbobj, company, month) {
        this.checkRegularScheme(company);
        let period = this.getPeriod(month);
        let gstin = this.getGstin(company);
        let company_state = gstin.slice(0, 2);
        let outward = await this.loadDocuments(dbobj, company.c_id,
            [TT.SALES_INVOICE, TT.SALES_RETAIL, TT.SALES_CREDIT_NOTE, TT.SALES_DEBIT_NOTE], period.from, period.to);
        let inward = await this.loadDocuments(dbobj, company.c_id,
            [TT.PURCHASE_INVOICE, TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE], period.from, period.to);

        let taxed_rows = [];      // outward rows with a rate, with the sign applied
        let nil_rows = [];        // outward rate 0
        let zero_rated_rows = []; // exports and supplies to an SEZ (3.1 b), with or without payment of tax
        let unregistered_inter = {};
        for (const document of outward) {
            let sign = document.trans_type === TT.SALES_CREDIT_NOTE ? -1 : 1;
            let pos = this.getPos(document, company_state);
            let is_registered = GSTIN_PATTERN.test((document.con_tax_no || '').trim().toUpperCase());
            let is_zero_rated_supply = document.gst_treatment === 'EXPORT' || document.gst_treatment === 'SEZ';
            for (const item of document.items) {
                let row = this.signed(this.analyseItem(item), sign);
                if (is_zero_rated_supply) {
                    zero_rated_rows.push(row);
                    continue;
                }
                if (row.rt === 0) {
                    nil_rows.push(row);
                    continue;
                }
                taxed_rows.push(row);
                if (!is_registered && pos !== company_state) {
                    unregistered_inter[pos] = unregistered_inter[pos] || { pos, txval: 0, iamt: 0 };
                    unregistered_inter[pos].txval = r2(unregistered_inter[pos].txval + row.txval);
                    unregistered_inter[pos].iamt = r2(unregistered_inter[pos].iamt + row.iamt);
                }
            }
        }

        let itc_rows = [];
        let reverse_charge_rows = []; // purchases on reverse charge: tax to pay (3.1 d) and credit (4 A 3)
        let inward_nil = { inter: 0, intra: 0 };
        for (const document of inward) {
            let sign = document.trans_type === TT.PURCHASE_INVOICE ? 1 : -1;
            let is_inter = this.getPos(document, company_state) !== company_state;
            for (const item of document.items) {
                let row = this.signed(this.analyseItem(item), sign);
                if (row.rt === 0) {
                    inward_nil[is_inter ? 'inter' : 'intra'] = r2(inward_nil[is_inter ? 'inter' : 'intra'] + row.txval);
                } else if (document.reverse_charge) {
                    reverse_charge_rows.push(row);
                } else {
                    itc_rows.push(row);
                }
            }
        }

        let output = this.sumHeads(taxed_rows);
        let itc = this.sumHeads(itc_rows);
        let reverse_charge = this.sumHeads(reverse_charge_rows);
        let zero_rated = this.sumHeads(zero_rated_rows);
        let itc_total = {}; // credit of normal purchases + credit of the reverse charge tax
        ['iamt', 'camt', 'samt', 'csamt'].forEach(head => { itc_total[head] = r2(itc[head] + reverse_charge[head]); });
        let zero_line = { ty: '', iamt: 0, camt: 0, samt: 0, csamt: 0 };
        let json = {
            gstin: gstin, ret_period: period.fp,
            sup_details: {
                osup_det: output,
                osup_zero: { txval: zero_rated.txval, iamt: zero_rated.iamt, csamt: zero_rated.csamt },
                osup_nil_exmp: { txval: r2(nil_rows.reduce((sum, row) => sum + row.txval, 0)) },
                isup_rev: reverse_charge,
                osup_nongst: { txval: 0 }
            },
            inter_sup: { unreg_details: Object.values(unregistered_inter), comp_details: [], uin_details: [] },
            itc_elg: {
                itc_avl: ['IMPG', 'IMPS', 'ISD'].map(ty => ({ ...zero_line, ty }))
                    .concat([{ ty: 'ISRC', iamt: reverse_charge.iamt, camt: reverse_charge.camt, samt: reverse_charge.samt, csamt: reverse_charge.csamt }])
                    .concat([{ ty: 'OTH', iamt: itc.iamt, camt: itc.camt, samt: itc.samt, csamt: itc.csamt }]),
                itc_rev: ['RUL', 'OTH'].map(ty => ({ ...zero_line, ty })),
                itc_net: itc_total,
                itc_inelg: ['RUL', 'OTH'].map(ty => ({ ...zero_line, ty }))
            },
            inward_sup: { isup_details: [{ ty: 'GST', inter: inward_nil.inter, intra: inward_nil.intra }, { ty: 'NONGST', inter: 0, intra: 0 }] },
            intr_ltfee: {}
        };

        // Net tax to pay per head (output tax + export IGST + reverse charge tax - input tax credit). The set-off order of the portal is not applied
        let payable = {};
        ['iamt', 'camt', 'samt', 'csamt'].forEach(head => {
            payable[head] = r2(output[head] + (zero_rated[head] || 0) + reverse_charge[head] - itc_total[head]);
        });
        let warnings = ['Tax payable below is output tax minus input credit per head. The portal applies its own set-off order (IGST credit first) when you file'];
        if (reverse_charge.iamt + reverse_charge.camt + reverse_charge.samt + reverse_charge.csamt > 0) {
            warnings.push('Tax on reverse charge purchases must be paid in cash (not from the credit ledger); the credit for it is taken after the payment');
        }
        if (output.iamt === 0 && output.camt === 0 && output.samt === 0 && nil_rows.length === 0 && itc_rows.length === 0 && zero_rated_rows.length === 0 && reverse_charge_rows.length === 0) {
            warnings.push('There are no sales or purchases with tax in this month');
        }
        return {
            period: period.fp, gstin, json,
            summary: { output, itc: itc_total, payable, zero_rated, reverse_charge, nil_outward: json.sup_details.osup_nil_exmp.txval, inward_nil },
            warnings
        };
    }

    signed(row, sign) {
        return { ...row, txval: row.txval * sign, iamt: row.iamt * sign, camt: row.camt * sign, samt: row.samt * sign, csamt: row.csamt * sign };
    }
}

module.exports = new GstReturn();
