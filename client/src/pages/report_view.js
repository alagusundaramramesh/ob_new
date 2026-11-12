import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getReport, getAccounts, getItems } from "../services/api";
import { formatMoney, formatQty, formatDate, formatBalance, toInputDate } from "../utils/format";
import PageHeader from "../components/page_header";
import reportList from "../data/report_list.json";
import transTypes from "../data/trans_types.json";

/* Small table: columns = [{ label, field | render, num }] */
const DataTable = ({ columns, rows, footer }) => (
	<div className="table-responsive">
		<table className="table table-sm table-hover table-ob mb-0">
			<thead>
				<tr>{columns.map((column) => <th key={column.label} className={column.num ? "text-end-num" : ""}>{column.label}</th>)}</tr>
			</thead>
			<tbody>
				{rows.map((row, index) => (
					<tr key={index}>
						{columns.map((column) => (
							<td key={column.label} className={column.num ? "text-end-num" : ""}>{column.render ? column.render(row) : row[column.field]}</td>
						))}
					</tr>
				))}
				{rows.length === 0 && <tr><td colSpan={columns.length} className="text-center text-muted py-3">No data for the selected period</td></tr>}
			</tbody>
			{footer && <tfoot>{footer}</tfoot>}
		</table>
	</div>
);

const money = (field) => (row) => formatMoney(row[field]);

