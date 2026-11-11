import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getBanks, saveBank, getBankTransactions, saveBankTransaction } from "../services/api";
import { formatBalance, formatMoney, formatDate, toInputDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Modal from "../components/modal";

const EMPTY_BANK = { bank_id: 0, bank_name: "", acc_name: "", acc_number: "", acc_type: "C", branch_name: "", ifsc_code: "", upi_id: "", opening_balance: 0 };

const Banks = () => {
	const [banks, setBanks] = useState([]);
	const [editing, setEditing] = useState(null);
	const [selectedBank, setSelectedBank] = useState(null);
	const [statement, setStatement] = useState({ data: [], unmatched_ledger: [] });
	const [newLine, setNewLine] = useState(null);

	useEffect(() => {
		document.title = "Banking - OutputBooks";
		loadBanks();
	}, []);

	async function loadBanks() {
		const result = await getBanks();
		if (result.status === "S") {
			setBanks(result.data);
		}
	}

	async function openStatement(bank) {
		setSelectedBank(bank);
		const result = await getBankTransactions({ bank_id: bank.bank_id });
		if (result.status === "S") {
			setStatement(result);
		}
	}

	async function handleSaveBank(e) {
		e.preventDefault();
		const result = await saveBank({ ...editing, opening_balance: Number(editing.opening_balance) });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadBanks();
	}

	async function handleSaveLine(e) {
		e.preventDefault();
		const result = await saveBankTransaction({ ...newLine, bank_id: selectedBank.bank_id, debit: Number(newLine.debit), credit: Number(newLine.credit), matched_trans_id: parseInt(newLine.matched_trans_id) || 0 });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setNewLine(null);
		openStatement(selectedBank);
	}

	return (
		<>
			<PageHeader title="Banking">
				<button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_BANK })}><i className="bi bi-plus-lg me-1" />New bank account</button>
			</PageHeader>

			<div className="row g-3 mb-4">
				{banks.map((bank) => (
					<div className="col-md-6 col-xl-4" key={bank.bank_id}>
						<div className={`ob-card ${selectedBank && selectedBank.bank_id === bank.bank_id ? "border-primary" : ""}`}>
							<div className="d-flex justify-content-between">
								<div>
									<div className="fw-bold">{bank.bank_name}</div>
									<div className="text-muted small">{bank.acc_name} - {bank.acc_number}</div>
								</div>
								<div className="text-end">
									<div className="fw-bold">{formatBalance(bank.balance)}</div>
									<div className="text-muted small">Ledger balance</div>
								</div>
							</div>
							<div className="mt-2">
								<button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openStatement(bank)}>Statement</button>
								<button className="btn btn-sm btn-outline-primary" onClick={() => setEditing({ ...bank })}>Edit</button>
							</div>
						</div>
					</div>
				))}
				{banks.length === 0 && <div className="col-12 text-muted">No bank accounts yet</div>}
			</div>

			{selectedBank && (
				<div className="ob-card">
					<div className="d-flex justify-content-between align-items-center mb-2">
						<h6 className="mb-0">Bank statement - {selectedBank.bank_name}</h6>
						<button className="btn btn-sm btn-primary" onClick={() => setNewLine({ btr_date: toInputDate(), description: "", chq_no: "", debit: 0, credit: 0, matched_trans_id: 0 })}>Add statement line</button>
					</div>
					<div className="table-responsive">
						<table className="table table-sm table-ob">
							<thead><tr><th>Date</th><th>Description</th><th>Cheque no</th><th className="text-end-num">Debit</th><th className="text-end-num">Credit</th><th>Reconciled</th></tr></thead>
							<tbody>
								{statement.data.map((line) => (
									<tr key={line.btr_id}>
										<td>{formatDate(line.btr_date)}</td><td>{line.description}</td><td>{line.chq_no}</td>
										<td className="text-end-num">{formatMoney(line.debit)}</td><td className="text-end-num">{formatMoney(line.credit)}</td>
										<td>{line.is_reconciled ? <span className="badge bg-success">Yes</span> : <span className="badge bg-warning text-dark">No</span>}</td>
									</tr>
								))}
								{statement.data.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No statement lines</td></tr>}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{editing && (
				<Modal title={editing.bank_id ? "Edit bank account" : "New bank account"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSaveBank}>
						<div className="row g-3">
							<div className="col-md-6"><label className="form-label">Bank name *</label><input className="form-control" value={editing.bank_name} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })} required /></div>
							<div className="col-md-6"><label className="form-label">Account holder *</label><input className="form-control" value={editing.acc_name} onChange={(e) => setEditing({ ...editing, acc_name: e.target.value })} required /></div>
							<div className="col-md-6"><label className="form-label">Account number</label><input className="form-control" value={editing.acc_number} onChange={(e) => setEditing({ ...editing, acc_number: e.target.value })} /></div>
							<div className="col-md-6">
								<label className="form-label">Account type</label>
								<select className="form-select" value={editing.acc_type} onChange={(e) => setEditing({ ...editing, acc_type: e.target.value })} disabled={!!editing.bank_id}>
									<option value="S">Savings</option><option value="C">Current</option><option value="O">Overdraft</option>
								</select>
							</div>
							<div className="col-md-4"><label className="form-label">Branch</label><input className="form-control" value={editing.branch_name || ""} onChange={(e) => setEditing({ ...editing, branch_name: e.target.value })} /></div>
							<div className="col-md-4"><label className="form-label">IFSC</label><input className="form-control" value={editing.ifsc_code || ""} onChange={(e) => setEditing({ ...editing, ifsc_code: e.target.value })} /></div>
							<div className="col-md-4"><label className="form-label">UPI id</label><input className="form-control" value={editing.upi_id || ""} onChange={(e) => setEditing({ ...editing, upi_id: e.target.value })} /></div>
							<div className="col-md-6"><label className="form-label">Opening balance (Dr +, Cr -)</label><input type="number" step="0.01" className="form-control" value={editing.opening_balance || 0} onChange={(e) => setEditing({ ...editing, opening_balance: e.target.value })} /></div>
						</div>
						<div className="text-end mt-3">
							<button type="button" className="btn btn-light me-2" onClick={() => setEditing(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}

			{newLine && (
				<Modal title="Add statement line" onClose={() => setNewLine(null)} size="md">
					<form onSubmit={handleSaveLine}>
						<div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" value={newLine.btr_date} onChange={(e) => setNewLine({ ...newLine, btr_date: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">Description</label><input className="form-control" value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} /></div>
						<div className="mb-3"><label className="form-label">Cheque no</label><input className="form-control" value={newLine.chq_no} onChange={(e) => setNewLine({ ...newLine, chq_no: e.target.value })} /></div>
						<div className="row g-3 mb-3">
							<div className="col"><label className="form-label">Debit</label><input type="number" step="0.01" min="0" className="form-control" value={newLine.debit} onChange={(e) => setNewLine({ ...newLine, debit: e.target.value })} /></div>
							<div className="col"><label className="form-label">Credit</label><input type="number" step="0.01" min="0" className="form-control" value={newLine.credit} onChange={(e) => setNewLine({ ...newLine, credit: e.target.value })} /></div>
						</div>
						<div className="mb-3">
							<label className="form-label">Match with a ledger entry (reconcile)</label>
							<select className="form-select" value={newLine.matched_trans_id} onChange={(e) => setNewLine({ ...newLine, matched_trans_id: e.target.value })}>
								<option value={0}>Not matched</option>
								{statement.unmatched_ledger.map((entry, index) => (
									<option key={`${entry.trans_id}-${index}`} value={entry.trans_id}>
										{formatDate(entry.trans_date)} - {entry.trans_no} - Dr {formatMoney(entry.debit)} / Cr {formatMoney(entry.credit)}
									</option>
								))}
							</select>
						</div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setNewLine(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
};

export default Banks;
