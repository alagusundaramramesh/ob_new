import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { getDashboard } from "../services/api";
import { formatMoney, formatDate, formatQty } from "../utils/format";
import PageHeader from "../components/page_header";
import transTypes from "../data/trans_types.json";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const Dashboard = () => {
	const [dashboard, setDashboard] = useState(null);

	useEffect(() => {
		document.title = "Dashboard - OutputBooks";
		async function loadDashboard() {
			const result = await getDashboard();
			if (result.status === "S") {
				setDashboard(result.data);
			}
		}
		loadDashboard();
	}, []);

	if (!dashboard) {
		return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
	}

	const statCards = [
		{ label: "Sales (this year)", value: dashboard.sales.taxable_amount, hint: `${dashboard.sales.count} invoices` },
		{ label: "Purchases (this year)", value: dashboard.purchases.taxable_amount, hint: `${dashboard.purchases.count} bills` },
		{ label: "Receivables", value: dashboard.receivables.pending, hint: `${formatMoney(dashboard.receivables.overdue)} overdue` },
		{ label: "Payables", value: dashboard.payables.pending, hint: `${formatMoney(dashboard.payables.overdue)} overdue` },
		{ label: "Cash & bank", value: dashboard.cash_bank_balance, hint: "all bank and cash accounts" },
	];

	const chartData = {
		labels: dashboard.monthly_sales.map((row) => row.month),
		datasets: [{ label: "Sales (without tax)", data: dashboard.monthly_sales.map((row) => row.amount), backgroundColor: "#0d6efd" }],
	};

	const getTransLink = (transaction) => {
		const transType = transTypes.find((item) => item.type === transaction.trans_type);
		return transType ? `/t/${transType.key}/${transaction.trans_id}/view` : "#";
	};

	return (
		<>
			<PageHeader title="Dashboard" subtitle={`Financial year ${formatDate(dashboard.financial_year.from_date)} - ${formatDate(dashboard.financial_year.to_date)}`} />

			<div className="row g-3 mb-4">
				{statCards.map((card) => (
					<div className="col-6 col-lg" key={card.label}>
						<div className="ob-card ob-stat h-100">
							<div className="label">{card.label}</div>
							<div className="value">{formatMoney(card.value)}</div>
							<div className="text-muted small">{card.hint}</div>
						</div>
					</div>
				))}
			</div>

			<div className="row g-3">
				<div className="col-lg-7">
					<div className="ob-card h-100">
						<h6>Monthly sales</h6>
						{dashboard.monthly_sales.length === 0 ? <div className="text-muted py-4">No sales yet</div> : <Bar data={chartData} options={{ plugins: { legend: { display: false } } }} />}
					</div>
				</div>
				<div className="col-lg-5">
					<div className="ob-card h-100">
						<h6>Recent transactions</h6>
						<table className="table table-sm table-ob mb-0">
							<tbody>
								{dashboard.recent_transactions.map((transaction) => (
									<tr key={transaction.trans_id}>
										<td><Link to={getTransLink(transaction)}>{transaction.trans_no}</Link><div className="text-muted small">{transaction.con_name}</div></td>
										<td className="text-muted small">{formatDate(transaction.trans_date)}</td>
										<td className="text-end-num">{formatMoney(transaction.tot_amount)}</td>
									</tr>
								))}
								{dashboard.recent_transactions.length === 0 && <tr><td className="text-muted">No transactions yet</td></tr>}
							</tbody>
						</table>
					</div>
				</div>
				<div className="col-12">
					<div className="ob-card">
						<h6>Low stock items</h6>
						{dashboard.low_stock_items.length === 0 ? (
							<div className="text-muted">All items are above their reorder level</div>
						) : (
							<table className="table table-sm table-ob mb-0">
								<thead><tr><th>Item</th><th className="text-end-num">In stock</th><th className="text-end-num">Reorder level</th></tr></thead>
								<tbody>
									{dashboard.low_stock_items.map((item) => (
										<tr key={item.item_id}><td>{item.name}</td><td className="text-end-num text-danger">{formatQty(item.cur_stk)}</td><td className="text-end-num">{formatQty(item.stk_level)}</td></tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>
			</div>
		</>
	);
};

export default Dashboard;
