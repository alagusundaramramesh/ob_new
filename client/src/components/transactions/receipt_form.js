import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getContacts, getTransactions, getTransactionDetails, getPaymentModes, saveTransaction } from "../../services/api";
import { formatMoney, formatDate, toInputDate } from "../../utils/format";
import PageHeader from "../page_header";

/* Receipt from a customer (SP) or payment to a supplier (PP), allocated against the pending invoices / bills */
const ReceiptForm = ({ transType, existing }) => {
	const navigate = useNavigate();
	const isReceipt = transType.side === "S";
	const invoiceTypes = isReceipt ? ["SI", "SD"] : ["PI"];

	const [contacts, setContacts] = useState([]);
	const [payAccounts, setPayAccounts] = useState([]);
	const [pendingInvoices, setPendingInvoices] = useState([]);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		trans_id: existing ? existing.trans_id : 0,
		con_id: existing ? existing.con_id : 0,
		trans_date: toInputDate(existing ? existing.trans_date : null),
		amount: existing ? existing.tot_amount : 0,
		tds_amount: existing ? existing.tds_amount : 0,
		pay_acc_id: existing ? existing.pay_acc_id : 0,
		pay_ref: existing ? existing.pay_ref : "",
		notes: existing ? existing.notes : "",
	});
	// allocation amount typed for each pending invoice { trans_id: amount }
	const [allocations, setAllocations] = useState(() => {
		const initial = {};
		if (existing) {
			existing.allocations.forEach((allocation) => { initial[allocation.trans_id] = allocation.amount; });
		}
		return initial;
	});

	useEffect(() => {
		async function loadMasters() {
			const [contactResult, payResult] = await Promise.all([getContacts({ cs_type: isReceipt ? "C" : "S", limit: 500, is_active: true }), getPaymentModes()]);
			if (contactResult.status === "S") setContacts(contactResult.data);
			if (payResult.status === "S") {
				setPayAccounts(payResult.accounts);
				if (!existing && payResult.accounts.length > 0) {
					setForm((current) => ({ ...current, pay_acc_id: payResult.accounts[0].acc_id }));
				}
			}
		}
		loadMasters();
	}, []);

	// Pending invoices of the selected contact. On edit, the invoice paid by this receipt is included too
	useEffect(() => {
		async function loadPending() {
			if (!form.con_id) {
				setPendingInvoices([]);
				return;
			}
			const results = await Promise.all(invoiceTypes.map((trans_type) => getTransactions({ trans_type, con_id: form.con_id, pending_only: true, limit: 500 })));
			const invoices = results.filter((result) => result.status === "S").flatMap((result) => result.data);

			// An invoice fully paid by this receipt is not "pending" any more, but it must stay in the list
			if (existing && existing.con_id === form.con_id) {
				for (const allocation of existing.allocations) {
					if (invoices.some((invoice) => invoice.trans_id === allocation.trans_id)) {
						continue;
					}
					const detailResult = await getTransactionDetails(allocation.trans_id);
					if (detailResult.status === "S") {
						invoices.push(detailResult.data);
					}
				}
			}
			setPendingInvoices(invoices.sort((a, b) => new Date(a.trans_date) - new Date(b.trans_date)));
		}
		loadPending();
	}, [form.con_id]);

	// When editing, the amount of this receipt is already part of rec_amt, so it is added back
	const getPending = (invoice) => {
		const alreadyAllocated = existing ? (existing.allocations.find((allocation) => allocation.trans_id === invoice.trans_id) || {}).amount || 0 : 0;
		return Math.round((invoice.tot_amount - invoice.rec_amt + alreadyAllocated) * 100) / 100;
	};

	const autoAllocate = () => {
		let remaining = Number(form.amount) || 0;
		const result = {};
		pendingInvoices.forEach((invoice) => {
			const allocated = Math.min(remaining, getPending(invoice));
			if (allocated > 0) {
				result[invoice.trans_id] = allocated;
				remaining = Math.round((remaining - allocated) * 100) / 100;
			}
		});
		setAllocations(result);
	};

	const allocatedTotal = Object.values(allocations).reduce((sum, amount) => sum + (Number(amount) || 0), 0);

	async function handleSave(e) {
		e.preventDefault();
		const payload = {
			trans_id: form.trans_id || undefined,
			trans_type: transType.type,
			con_id: form.con_id,
			trans_date: form.trans_date,
			amount: Number(form.amount),
			tds_amount: Number(form.tds_amount) || 0,
			pay_acc_id: Number(form.pay_acc_id),
			pay_ref: form.pay_ref,
			notes: form.notes,
			allocations: Object.entries(allocations)
				.filter(([trans_id, amount]) => Number(amount) > 0)
				.map(([trans_id, amount]) => ({ trans_id: Number(trans_id), amount: Number(amount) })),
		};
		setSaving(true);
		const result = await saveTransaction(payload);
		setSaving(false);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(`${transType.title} ${result.data.trans_no} saved`);
		navigate(`/t/${transType.key}/${result.data.trans_id}/view`);
	}

	return (
		<form onSubmit={handleSave}>
			<PageHeader title={existing ? `Edit ${transType.title} ${existing.trans_no}` : `New ${transType.title}`}>
				<button type="button" className="btn btn-light" onClick={() => navigate(`/t/${transType.key}`)}>Cancel</button>
				<button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
			</PageHeader>

			<div className="ob-card mb-3">
				<div className="row g-3">
					<div className="col-md-4">
						<label className="form-label">{isReceipt ? "Customer" : "Supplier"} *</label>
						<select className="form-select" value={form.con_id} onChange={(e) => { setAllocations({}); setForm({ ...form, con_id: parseInt(e.target.value) }); }} required disabled={!!existing}>
							<option value={0}>Select</option>
							{contacts.map((contact) => <option key={contact.con_id} value={contact.con_id}>{contact.name}</option>)}
						</select>
					</div>
					<div className="col-md-2"><label className="form-label">Date *</label><input type="date" className="form-control" value={form.trans_date} onChange={(e) => setForm({ ...form, trans_date: e.target.value })} required /></div>
					<div className="col-md-3">
						<label className="form-label">{isReceipt ? "Deposit to" : "Paid from"} *</label>
						<select className="form-select" value={form.pay_acc_id} onChange={(e) => setForm({ ...form, pay_acc_id: e.target.value })} required>
							{payAccounts.map((account) => <option key={account.acc_id} value={account.acc_id}>{account.name}</option>)}
						</select>
					</div>
					<div className="col-md-3"><label className="form-label">Reference (cheque / UPI no)</label><input className="form-control" value={form.pay_ref} onChange={(e) => setForm({ ...form, pay_ref: e.target.value })} /></div>
					<div className="col-md-3"><label className="form-label">Amount *</label><input type="number" step="0.01" min="0.01" className="form-control" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
					{isReceipt && <div className="col-md-3"><label className="form-label">TDS deducted by customer</label><input type="number" step="0.01" min="0" className="form-control" value={form.tds_amount} onChange={(e) => setForm({ ...form, tds_amount: e.target.value })} /></div>}
					<div className="col-md-6"><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
				</div>
			</div>

			<div className="ob-card p-0 table-responsive">
				<div className="d-flex justify-content-between align-items-center p-3 pb-0">
					<h6 className="mb-0">Pending {isReceipt ? "invoices" : "bills"}</h6>
					<button type="button" className="btn btn-sm btn-outline-primary" onClick={autoAllocate} disabled={pendingInvoices.length === 0}>Auto allocate (oldest first)</button>
				</div>
				<table className="table table-ob align-middle mb-0 mt-2">
					<thead><tr><th>Number</th><th>Date</th><th>Due</th><th className="text-end-num">Total</th><th className="text-end-num">Pending</th><th style={{ width: 160 }}>Allocate</th></tr></thead>
					<tbody>
						{pendingInvoices.map((invoice) => (
							<tr key={invoice.trans_id}>
								<td>{invoice.trans_no}</td><td>{formatDate(invoice.trans_date)}</td><td>{formatDate(invoice.due_date)}</td>
								<td className="text-end-num">{formatMoney(invoice.tot_amount)}</td><td className="text-end-num">{formatMoney(getPending(invoice))}</td>
								<td><input type="number" step="0.01" min="0" max={getPending(invoice)} className="form-control form-control-sm" value={allocations[invoice.trans_id] || ""} onChange={(e) => setAllocations({ ...allocations, [invoice.trans_id]: e.target.value })} /></td>
							</tr>
						))}
						{pendingInvoices.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-3">{form.con_id ? "Nothing is pending. The amount is kept as an advance" : "Select a contact"}</td></tr>}
					</tbody>
				</table>
				<div className="p-3 text-end">Allocated {formatMoney(allocatedTotal)} of {formatMoney(form.amount)}</div>
			</div>
		</form>
	);
};

export default ReceiptForm;
