import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { getAccounts, getAccountGroups, saveAccount, deleteAccount } from "../services/api";
import { formatBalance } from "../utils/format";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";
import Modal from "../components/modal";

const Accounts = () => {
	const [accounts, setAccounts] = useState([]);
	const [groups, setGroups] = useState([]);
	const [groupCode, setGroupCode] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [editing, setEditing] = useState(null);
	const limit = 50;

	useEffect(() => {
		document.title = "Chart of Accounts - OutputBooks";
		async function loadGroups() {
			const result = await getAccountGroups();
			if (result.status === "S") setGroups(result.data);
		}
		loadGroups();
	}, []);

	useEffect(() => {
		loadAccounts();
	}, [page, groupCode]);

	async function loadAccounts(searchText = search) {
		const result = await getAccounts({ group_code: groupCode, search: searchText, page, limit });
		if (result.status === "S") {
			setAccounts(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadAccounts(search);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveAccount({ ...editing, opening_balance: Number(editing.opening_balance) });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadAccounts();
	}

	async function handleDelete(account) {
		if (!window.confirm(`Delete ${account.name}?`)) {
			return;
		}
		const result = await deleteAccount(account.acc_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadAccounts();
	}

	// Customer and supplier accounts are managed from the contact screens
	const editableGroups = groups.filter((group) => group.group_code !== "SD" && group.group_code !== "SC");
	const getGroupName = (code) => (groups.find((group) => group.group_code === code) || {}).name || code;

	return (
		<>
			<PageHeader title="Chart of Accounts" subtitle="Customers and suppliers have their own accounts, managed from the Customers and Suppliers screens">
				<select className="form-select" style={{ width: 220 }} value={groupCode} onChange={(e) => { setPage(1); setGroupCode(e.target.value); }}>
					<option value="">All groups</option>
					{groups.map((group) => <option key={group.group_code} value={group.group_code}>{group.name}</option>)}
				</select>
				<form className="d-flex gap-2" onSubmit={handleSearch}>
					<input className="form-control" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
					<button className="btn btn-outline-secondary">Search</button>
				</form>
				<button className="btn btn-primary" onClick={() => setEditing({ acc_id: 0, name: "", group_code: "EI", descr: "", opening_balance: 0 })}><i className="bi bi-plus-lg me-1" />New account</button>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0">
					<thead><tr><th>Account</th><th>Group</th><th className="text-end-num">Balance</th><th /></tr></thead>
					<tbody>
						{accounts.map((account) => (
							<tr key={account.acc_id}>
								<td>{account.name}{account.is_system && <span className="badge bg-light text-dark ms-2">System</span>}</td>
								<td>{getGroupName(account.group_code)}</td>
								<td className="text-end-num">{formatBalance(account.balance)}</td>
								<td className="text-end text-nowrap">
									<Link className="btn btn-sm btn-outline-secondary me-1" to={`/reports/ledger?acc_id=${account.acc_id}`}>Ledger</Link>
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...account })}>Edit</button>
									{!account.is_system && <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(account)}>Delete</button>}
								</td>
							</tr>
						))}
						{accounts.length === 0 && <tr><td colSpan="4" className="text-center text-muted py-4">No accounts found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />

			{editing && (
				<Modal title={editing.acc_id ? "Edit account" : "New account"} onClose={() => setEditing(null)} size="md">
					<form onSubmit={handleSave}>
						<div className="mb-3"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
						<div className="mb-3">
							<label className="form-label">Group *</label>
							<select className="form-select" value={editing.group_code} onChange={(e) => setEditing({ ...editing, group_code: e.target.value })} disabled={editing.is_system}>
								{editableGroups.map((group) => <option key={group.group_code} value={group.group_code}>{group.name}</option>)}
								{editing.is_system && <option value={editing.group_code}>{getGroupName(editing.group_code)}</option>}
							</select>
						</div>
						<div className="mb-3"><label className="form-label">Opening balance (Dr +, Cr -)</label><input type="number" step="0.01" className="form-control" value={editing.opening_balance || 0} onChange={(e) => setEditing({ ...editing, opening_balance: e.target.value })} /></div>
						<div className="mb-3"><label className="form-label">Description</label><input className="form-control" value={editing.descr || ""} onChange={(e) => setEditing({ ...editing, descr: e.target.value })} /></div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setEditing(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
};

export default Accounts;
