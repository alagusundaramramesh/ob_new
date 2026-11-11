import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getTransactions, deleteTransaction, convertTransaction } from "../services/api";
import { formatMoney, formatDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";
import transTypes from "../data/trans_types.json";

const STATUS_BADGES = {
	S: { label: "Open", className: "bg-primary" },
	P: { label: "Paid", className: "bg-success" },
	O: { label: "Overdue", className: "bg-danger" },
};

/* List of one transaction type. The type comes from the url: /t/sales-invoice */
const Transactions = () => {
	const { type_key } = useParams();
	const navigate = useNavigate();
	const transType = transTypes.find((item) => item.key === type_key);

	const [transactions, setTransactions] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [filters, setFilters] = useState({ search: "", from_date: "", to_date: "" });
	const limit = 20;

	useEffect(() => {
		setPage(1);
	}, [type_key]);

	useEffect(() => {
		if (!transType) {
			return;
		}
		document.title = `${transType.plural} - OutputBooks`;
		loadTransactions();
	}, [type_key, page]);

	async function loadTransactions(currentFilters = filters) {
		const result = await getTransactions({ trans_type: transType.type, ...currentFilters, page, limit });
		if (result.status === "S") {
			setTransactions(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadTransactions(filters);
	}

	async function handleDelete(transaction) {
		if (!window.confirm(`Delete ${transaction.trans_no}? This also removes its accounting and stock effects.`)) {
			return;
		}
		const result = await deleteTransaction(transaction.trans_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadTransactions();
	}

	async function handleConvert(transaction, targetType) {
		const targetTransType = transTypes.find((item) => item.type === targetType);
		if (!window.confirm(`Create a ${targetTransType.title} from ${transaction.trans_no}?`)) {
			return;
		}
		const result = await convertTransaction(transaction.trans_id, targetType);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(`${targetTransType.title} ${result.data.trans_no} created`);
		navigate(`/t/${targetTransType.key}/${result.data.trans_id}/view`);
	}

	if (!transType) {
		return <div className="alert alert-warning">Unknown document type</div>;
	}

	const isPartyDocument = transType.kind !== "journal";

	return (
		<>
			<PageHeader title={transType.plural}>
				<button className="btn btn-primary" onClick={() => navigate(`/t/${transType.key}/new`)}><i className="bi bi-plus-lg me-1" />New {transType.title}</button>
			</PageHeader>

			<form className="ob-card mb-3" onSubmit={handleSearch}>
				<div className="row g-2 align-items-end">
					<div className="col-md-4"><label className="form-label">Search</label><input className="form-control" placeholder="Number, name or reference" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div>
					<div className="col-md-3"><label className="form-label">From</label><input type="date" className="form-control" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} /></div>
					<div className="col-md-3"><label className="form-label">To</label><input type="date" className="form-control" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} /></div>
					<div className="col-md-2"><button className="btn btn-outline-secondary w-100">Filter</button></div>
				</div>
			</form>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0 align-middle">
					<thead>
						<tr>
							<th>Number</th><th>Date</th>{isPartyDocument && <th>{transType.side === "S" ? "Customer" : "Supplier"}</th>}
							<th className="text-end-num">Total</th>{transType.kind === "items" && <th className="text-end-num">Paid</th>}<th>Status</th><th />
						</tr>
					</thead>
					<tbody>
						{transactions.map((transaction) => {
							const badge = STATUS_BADGES[transaction.is_overdue ? "O" : transaction.status] || STATUS_BADGES.S;
							return (
								<tr key={transaction.trans_id}>
									<td><Link to={`/t/${transType.key}/${transaction.trans_id}/view`}>{transaction.trans_no}</Link></td>
									<td>{formatDate(transaction.trans_date)}</td>
									{isPartyDocument && <td>{transaction.con_name || "Cash"}</td>}
									<td className="text-end-num">{formatMoney(transaction.tot_amount)}</td>
									{transType.kind === "items" && <td className="text-end-num">{formatMoney(transaction.rec_amt)}</td>}
									<td><span className={`badge ${badge.className}`}>{badge.label}</span></td>
									<td className="text-end text-nowrap">
										{transType.convert_to.map((targetType) => {
											const target = transTypes.find((item) => item.type === targetType);
											return <button key={targetType} className="btn btn-sm btn-outline-secondary me-1" onClick={() => handleConvert(transaction, targetType)}>To {target.title}</button>;
										})}
										<button className="btn btn-sm btn-outline-primary me-1" onClick={() => navigate(`/t/${transType.key}/${transaction.trans_id}`)}>Edit</button>
										<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(transaction)}>Delete</button>
									</td>
								</tr>
							);
						})}
						{transactions.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">Nothing found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />
		</>
	);
};

export default Transactions;
