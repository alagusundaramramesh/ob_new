const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const { BusinessError } = require('../utils/util.error');
const GST_RETURN = require('./class.gst_return');

const TT = CONFIG.TRANS_TYPES;
const r2 = UTILS.round2;

// Amounts that differ by less than this (rupees) are treated as the same
const TOLERANCE = 1;

const HEADS = ['txval', 'iamt', 'camt', 'samt', 'csamt'];

/*
 * Reconciliation of the purchases in the books with the GSTR-2B file downloaded from the GST portal.
 * Nothing is written to the database. The file is read as it is given by the portal (data.docdata.b2b and data.docdata.cdnr).
 */
class Gstr2b {

    /* "INV/0012-A" and "inv0012a" are the same document: upper case, only letters and digits, no leading zeros */
    normalizeNumber(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
    }

    /* The portal sends either the amounts on the document or a list of items with the amounts */
    readAmounts(portal_doc) {
        let amounts = { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
        let parts = Array.isArray(portal_doc.items) && portal_doc.items.length > 0 ? portal_doc.items : [portal_doc];
        parts.forEach(part => {
            amounts.txval += Number(part.txval) || 0;
            amounts.iamt += Number(part.igst) || 0;
            amounts.camt += Number(part.cgst) || 0;
            amounts.samt += Number(part.sgst) || 0;
            amounts.csamt += Number(part.cess) || 0;
        });
        HEADS.forEach(head => { amounts[head] = r2(amounts[head]); });
        return amounts;
    }

    /* The portal file -> a flat list of documents */
    readPortalFile(file) {
        let docdata = file && ((file.data && file.data.docdata) || file.docdata);
        if (!docdata) {
            throw new BusinessError('This is not a GSTR-2B file. Download the JSON from the GST portal (Returns > GSTR-2B > Download)', 'GSTR2B_FILE_INVALID');
        }
        let documents = [];
        (docdata.b2b || []).forEach(supplier => {
            (supplier.inv || []).forEach(invoice => {
                documents.push({
                    ctin: String(supplier.ctin || '').toUpperCase(), supplier: supplier.trdnm || '', kind: 'INV',
                    doc_no: invoice.inum, doc_date: invoice.dt, value: Number(invoice.val) || 0,
                    itc_available: invoice.itcavl !== 'N', reverse_charge: invoice.rev === 'Y', ...this.readAmounts(invoice)
                });
            });
        });
        (docdata.cdnr || []).forEach(supplier => {
            (supplier.nt || []).forEach(note => {
                documents.push({
                    ctin: String(supplier.ctin || '').toUpperCase(), supplier: supplier.trdnm || '', kind: note.typ === 'D' ? 'DN' : 'CN',
                    doc_no: note.ntnum, doc_date: note.dt, value: Number(note.val) || 0,
                    itc_available: note.itcavl !== 'N', reverse_charge: note.rev === 'Y', ...this.readAmounts(note)
                });
            });
        });
        return documents;
    }

    /* Purchase documents of the books in the same shape */
    async readBooks(dbobj, c_id, from, to) {
        let transactions = await GST_RETURN.loadDocuments(dbobj, c_id, [TT.PURCHASE_INVOICE, TT.PURCHASE_CREDIT_NOTE, TT.PURCHASE_DEBIT_NOTE], from, to);
        return transactions.map(transaction => {
            let heads = GST_RETURN.sumHeads(transaction.items.map(item => GST_RETURN.analyseItem(item)));
            // Supplier credit notes and debit notes both reduce the input credit (as in the GSTR-3B), so both match a credit note of the portal
            let kind = transaction.trans_type === TT.PURCHASE_INVOICE ? 'INV' : 'CN';
            return {
                trans_id: transaction.trans_id, trans_no: transaction.trans_no, kind: kind,
                // The number printed on the supplier's document is saved in the reference of the purchase
                doc_no: transaction.ref || transaction.trans_no, doc_date: transaction.trans_date,
                ctin: String(transaction.con_tax_no || '').toUpperCase(), supplier: transaction.con_name,
                value: transaction.tot_amount, ...heads
            };
        });
    }

    /* Differences larger than the tolerance, by head */
    findDifferences(book, portal) {
        let differences = {};
        HEADS.forEach(head => {
            let difference = r2(book[head] - portal[head]);
            if (Math.abs(difference) > TOLERANCE) {
                differences[head] = difference;
            }
        });
        return differences;
    }

    sameAmounts(book, portal) {
        return Object.keys(this.findDifferences(book, portal)).length === 0;
    }

    /* ITC of a list of documents: credit notes reduce it, documents the portal marks "ITC not available" are left out */
    sumItc(documents) {
        let total = { iamt: 0, camt: 0, samt: 0, csamt: 0 };
        documents.filter(document => document.itc_available !== false).forEach(document => {
            let sign = document.kind === 'CN' ? -1 : 1;
            Object.keys(total).forEach(head => { total[head] += document[head] * sign; });
        });
        Object.keys(total).forEach(head => { total[head] = r2(total[head]); });
        total.total = r2(total.iamt + total.camt + total.samt + total.csamt);
        return total;
    }

    /*
     * month: "2026-11". Books from the start of the previous month are read, because an invoice dated last month
     * can appear in this month's GSTR-2B.
     */
    async reconcile(dbobj, company, month, portal_file) {
        let period = GST_RETURN.getPeriod(month);
        let books_from = new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth() - 1, 1));
        let portal_documents = this.readPortalFile(portal_file);
        let book_documents = await this.readBooks(dbobj, company.c_id, books_from, period.to);
        let warnings = [];

