import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { getOpeningBalances, saveOpeningBalances } from "../services/api";
import { formatMoney } from "../utils/format";
import PageHeader from "../components/page_header";

/* Opening balances of all accounts in one place. Debit is positive, credit is negative */
const OpeningBalances = () => {
	const [rows, setRows] = useState([]);
	const [typed, setTyped] = useState({}); // acc_id -> text typed by the user
	const [balanceToEquity, setBalanceToEquity] = useState(true);
	const [search, setSearch] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		document.title = "Opening balances - OutputBooks";
		loadRows();
	}, []);

	async function loadRows() {
		const result = await getOpeningBalances();
		if (result.status !== "S") {
			toast.error(result.message || "Unable to load");
			return;
		}
		setRows(result.data.rows);
		setTyped({});
	}

	const valueOf = (row) => (typed[row.acc_id] !== undefined ? Number(typed[row.acc_id]) || 0 : row.opening_balance);
	const otherRows = rows.filter((row) => !row.is_equity_account);
	const totalDebit = otherRows.reduce((sum, row) => sum + Math.max(valueOf(row), 0), 0);
	const totalCredit = otherRows.reduce((sum, row) => sum - Math.min(valueOf(row), 0), 0);
	const difference = Math.round((totalDebit - totalCredit) * 100) / 100;

	async function handleSave() {
		const balances = Object.keys(typed).map((acc_id) => ({ acc_id: Number(acc_id), opening_balance: Number(typed[acc_id]) || 0 }));
		if (balances.length === 0 && !balanceToEquity) {
			toast.info("Nothing was changed");
			return;
		}
		// With the equity entry on and nothing typed, the equity account is only re-balanced
		const payload = balances.length > 0 ? balances : [{ acc_id: otherRows[0].acc_id, opening_balance: otherRows[0].opening_balance }];
		setSaving(true);
		const result = await saveOpeningBalances({ balances: payload, balance_to_equity: balanceToEquity });
		setSaving(false);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		loadRows();
	}

	const visibleRows = rows.filter((row) => !search || row.name.toLowerCase().includes(search.toLowerCase()));

	return (
		<>
			<PageHeader title="Opening balances" subtitle="Balances at the start of the books. Debit is positive, credit is negative (for example a bank balance 25000, a supplier owed -4000).">
				<Link className="btn btn-light" to="/accounts">Chart of accounts</Link>
				<button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
			</PageHeader>

			<div className="ob-card mb-3">
				<div className="row g-3 align-items-center">
					<div className="col-md-4"><input className="form-control" placeholder="Search account" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
					<div className="col-md-4">
						<div className="form-check">
							<input className="form-check-input" type="checkbox" id="to_equity" checked={balanceToEquity} onChange={(e) => setBalanceToEquity(e.target.checked)} />
							<label className="form-check-label" htmlFor="to_equity">Put the difference in Opening Balance Equity</label>
						</div>
					</div>
					<div className="col-md-4 text-md-end">
						Debit <strong>{formatMoney(totalDebit)}</strong> - Credit <strong>{formatMoney(totalCredit)}</strong> -
						Difference <strong className={difference === 0 ? "text-success" : "text-danger"}>{formatMoney(difference)}</strong>
					</div>
				</div>
			</div>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-ob table-hover mb-0 align-middle">
					<thead><tr><th>Account</th><th>Group</th><th style={{ width: 200 }}>Opening balance</th></tr></thead>
					<tbody>
						{visibleRows.map((row) => (
							<tr key={row.acc_id} className={row.is_equity_account ? "table-light" : ""}>
								<td>{row.name}{row.is_equity_account && <span className="text-muted ms-2 small">(set by the difference)</span>}</td>
								<td>{row.group_code}</td>
								<td>
									<input
										type="number" step="0.01" className="form-control form-control-sm text-end" disabled={row.is_equity_account && balanceToEquity}
										value={typed[row.acc_id] !== undefined ? typed[row.acc_id] : row.opening_balance}
										onChange={(e) => setTyped({ ...typed, [row.acc_id]: e.target.value })}
									/>
								</td>
							</tr>
						))}
						{visibleRows.length === 0 && <tr><td colSpan="3" className="text-center text-muted py-3">No accounts</td></tr>}
					</tbody>
				</table>
			</div>
		</>
	);
};

export default OpeningBalances;
