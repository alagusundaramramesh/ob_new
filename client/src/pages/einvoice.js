import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEinvoiceWorklist } from "../services/api";
import { formatMoney, formatDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";
import transTypes from "../data/trans_types.json";

const TABS = [
	{ key: "einvoice_pending", label: "E-invoice pending", info: "Invoices, credit notes and debit notes to registered buyers without an IRN" },
	{ key: "einvoice_done", label: "E-invoices", info: "Documents that have an IRN (active or cancelled)" },
	{ key: "ewb_pending", label: "E-way bill pending", info: "Invoices and challans of Rs. 50,000 or more with goods and no active e-way bill" },
	{ key: "ewb_done", label: "E-way bills", info: "Documents that have an e-way bill (active or cancelled)" },
];

/* Work list: open a document to generate its IRN / e-way bill (the buttons are on the document view) */
const Einvoice = () => {
	const [kind, setKind] = useState("einvoice_pending");
	const [rows, setRows] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const limit = 20;

	useEffect(() => {
		document.title = "E-invoice and e-way bill - OutputBooks";
	}, []);

	useEffect(() => {
		async function loadRows() {
			const result = await getEinvoiceWorklist(kind, page, limit);
			if (result.status === "S") {
				setRows(result.data);
				setTotalCount(result.total_count);
			}
		}
		loadRows();
	}, [kind, page]);

	const getLink = (row) => {
		const transType = transTypes.find((item) => item.type === row.trans_type);
		return transType ? `/t/${transType.key}/${row.trans_id}/view` : "#";
	};

	const activeTab = TABS.find((tab) => tab.key === kind);

	return (
		<>
			<PageHeader title="E-invoice and e-way bill" subtitle={activeTab.info}>
				<Link className="btn btn-outline-secondary" to="/settings">Settings</Link>
			</PageHeader>

			<ul className="nav nav-tabs mb-3">
				{TABS.map((tab) => (
					<li className="nav-item" key={tab.key}>
						<button className={`nav-link ${kind === tab.key ? "active" : ""}`} onClick={() => { setPage(1); setKind(tab.key); }}>{tab.label}</button>
					</li>
				))}
			</ul>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0 align-middle">
					<thead>
						<tr><th>Document</th><th>Date</th><th>Customer</th><th>GSTIN</th><th className="text-end-num">Total</th>{kind.startsWith("einvoice") ? <th>IRN</th> : <th>E-way bill</th>}<th>Status</th></tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.trans_id}>
								<td><Link to={getLink(row)}>{row.trans_no}</Link></td>
								<td>{formatDate(row.trans_date)}</td>
								<td>{row.con_name}</td>
								<td className="small">{row.con_tax_no}</td>
								<td className="text-end-num">{formatMoney(row.tot_amount)}</td>
								<td className="small text-break" style={{ maxWidth: 260 }}>{kind.startsWith("einvoice") ? (row.einvoice ? row.einvoice.irn : "") : (row.ewb ? `${row.ewb.ewb_no} (till ${row.ewb.valid_till})` : "")}</td>
								<td>
									{(row.einvoice || row.ewb) ? (
										<>
											{kind.startsWith("einvoice") ? (row.einvoice && <span className={`badge ${row.einvoice.status === "ACT" ? "bg-success" : "bg-secondary"}`}>{row.einvoice.status === "ACT" ? "Active" : "Cancelled"}</span>) : (row.ewb && <span className={`badge ${row.ewb.status === "ACT" ? "bg-success" : "bg-secondary"}`}>{row.ewb.status === "ACT" ? "Active" : "Cancelled"}</span>)}
											{((row.einvoice && row.einvoice.provider === "mock") || (row.ewb && row.ewb.provider === "mock")) && <span className="badge bg-danger ms-1">TEST</span>}
										</>
									) : <Link className="btn btn-sm btn-outline-primary" to={getLink(row)}>Open</Link>}
								</td>
							</tr>
						))}
						{rows.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">Nothing here</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />
		</>
	);
};

export default Einvoice;