        let book_without_gstin = book_documents.filter(document => !document.ctin);
        if (book_without_gstin.length > 0) {
            warnings.push(`${book_without_gstin.length} purchase document(s) have a supplier without a GSTIN. They can not be matched with the portal`);
        }

        let rows = [];
        let used_books = new Set();
        let used_portal = new Set();
        let find = (list, used, document, same_number) => list.findIndex((candidate, index) => !used.has(index)
            && candidate.ctin === document.ctin && candidate.kind === document.kind
            && (same_number ? this.normalizeNumber(candidate.doc_no) === this.normalizeNumber(document.doc_no) : true));

        // 1. Same supplier and same document number
        portal_documents.forEach((portal, portal_index) => {
            let book_index = find(book_documents, used_books, portal, true);
            if (book_index < 0) return;
            let book = book_documents[book_index];
            used_books.add(book_index);
            used_portal.add(portal_index);
            let differences = this.findDifferences(book, portal);
            rows.push({ status: Object.keys(differences).length === 0 ? 'MATCHED' : 'MISMATCH', book, portal, differences });
        });

        // 2. Same supplier and same amounts, but the number is written differently
        portal_documents.forEach((portal, portal_index) => {
            if (used_portal.has(portal_index)) return;
            let book_index = book_documents.findIndex((candidate, index) => !used_books.has(index)
                && candidate.ctin === portal.ctin && candidate.kind === portal.kind && this.sameAmounts(candidate, portal));
            if (book_index < 0) return;
            used_books.add(book_index);
            used_portal.add(portal_index);
            rows.push({ status: 'PROBABLE', book: book_documents[book_index], portal, differences: {} });
        });

        // 3. What is left
        portal_documents.forEach((portal, index) => {
            if (!used_portal.has(index)) rows.push({ status: 'NOT_IN_BOOKS', book: null, portal, differences: {} });
        });
        book_documents.forEach((book, index) => {
            if (!used_books.has(index)) rows.push({ status: 'NOT_IN_PORTAL', book, portal: null, differences: {} });
        });

        let count = status => rows.filter(row => row.status === status).length;
        let matched_books = rows.filter(row => row.book && row.portal).map(row => row.book);
        return {
            period: period.fp,
            gstin: portal_file.data && portal_file.data.gstin ? portal_file.data.gstin : '',
            books_from: books_from,
            summary: {
                matched: count('MATCHED'), mismatch: count('MISMATCH'), probable: count('PROBABLE'),
                not_in_books: count('NOT_IN_BOOKS'), not_in_portal: count('NOT_IN_PORTAL'),
                itc_portal: this.sumItc(portal_documents),
                itc_books: this.sumItc(book_documents),
                itc_matched_books: this.sumItc(matched_books)
            },
            rows: rows,
            warnings: warnings
        };
    }
}

module.exports = new Gstr2b();
