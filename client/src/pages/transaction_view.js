import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getTransactionDetails, getTransactionPdf, emailTransaction, sendReminder } from "../services/api";
import Modal from "../components/modal";
import EinvoicePanel from "../components/transactions/einvoice_panel";
import { formatMoney, formatDate, formatQty } from "../utils/format";
import PageHeader from "../components/page_header";
import transTypes from "../data/trans_types.json";
import { STATES } from "../utils/format";

/* Read only view of a document. The Print button prints this page (the sidebar and buttons are hidden by the print css) */
const TransactionView = () => {
	const { trans_id } = useParams();
	const navigate = useNavigate();
	const [transaction, setTransaction] = useState(null);
	const [errorMessage, setErrorMessage] = useState("");
	const [emailForm, setEmailForm] = useState(null);

	useEffect(() => {
		async function loadTransaction() {
			const result = await getTransactionDetails(parseInt(trans_id));
			if (result.status === "S") {
				setTransaction(result.data);
				document.title = `${result.data.trans_no} - OutputBooks`;
			} else {
				setErrorMessage(result.message || "Unable to load the document");
			}
		}
		loadTransaction();
	}, [trans_id]);

	async function reloadTransaction() {
		const refreshed = await getTransactionDetails(parseInt(trans_id));
		if (refreshed.status === "S") setTransaction(refreshed.data);
	}

	async function downloadPdf() {
		const result = await getTransactionPdf(parseInt(trans_id));
		if (result.status !== "S") {
			toast.error(result.message || "Unable to create the PDF");
			return;
		}
		window.open(URL.createObjectURL(result.blob), "_blank");
	}

	async function remindCustomer() {
		if (!window.confirm("Email a payment reminder with the invoice PDF to the customer now?")) {
			return;
		}
		const result = await sendReminder(parseInt(trans_id), "");
		if (result.status !== "S") {
			toast.error(result.message || "Unable to send the reminder");
			return;
		}
		toast.success(result.message);
		const refreshed = await getTransactionDetails(parseInt(trans_id));
		if (refreshed.status === "S") setTransaction(refreshed.data);
	}

	async function sendEmail(e) {
		e.preventDefault();
		const result = await emailTransaction(parseInt(trans_id), emailForm.to, emailForm.message);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to send the email");
			return;
		}
		toast.success(result.message);
		setEmailForm(null);
	}

	if (errorMessage) {
		return <div className="alert alert-danger">{errorMessage}</div>;
	}
	// The type comes from the stored document, not from the url
	const transType = transaction ? transTypes.find((item) => item.type === transaction.trans_type) : null;
	if (!transaction || !transType) {
		return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
	}

	const company = transaction.company;
	const pendingAmount = Math.round((transaction.tot_amount - transaction.rec_amt) * 100) / 100;

	return (
		<>
			<div className="no-print">
				<PageHeader title={`${transType.title} ${transaction.trans_no}`}>
					<button className="btn btn-light" onClick={() => navigate(`/t/${transType.key}`)}>Back</button>
					<button className="btn btn-outline-primary" onClick={() => navigate(`/t/${transType.key}/${transaction.trans_id}`)}>Edit</button>
					{["SI", "SD"].includes(transaction.trans_type) && pendingAmount > 0 && <button className="btn btn-outline-warning" onClick={remindCustomer}><i className="bi bi-bell me-1" />Send reminder</button>}
					{["SI", "PI"].includes(transaction.trans_type) && <button className="btn btn-outline-secondary" onClick={() => navigate(`/recurring?source=${transaction.trans_id}`)}><i className="bi bi-arrow-repeat me-1" />Make recurring</button>}
					<button className="btn btn-outline-secondary" onClick={() => setEmailForm({ to: (transaction.contact && transaction.contact.email) || "", message: "" })}><i className="bi bi-envelope me-1" />Email</button>
					<button className="btn btn-outline-secondary" onClick={downloadPdf}><i className="bi bi-file-earmark-pdf me-1" />PDF</button>
					<button className="btn btn-primary" onClick={() => window.print()}><i className="bi bi-printer me-1" />Print</button>
				</PageHeader>
			</div>

			<div className="ob-card">
				<div className="d-flex justify-content-between mb-4">
					<div>
						<h5 className="mb-1">{company.name}</h5>
						<div className="text-muted small">{[company.address1, company.address2, company.city, company.zip].filter(Boolean).join(", ")}</div>
						{company.tax_no && <div className="small">GSTIN: {company.tax_no}</div>}
					</div>
					<div className="text-end">
						<h4 className="text-uppercase mb-1">{transType.title}</h4>
						<div>No: <strong>{transaction.trans_no}</strong></div>
						<div>Date: {formatDate(transaction.trans_date)}</div>
						{transaction.due_date && <div>Due: {formatDate(transaction.due_date)}</div>}
						{transaction.ref && <div>Ref: {transaction.ref}</div>}
					</div>
				</div>

				{transType.kind !== "journal" && (
					<div className="mb-4">
						<div className="text-muted small text-uppercase">{transType.side === "S" ? "Bill to" : "Supplier"}</div>
						<div className="fw-bold">{transaction.con_name || "Cash"}</div>
						{transaction.con_tax_no && <div className="small">GSTIN: {transaction.con_tax_no}</div>}
						{transaction.dst_state_code && <div className="small">Place of supply: {(STATES.find((state) => state.code === transaction.dst_state_code) || {}).name || transaction.dst_state_code}</div>}
					</div>
				)}

				{transType.kind === "items" && (
					<>
						<table className="table table-sm table-ob">
							<thead>
								<tr><th>#</th><th>Item</th><th>HSN</th><th className="text-end-num">Qty</th><th className="text-end-num">Rate</th><th className="text-end-num">Disc</th><th className="text-end-num">Taxable</th><th>Tax</th><th className="text-end-num">Amount</th></tr>
							</thead>
							<tbody>
								{transaction.items.map((item, index) => (
									<tr key={index}>
										<td>{index + 1}</td><td>{item.item_name}</td><td>{item.hs}</td>
										<td className="text-end-num">{formatQty(item.qty)} {item.unit}</td>
										<td className="text-end-num">{formatMoney(item.rate)}</td>
										<td className="text-end-num">{item.disc_percentage ? `${item.disc_percentage}%` : ""}</td>
										<td className="text-end-num">{formatMoney(item.taxable_amount)}</td>
										<td className="small">{item.taxes.map((tax) => `${tax.tax_type_code} ${tax.tax_rate}%`).join(", ")}</td>
										<td className="text-end-num">{formatMoney(item.item_total)}</td>
									</tr>
								))}
							</tbody>
						</table>

						<div className="row justify-content-end">
							<div className="col-md-5">
								<div className="d-flex justify-content-between"><span>Taxable amount</span><span>{formatMoney(transaction.taxable_amount)}</span></div>
								{transaction.tax_summary.map((tax) => (
									<div className="d-flex justify-content-between" key={`${tax.tax_type_code}-${tax.tax_rate}`}><span>{tax.tax_type_code} @ {tax.tax_rate}%</span><span>{formatMoney(tax.tax_value)}</span></div>
								))}
								{transaction.round_amount !== 0 && <div className="d-flex justify-content-between"><span>Round off</span><span>{formatMoney(transaction.round_amount)}</span></div>}
								<hr className="my-1" />
								<div className="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span>{formatMoney(transaction.tot_amount)}</span></div>
								{["SI", "SR", "SD", "PI"].includes(transaction.trans_type) && (
									<>
										<div className="d-flex justify-content-between"><span>{transType.side === "S" ? "Received" : "Paid"}</span><span>{formatMoney(transaction.rec_amt)}</span></div>
										<div className="d-flex justify-content-between fw-bold"><span>Balance due</span><span>{formatMoney(pendingAmount)}</span></div>
									</>
								)}
							</div>
						</div>
					</>
				)}

				{transType.kind === "receipt" && (
					<div className="mb-3">
						<div className="fs-5">Amount: <strong>{formatMoney(transaction.tot_amount)}</strong></div>
						{transaction.tds_amount > 0 && <div>TDS deducted: {formatMoney(transaction.tds_amount)}</div>}
						{transaction.pay_ref && <div>Reference: {transaction.pay_ref}</div>}
						{transaction.allocations.length > 0 && <div className="mt-2 text-muted small">Allocated to {transaction.allocations.length} document(s)</div>}
					</div>
				)}

				{transaction.notes && <div className="mt-3"><div className="text-muted small text-uppercase">Notes</div>{transaction.notes}</div>}
			</div>

			<EinvoicePanel transaction={transaction} onChanged={reloadTransaction} />

			<div className="ob-card mt-3 no-print">
				<h6>Accounting entries</h6>
				{transaction.ledger_entries.length === 0 ? (
					<div className="text-muted">This document does not create accounting entries.</div>
				) : (
					<table className="table table-sm table-ob mb-0">
						<thead><tr><th>Account</th><th>Description</th><th className="text-end-num">Debit</th><th className="text-end-num">Credit</th></tr></thead>
						<tbody>
							{transaction.ledger_entries.map((entry, index) => (
								<tr key={index}><td>{entry.acc_name}</td><td>{entry.desc}</td><td className="text-end-num">{entry.debit ? formatMoney(entry.debit) : ""}</td><td className="text-end-num">{entry.credit ? formatMoney(entry.credit) : ""}</td></tr>
							))}
						</tbody>
					</table>
				)}
				{transaction.reminders && transaction.reminders.length > 0 && (
					<div className="mt-3 small">
						<strong>Reminders:</strong>{" "}
						{transaction.reminders.map((reminder) => (
							<span key={reminder.reminder_id} className={`me-3 ${reminder.status === "sent" ? "" : "text-danger"}`}>
								{new Date(reminder.sent_on).toLocaleDateString()} {reminder.kind} to {reminder.sent_to}{reminder.status === "sent" ? "" : " (failed)"}
							</span>
						))}
					</div>
				)}
				{transaction.linked_transactions.length > 0 && (
					<div className="mt-3 small">
						Linked documents:{" "}
						{transaction.linked_transactions.map((linked) => {
							const linkedType = transTypes.find((item) => item.type === linked.trans_type);
							return <Link key={linked.trans_id} className="me-2" to={`/t/${linkedType.key}/${linked.trans_id}/view`}>{linked.trans_no}</Link>;
						})}
					</div>
				)}
			</div>
			{emailForm && (
				<Modal title={`Email ${transaction.trans_no}`} onClose={() => setEmailForm(null)} size="md">
					<form onSubmit={sendEmail}>
						<div className="mb-3"><label className="form-label">To *</label><input type="email" className="form-control" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">Message</label><textarea className="form-control" rows="3" value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} /></div>
						<div className="form-text mb-3">The PDF of the document is attached.</div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setEmailForm(null)}>Cancel</button>
							<button className="btn btn-primary">Send</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
};

export default TransactionView;
