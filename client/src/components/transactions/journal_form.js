import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getAccounts, saveTransaction } from "../../services/api";
import { formatMoney, toInputDate } from "../../utils/format";
import PageHeader from "../page_header";

const EMPTY_LINE = { acc_id: 0, debit: "", credit: "", desc: "" };

/* Journal entry (J) and cash contra (JC): debit total must be equal to credit total */
const JournalForm = ({ transType, existing }) => {
	const navigate = useNavigate();
	const [accounts, setAccounts] = useState([]);
	const [saving, setSaving] = useState(false);
	const [transDate, setTransDate] = useState(toInputDate(existing ? existing.trans_date : null));
	const [notes, setNotes] = useState(existing ? existing.notes : "");
	const [lines, setLines] = useState(existing ? existing.lines.map((line) => ({ ...line, debit: line.debit || "", credit: line.credit || "" })) : [{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

	useEffect(() => {
		async function loadAccounts() {
			// contacts have their own accounts too, so they are included
			const result = await getAccounts({ limit: 500, include_contacts: true });
			if (result.status === "S") {
				setAccounts(result.data);
			}
		}
		loadAccounts();
	}, []);

	const updateLine = (index, changes) => setLines(lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)));
	const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
	const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
	const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

	async function handleSave(e) {
		e.preventDefault();
		if (!isBalanced) {
			toast.error("Total debit and total credit must be equal");
			return;
		}
		setSaving(true);
		const result = await saveTransaction({
			trans_id: existing ? existing.trans_id : undefined,
			trans_type: transType.type,
			trans_date: transDate,
			notes,
			lines: lines.filter((line) => line.acc_id).map((line) => ({ acc_id: Number(line.acc_id), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, desc: line.desc })),
		});
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
					<div className="col-md-3"><label className="form-label">Date *</label><input type="date" className="form-control" value={transDate} onChange={(e) => setTransDate(e.target.value)} required /></div>
					<div className="col-md-9"><label className="form-label">Narration</label><input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
				</div>
			</div>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-ob align-middle mb-0">
					<thead><tr><th style={{ minWidth: 260 }}>Account</th><th style={{ width: 160 }}>Debit</th><th style={{ width: 160 }}>Credit</th><th>Description</th><th style={{ width: 40 }} /></tr></thead>
					<tbody>
						{lines.map((line, index) => (
							<tr key={index}>
								<td>
									<select className="form-select form-select-sm" value={line.acc_id} onChange={(e) => updateLine(index, { acc_id: parseInt(e.target.value) })}>
										<option value={0}>Select account</option>
										{accounts.map((account) => <option key={account.acc_id} value={account.acc_id}>{account.name}</option>)}
									</select>
								</td>
								<td><input type="number" step="0.01" min="0" className="form-control form-control-sm" value={line.debit} onChange={(e) => updateLine(index, { debit: e.target.value, credit: "" })} /></td>
								<td><input type="number" step="0.01" min="0" className="form-control form-control-sm" value={line.credit} onChange={(e) => updateLine(index, { credit: e.target.value, debit: "" })} /></td>
								<td><input className="form-control form-control-sm" value={line.desc} onChange={(e) => updateLine(index, { desc: e.target.value })} /></td>
								<td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setLines(lines.length > 2 ? lines.filter((item, lineIndex) => lineIndex !== index) : lines)}><i className="bi bi-x-lg" /></button></td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="fw-bold">
							<td><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}><i className="bi bi-plus-lg me-1" />Add line</button></td>
							<td className="text-end-num">{formatMoney(totalDebit)}</td>
							<td className="text-end-num">{formatMoney(totalCredit)}</td>
							<td colSpan="2" className={isBalanced ? "text-success" : "text-danger"}>{isBalanced ? "Balanced" : `Difference ${formatMoney(Math.abs(totalDebit - totalCredit))}`}</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</form>
	);
};

export default JournalForm;