const ReportView = () => {
	const { report_name } = useParams();
	const [searchParams] = useSearchParams();
	const report = reportList.find((item) => item.name === report_name);

	const today = toInputDate();
	const [filters, setFilters] = useState({
		from_date: "", to_date: today, as_on_date: today, month: today.slice(0, 7), method: "MASTER", year: Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1, acc_id: searchParams.get("acc_id") || "", item_id: "", side: "R",
	});
	const [options, setOptions] = useState({ accounts: [], items: [] });
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(false);
	const [gstr2bFile, setGstr2bFile] = useState(null);
	const [statusFilter, setStatusFilter] = useState("ALL");

	// Report names change inside this component, so the old result is cleared
	useEffect(() => {
		setData(null);
		if (!report) {
			return;
		}
		document.title = `${report.title} - OutputBooks`;
		async function loadOptions() {
			if (report.filter === "ledger") {
				const result = await getAccounts({ limit: 500, include_contacts: true });
				if (result.status === "S") setOptions((current) => ({ ...current, accounts: result.data }));
			}
			if (report.filter === "stock_ledger") {
				const result = await getItems({ limit: 500, type: "P" });
				if (result.status === "S") setOptions((current) => ({ ...current, items: result.data }));
			}
		}
		loadOptions();
		if (!["ledger", "stock_ledger", "month", "gstr2b"].includes(report.filter)) {
			runReport();
		} else if (searchParams.get("acc_id")) {
			runReport();
		}
	}, [report_name]);

	async function runReport(e) {
		if (e) e.preventDefault();
		const request = {};
		if (["range", "ledger", "stock_ledger", "item_side"].includes(report.filter)) {
			if (filters.from_date) request.from_date = filters.from_date;
			request.to_date = filters.to_date;
		}
		if (report.filter === "as_on" || report.filter === "outstanding" || report.filter === "stock_value") request.as_on_date = filters.as_on_date;
		if (report.filter === "stock_value") request.method = filters.method;
		if (report.filter === "month" || report.filter === "gstr2b") request.month = filters.month;
		if (report.filter === "gstr2b") {
			if (!gstr2bFile) {
				toast.error("Choose the GSTR-2B JSON file");
				return;
			}
			request.gstr2b = gstr2bFile;
		}
		if (report.filter === "year") request.year = Number(filters.year);
		if (report.filter === "ledger") request.acc_id = Number(filters.acc_id);
		if (report.filter === "stock_ledger") request.item_id = Number(filters.item_id);
		if (report.filter === "outstanding") request.side = filters.side;
		if (report.filter === "item_side") request.side = filters.side === "P" ? "P" : "S";

		if (report.filter === "ledger" && !request.acc_id) {
			toast.error("Select an account");
			return;
		}
		if (report.filter === "stock_ledger" && !request.item_id) {
			toast.error("Select an item");
			return;
		}
		setLoading(true);
		const result = await getReport(report.name, request);
		setLoading(false);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to run the report");
			return;
		}
		setData(result.data);
	}

	if (!report) {
		return <div className="alert alert-warning">Unknown report</div>;
	}

	const getDocLink = (row) => {
		const transType = transTypes.find((item) => item.type === row.trans_type);
		return transType && row.trans_id ? <Link to={`/t/${transType.key}/${row.trans_id}/view`}>{row.trans_no}</Link> : row.trans_no;
	};

	const renderResult = () => {
		if (!data) return null;

		switch (report.name) {
			case "ledger":
				return (
					<>
						<div className="mb-2 fw-bold">{data.account.name} - opening balance {formatBalance(data.opening_balance)}</div>
						<DataTable
							columns={[
								{ label: "Date", render: (row) => formatDate(row.trans_date) }, { label: "Document", render: getDocLink }, { label: "Description", field: "desc" },
								{ label: "Debit", num: true, render: (row) => (row.debit ? formatMoney(row.debit) : "") }, { label: "Credit", num: true, render: (row) => (row.credit ? formatMoney(row.credit) : "") },
								{ label: "Balance", num: true, render: (row) => formatBalance(row.balance) },
							]}
							rows={data.rows}
							footer={<tr className="fw-bold"><td colSpan="3">Total</td><td className="text-end-num">{formatMoney(data.total_debit)}</td><td className="text-end-num">{formatMoney(data.total_credit)}</td><td className="text-end-num">{formatBalance(data.closing_balance)}</td></tr>}
						/>
					</>
				);
			case "daybook":
				return <DataTable columns={[{ label: "Date", render: (row) => formatDate(row.trans_date) }, { label: "Type", field: "trans_type" }, { label: "Document", render: getDocLink }, { label: "Party", field: "con_name" }, { label: "Amount", num: true, render: money("tot_amount") }]} rows={data.rows} />;
			case "trial_balance":
				return (
					<DataTable
						columns={[
							{ label: "Account", field: "name" }, { label: "Group", field: "group_name" },
							{ label: "Opening", num: true, render: (row) => formatBalance(row.opening) }, { label: "Debit", num: true, render: money("debit") }, { label: "Credit", num: true, render: money("credit") },
							{ label: "Closing Dr", num: true, render: (row) => (row.closing_debit ? formatMoney(row.closing_debit) : "") }, { label: "Closing Cr", num: true, render: (row) => (row.closing_credit ? formatMoney(row.closing_credit) : "") },
						]}
						rows={data.rows}
						footer={<tr className="fw-bold"><td colSpan="5">Total {data.is_balanced ? "" : "(NOT BALANCED)"}</td><td className="text-end-num">{formatMoney(data.total_debit)}</td><td className="text-end-num">{formatMoney(data.total_credit)}</td></tr>}
					/>
				);
			case "profit_loss": {
				const section = (title, rows) => (
					<div className="mb-3" key={title}>
						<div className="fw-bold">{title}</div>
						<DataTable columns={[{ label: "Account", field: "name" }, { label: "Amount", num: true, render: money("amount") }]} rows={rows} />
					</div>
				);
				return (
					<div className="row">
						<div className="col-lg-6">
							{section("Direct income (sales)", data.direct_income)}
							<div className="d-flex justify-content-between mb-3"><span>Closing stock</span><span>{formatMoney(data.closing_stock)}</span></div>
							{section("Indirect income", data.indirect_income)}
						</div>
						<div className="col-lg-6">
							{section("Direct expenses (purchases)", data.direct_expense)}
							<div className="d-flex justify-content-between mb-3"><span>Opening stock</span><span>{formatMoney(data.opening_stock)}</span></div>
							{section("Indirect expenses", data.indirect_expense)}
						</div>
						<div className="col-12">
							<div className="ob-card"><div className="d-flex justify-content-between fs-5"><span>Gross profit</span><strong>{formatMoney(data.gross_profit)}</strong></div>
								<div className="d-flex justify-content-between fs-5"><span>Net profit</span><strong className={data.net_profit < 0 ? "text-danger" : "text-success"}>{formatMoney(data.net_profit)}</strong></div></div>
						</div>
					</div>
				);
			}
			case "balance_sheet":
				return (
					<div className="row">
						<div className="col-lg-6">
							<div className="fw-bold mb-1">Liabilities</div>
							<DataTable columns={[{ label: "Account", field: "name" }, { label: "Amount", num: true, render: money("amount") }]} rows={data.liabilities} footer={<tr className="fw-bold"><td>Total</td><td className="text-end-num">{formatMoney(data.total_liabilities)}</td></tr>} />
						</div>
						<div className="col-lg-6">
							<div className="fw-bold mb-1">Assets</div>
							<DataTable columns={[{ label: "Account", field: "name" }, { label: "Amount", num: true, render: money("amount") }]} rows={data.assets} footer={<tr className="fw-bold"><td>Total</td><td className="text-end-num">{formatMoney(data.total_assets)}</td></tr>} />
						</div>
					</div>
				);
			case "sales_register":
			case "purchase_register":
				return (
					<DataTable
						columns={[{ label: "Date", render: (row) => formatDate(row.trans_date) }, { label: "Document", render: getDocLink }, { label: "Party", field: "con_name" }, { label: "GSTIN", field: "con_tax_no" }, { label: "Taxable", num: true, render: money("taxable_amount") }, { label: "Tax", num: true, render: money("tot_tax") }, { label: "Total", num: true, render: money("tot_amount") }]}
						rows={data.rows}
						footer={<tr className="fw-bold"><td colSpan="4">Total</td><td className="text-end-num">{formatMoney(data.taxable_amount)}</td><td className="text-end-num">{formatMoney(data.tot_tax)}</td><td className="text-end-num">{formatMoney(data.tot_amount)}</td></tr>}
					/>
				);
			case "outstanding":
				return (
					<DataTable
						columns={[{ label: "Party", field: "con_name" }, { label: "Current", num: true, render: money("current") }, { label: "1-30", num: true, render: money("days_1_30") }, { label: "31-60", num: true, render: money("days_31_60") }, { label: "61-90", num: true, render: money("days_61_90") }, { label: "Over 90", num: true, render: money("days_over_90") }, { label: "Pending", num: true, render: money("pending_amount") }]}
						rows={data.rows}
						footer={<tr className="fw-bold"><td colSpan="6">Total pending</td><td className="text-end-num">{formatMoney(data.total_pending)}</td></tr>}
					/>
				);
			case "item_sales":
				return (
					<DataTable
						columns={[{ label: "Item", field: "item_name" }, { label: "Quantity", num: true, render: (row) => formatQty(row.qty) }, { label: "Taxable", num: true, render: money("taxable_amount") }, { label: "With tax", num: true, render: money("item_total") }]}
						rows={data.rows}
						footer={<tr className="fw-bold"><td colSpan="2">Total</td><td className="text-end-num">{formatMoney(data.taxable_amount)}</td><td /></tr>}
					/>
				);
			case "stock_summary":
				return (
					<DataTable
						columns={[{ label: "Item", field: "name" }, { label: "SKU", field: "sku" }, { label: "Quantity", num: true, render: (row) => `${formatQty(row.qty)} ${row.uom || ""}` }, { label: "Rate", num: true, render: money("rate") }, { label: "Value", num: true, render: money("value") }]}
						rows={data.rows}
						footer={<tr className="fw-bold"><td colSpan="4">Total stock value</td><td className="text-end-num">{formatMoney(data.total_value)}</td></tr>}
					/>
				);
			case "stock_ledger":
				return (
					<>
						<div className="mb-2 fw-bold">{data.item.name} - opening {formatQty(data.opening_qty)}</div>
						<DataTable
							columns={[{ label: "Date", render: (row) => formatDate(row.trans_date) }, { label: "Document", render: getDocLink }, { label: "In", num: true, render: (row) => (row.qty_in ? formatQty(row.qty_in) : "") }, { label: "Out", num: true, render: (row) => (row.qty_out ? formatQty(row.qty_out) : "") }, { label: "Balance", num: true, render: (row) => formatQty(row.balance) }]}
							rows={data.rows}
							footer={<tr className="fw-bold"><td colSpan="4">Closing</td><td className="text-end-num">{formatQty(data.closing_qty)}</td></tr>}
						/>
					</>
				);
			case "gst_summary": {
				const taxColumns = [{ label: "Tax", field: "tax_type_code" }, { label: "Rate %", num: true, field: "tax_rate" }, { label: "Taxable", num: true, render: money("taxable_amount") }, { label: "Tax amount", num: true, render: money("tax_value") }];
				return (
					<>
						<div className="fw-bold mb-1">Outward supplies (sales)</div>
						<DataTable columns={taxColumns} rows={data.outward} footer={<tr className="fw-bold"><td colSpan="3">Output tax</td><td className="text-end-num">{formatMoney(data.output_tax)}</td></tr>} />
						<div className="fw-bold mt-4 mb-1">Input tax credit (purchases)</div>
						<DataTable columns={taxColumns} rows={data.inward} footer={<tr className="fw-bold"><td colSpan="3">Input tax</td><td className="text-end-num">{formatMoney(data.input_tax)}</td></tr>} />
						<div className="ob-card mt-4 d-flex justify-content-between fs-5"><span>Net tax payable</span><strong>{formatMoney(data.net_tax_payable)}</strong></div>
					</>
				);
			}
			case "gstr1":
				return renderGstr1();
			case "gstr3b":
				return renderGstr3b();
			case "gstr2b":
				return renderGstr2b();
			case "gstr9":
				return renderGstr9();
			case "gstr4":
				return renderGstr4();
			default:
				return null;
		}
	};

	/* The JSON of a return as a file for the GST portal / offline tool */
	const downloadJson = (fileName) => {
		const blob = new Blob([JSON.stringify(data.json, null, 2)], { type: "application/json" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(link.href);
	};

	const renderWarnings = () => data.warnings.length > 0 && (
		<div className="alert alert-warning small">
			<strong>Check before filing</strong>
			<ul className="mb-0">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
		</div>
	);

	const renderGstr1 = () => {
		const summary = data.summary;
		const sections = [
			{ label: "4A / 4B  B2B invoices (registered buyers)", count: summary.b2b.count, value: summary.b2b.txval },
			{ label: "5  B2C large (inter-state, above Rs. 2.5 lakh)", count: summary.b2cl.count, value: summary.b2cl.txval },
			{ label: "7  B2C small (by state and rate, credit notes subtracted)", count: summary.b2cs.documents, value: summary.b2cs.txval },
			{ label: "9B  Credit / debit notes (registered)", count: summary.cdnr.count, value: null },
			{ label: "9B  Credit / debit notes (unregistered)", count: summary.cdnur.count, value: null },
			{ label: "6A  Exports", count: summary.exp.count, value: summary.exp.txval },
			{ label: "4A  of the B2B invoices: supplies to SEZ", count: summary.sez.count, value: summary.sez.txval },
			{ label: "8  Nil rated supplies", count: null, value: summary.nil.amount },
			{ label: "12  HSN summary lines", count: summary.hsn_lines, value: null },
			{ label: "13  Documents issued (number series)", count: summary.doc_issue.series, value: null },
		];
		return (
			<>
				<div className="d-flex justify-content-between align-items-center mb-3">
					<div>GSTIN <strong>{data.gstin}</strong> - return period <strong>{data.period}</strong> - {summary.documents} documents</div>
					<button className="btn btn-primary" onClick={() => downloadJson(`GSTR1_${data.gstin}_${data.period}.json`)}><i className="bi bi-download me-1" />Download JSON</button>
				</div>
				{renderWarnings()}
				<DataTable
					columns={[{ label: "Table", field: "label" }, { label: "Documents", num: true, render: (row) => (row.count === null ? "" : row.count) }, { label: "Taxable value", num: true, render: (row) => (row.value === null ? "" : formatMoney(row.value)) }]}
					rows={sections}
				/>
				<div className="row mt-3">
					<div className="col-md-6">
						<div className="fw-bold mb-1">Tax of the return (credit notes subtracted)</div>
						<DataTable
							columns={[{ label: "Head", field: "head" }, { label: "Amount", num: true, render: (row) => formatMoney(row.amount) }]}
							rows={[{ head: "Taxable value", amount: summary.tax.txval }, { head: "IGST", amount: summary.tax.iamt }, { head: "CGST", amount: summary.tax.camt }, { head: "SGST", amount: summary.tax.samt }, { head: "Cess", amount: summary.tax.csamt }]}
						/>
					</div>
				</div>
			</>
		);
	};

	/* The file from the GST portal is read in the browser and sent as JSON */
	const chooseGstr2bFile = (e) => {
		const file = e.target.files[0];
		setGstr2bFile(null);
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				setGstr2bFile(JSON.parse(reader.result));
			} catch (error) {
				toast.error("This file is not a valid JSON file");
			}
		};
		reader.readAsText(file);
	};

	const renderGstr2b = () => {
		const summary = data.summary;
		const statusLabels = {
			MATCHED: ["Matched", "success"], MISMATCH: ["Amount differs", "danger"], PROBABLE: ["Number differs", "warning"],
			NOT_IN_BOOKS: ["Only in portal", "primary"], NOT_IN_PORTAL: ["Only in books", "secondary"],
		};
		const cards = [
			["MATCHED", summary.matched], ["MISMATCH", summary.mismatch], ["PROBABLE", summary.probable],
			["NOT_IN_BOOKS", summary.not_in_books], ["NOT_IN_PORTAL", summary.not_in_portal],
		];
		const visibleRows = data.rows.filter((row) => statusFilter === "ALL" || row.status === statusFilter);
		const differenceText = (row) => Object.entries(row.differences).map(([head, value]) => `${head === "txval" ? "Taxable" : head.replace("amt", "").toUpperCase()} ${value > 0 ? "+" : ""}${value}`).join(", ");
		const itcRow = (label, itc) => ({ label, iamt: itc.iamt, camt: itc.camt, samt: itc.samt, csamt: itc.csamt, total: itc.total });
		return (
			<>
				<div className="mb-3">Return period <strong>{data.period}</strong> - books read from <strong>{formatDate(data.books_from)}</strong></div>
				{data.warnings.length > 0 && <div className="alert alert-warning small"><ul className="mb-0">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
				<div className="d-flex flex-wrap gap-2 mb-3">
					<button type="button" className={`btn btn-sm ${statusFilter === "ALL" ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setStatusFilter("ALL")}>All ({data.rows.length})</button>
					{cards.map(([status, count]) => (
						<button type="button" key={status} className={`btn btn-sm ${statusFilter === status ? `btn-${statusLabels[status][1]}` : `btn-outline-${statusLabels[status][1]}`}`} onClick={() => setStatusFilter(status)}>
							{statusLabels[status][0]} ({count})
						</button>
					))}
				</div>
				<DataTable
					columns={[
						{ label: "Status", render: (row) => <span className={`badge text-bg-${statusLabels[row.status][1]}`}>{statusLabels[row.status][0]}</span> },
						{ label: "Supplier", render: (row) => (row.portal || row.book).supplier },
						{ label: "GSTIN", render: (row) => (row.portal || row.book).ctin || "-" },
						{ label: "Portal document", render: (row) => (row.portal ? `${row.portal.doc_no} (${row.portal.kind})` : "") },
						{ label: "Books document", render: (row) => (row.book ? `${row.book.doc_no} (${row.book.trans_no})` : "") },
						{ label: "Portal tax", num: true, render: (row) => (row.portal ? formatMoney(row.portal.iamt + row.portal.camt + row.portal.samt + row.portal.csamt) : "") },
						{ label: "Books tax", num: true, render: (row) => (row.book ? formatMoney(row.book.iamt + row.book.camt + row.book.samt + row.book.csamt) : "") },
						{ label: "Difference", render: differenceText },
					]}
					rows={visibleRows}
				/>
				<div className="fw-bold mt-4 mb-1">Input tax credit</div>
				<DataTable
					columns={[{ label: "", field: "label" }, { label: "IGST", num: true, render: money("iamt") }, { label: "CGST", num: true, render: money("camt") }, { label: "SGST", num: true, render: money("samt") }, { label: "Cess", num: true, render: money("csamt") }, { label: "Total", num: true, render: money("total") }]}
					rows={[
						itcRow("As in the GST portal (GSTR-2B)", summary.itc_portal),
						itcRow("As in your books", summary.itc_books),
						itcRow("Books documents found in the portal", summary.itc_matched_books),
					]}
				/>
				<div className="form-text mt-2">
					Claim the credit only for documents found in the portal. "Only in books" means the supplier has not filed it (or it is dated in another month). Credit and debit notes from suppliers are both matched with credit notes of the portal.
				</div>
			</>
		);
	};

	const renderGstr9 = () => {
		// Object keys such as "5" and "9" would come first, so the order of the annual return is given here
		const tableOrder = ["4A", "4B", "4C", "4D", "4I_4J", "5", "6", "6_rcm", "9", "9_output", "9_zero_rated"];
		const tableRows = tableOrder.filter((table) => data.tables[table]).map((table) => ({ table: table.replace("_", " "), ...data.tables[table] }));
		return (
			<>
				<div className="mb-3">GSTIN <strong>{data.gstin}</strong> - financial year <strong>{data.fy}</strong></div>
				<div className="alert alert-warning small"><ul className="mb-0">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
				<DataTable
					columns={[
						{ label: "Table", field: "table" }, { label: "Details", field: "text" },
						{ label: "Taxable value", num: true, render: (row) => (row.txval === undefined ? "" : formatMoney(row.txval)) },
						{ label: "IGST", num: true, render: (row) => (row.iamt === undefined ? "" : formatMoney(row.iamt)) },
						{ label: "CGST", num: true, render: (row) => (row.camt === undefined ? "" : formatMoney(row.camt)) },
						{ label: "SGST", num: true, render: (row) => (row.samt === undefined ? "" : formatMoney(row.samt)) },
						{ label: "Cess", num: true, render: (row) => (row.csamt === undefined ? "" : formatMoney(row.csamt)) },
					]}
					rows={tableRows}
				/>
				<div className="fw-bold mt-4 mb-1">Month by month</div>
				<DataTable
					columns={[
						{ label: "Month", field: "month" }, { label: "Documents", num: true, field: "documents" },
						{ label: "Outward taxable (B2B + B2C)", num: true, render: (row) => formatMoney(row.b2b_txval + row.b2c_txval) },
						{ label: "Output tax", num: true, render: (row) => formatMoney(row.output.iamt + row.output.camt + row.output.samt + row.output.csamt) },
						{ label: "Input credit", num: true, render: (row) => formatMoney(row.itc.iamt + row.itc.camt + row.itc.samt + row.itc.csamt) },
						{ label: "Tax payable", num: true, render: (row) => formatMoney(row.payable.iamt + row.payable.camt + row.payable.samt + row.payable.csamt) },
					]}
					rows={data.months}
				/>
			</>
		);
	};

	const renderGstr4 = () => (
		<>
			<div className="mb-3">GSTIN <strong>{data.gstin}</strong> - financial year <strong>{data.fy}</strong> - composition rate <strong>{data.rate}%</strong></div>
			<div className="alert alert-warning small"><ul className="mb-0">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
			<DataTable
				columns={[
					{ label: "Quarter", render: (row) => "Q" + row.quarter }, { label: "Turnover", num: true, render: money("turnover") },
					{ label: "Tax", num: true, render: money("tax") }, { label: "CGST", num: true, render: money("cgst") }, { label: "SGST", num: true, render: money("sgst") },
				]}
				rows={data.quarters}
				footer={<tr className="fw-bold"><td>Year</td><td className="text-end-num">{formatMoney(data.totals.turnover)}</td><td className="text-end-num">{formatMoney(data.totals.tax)}</td><td className="text-end-num">{formatMoney(data.totals.cgst)}</td><td className="text-end-num">{formatMoney(data.totals.sgst)}</td></tr>}
			/>
			<div className="fw-bold mt-4 mb-1">Inward supplies of the year</div>
			<DataTable
				columns={[{ label: "From", field: "label" }, { label: "Value", num: true, render: money("value") }]}
				rows={[
					{ label: "Registered suppliers", value: data.inward.registered },
					{ label: "Unregistered suppliers", value: data.inward.unregistered },
					{ label: "Reverse charge purchases (taxable value)", value: data.inward.reverse_charge_txval },
					{ label: "Reverse charge purchases (tax to pay)", value: data.inward.reverse_charge_tax },
				]}
			/>
		</>
	);

	const renderGstr3b = () => {
		const summary = data.summary;
		const heads = ["iamt", "camt", "samt", "csamt"];
		const row = (label, source) => ({ label, txval: source.txval, iamt: source.iamt, camt: source.camt, samt: source.samt, csamt: source.csamt });
		return (
			<>
				<div className="d-flex justify-content-between align-items-center mb-3">
					<div>GSTIN <strong>{data.gstin}</strong> - return period <strong>{data.period}</strong></div>
					<button className="btn btn-primary" onClick={() => downloadJson(`GSTR3B_${data.gstin}_${data.period}.json`)}><i className="bi bi-download me-1" />Download JSON</button>
				</div>
				{renderWarnings()}
				<DataTable
					columns={[{ label: "Table", field: "label" }, { label: "Taxable value", num: true, render: (item) => (item.txval === undefined ? "" : formatMoney(item.txval)) }, { label: "IGST", num: true, render: money("iamt") }, { label: "CGST", num: true, render: money("camt") }, { label: "SGST", num: true, render: money("samt") }, { label: "Cess", num: true, render: money("csamt") }]}
					rows={[
						row("3.1(a) Outward taxable supplies (net of credit notes)", summary.output),
						row("3.1(b) Zero rated: exports and SEZ", summary.zero_rated),
						row("3.1(d) Inward supplies on reverse charge (tax to pay)", summary.reverse_charge),
						{ label: "3.1(c) Nil rated outward supplies", txval: summary.nil_outward, iamt: 0, camt: 0, samt: 0, csamt: 0 },
						row("4 Input tax credit available", summary.itc),
						{ label: "Tax payable (output - credit)", ...Object.fromEntries(heads.map((head) => [head, summary.payable[head]])) },
					]}
				/>
				<div className="mt-3">
					<div className="fw-bold mb-1">3.2 Supplies to unregistered buyers in other states</div>
					<DataTable columns={[{ label: "Place of supply", field: "pos" }, { label: "Taxable value", num: true, render: money("txval") }, { label: "IGST", num: true, render: money("iamt") }]} rows={data.json.inter_sup.unreg_details} />
				</div>
			</>
		);
	};

	return (
		<>
			<div className="no-print">
				<PageHeader title={report.title} subtitle={report.info}>
					<Link className="btn btn-light" to="/reports">All reports</Link>
					{data && <button className="btn btn-outline-primary" onClick={() => window.print()}><i className="bi bi-printer me-1" />Print</button>}
				</PageHeader>

				<form className="ob-card mb-3" onSubmit={runReport}>
					<div className="row g-2 align-items-end">
						{report.filter === "ledger" && (
							<div className="col-md-4">
								<label className="form-label">Account</label>
								<select className="form-select" value={filters.acc_id} onChange={(e) => setFilters({ ...filters, acc_id: e.target.value })}>
									<option value="">Select account</option>
									{options.accounts.map((account) => <option key={account.acc_id} value={account.acc_id}>{account.name}</option>)}
								</select>
							</div>
						)}
						{report.filter === "stock_ledger" && (
							<div className="col-md-4">
								<label className="form-label">Item</label>
								<select className="form-select" value={filters.item_id} onChange={(e) => setFilters({ ...filters, item_id: e.target.value })}>
									<option value="">Select item</option>
									{options.items.map((item) => <option key={item.item_id} value={item.item_id}>{item.name}</option>)}
								</select>
							</div>
						)}
						{(report.filter === "outstanding" || report.filter === "item_side") && (
							<div className="col-md-3">
								<label className="form-label">Show</label>
								<select className="form-select" value={filters.side} onChange={(e) => setFilters({ ...filters, side: e.target.value })}>
									{report.filter === "outstanding"
										? <><option value="R">Receivables (customers)</option><option value="P">Payables (suppliers)</option></>
										: <><option value="R">Sales</option><option value="P">Purchases</option></>}
								</select>
							</div>
						)}
						{["range", "ledger", "stock_ledger", "item_side"].includes(report.filter) && (
							<>
								<div className="col-md-2"><label className="form-label">From</label><input type="date" className="form-control" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} /></div>
								<div className="col-md-2"><label className="form-label">To</label><input type="date" className="form-control" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} /></div>
							</>
						)}
						{(report.filter === "month" || report.filter === "gstr2b") && (
							<div className="col-md-3"><label className="form-label">Month</label><input type="month" className="form-control" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} required /></div>
						)}
						{report.filter === "year" && (
							<div className="col-md-3"><label className="form-label">Financial year starting in</label><input type="number" min="2017" max="2100" className="form-control" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} required /><div className="form-text">2026 = 2026-27</div></div>
						)}
						{report.filter === "gstr2b" && (
							<div className="col-md-5"><label className="form-label">GSTR-2B file (JSON from the GST portal)</label><input type="file" accept=".json,application/json" className="form-control" onChange={chooseGstr2bFile} /></div>
						)}
						{report.filter === "stock_value" && (
							<div className="col-md-3">
								<label className="form-label">Value stock by</label>
								<select className="form-select" value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })}>
									<option value="MASTER">Purchase rate of the item</option>
									<option value="FIFO">FIFO (oldest purchase first)</option>
									<option value="AVERAGE">Weighted average cost</option>
								</select>
							</div>
						)}
						{(report.filter === "as_on" || report.filter === "outstanding" || report.filter === "stock_value") && (
							<div className="col-md-2"><label className="form-label">As on</label><input type="date" className="form-control" value={filters.as_on_date} onChange={(e) => setFilters({ ...filters, as_on_date: e.target.value })} /></div>
						)}
						<div className="col-md-2"><button className="btn btn-primary w-100" disabled={loading}>{loading ? "Loading..." : "Show"}</button></div>
					</div>
					{["range", "ledger", "stock_ledger", "item_side"].includes(report.filter) && <div className="form-text">Leave "From" empty to use the start of the current financial year.</div>}
				</form>
			</div>

			<div className="ob-card">
				<h5 className="d-none d-print-block">{report.title}</h5>
				{loading && <div className="text-center py-4"><div className="spinner-border text-primary" /></div>}
				{!loading && !data && <div className="text-muted">Select the filters and press Show.</div>}
				{!loading && renderResult()}
			</div>
		</>
	);
};

export default ReportView;
