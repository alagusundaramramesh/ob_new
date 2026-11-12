import React from "react";
import { NavLink } from "react-router-dom";
import { useGlobalState } from "../contexts/user";

/* The menu. A link is shown only when the role of the user has its module (mod_code) */
const MENU = [
	{ title: "", links: [{ to: "/", icon: "speedometer2", label: "Dashboard", mod_code: "DAS" }] },
	{
		title: "Sales",
		links: [
			{ to: "/t/sales-quote", icon: "file-earmark-text", label: "Quotes", mod_code: "SASAQ" },
			{ to: "/t/sales-order", icon: "cart-check", label: "Sales Orders", mod_code: "SASAO" },
			{ to: "/t/delivery-challan", icon: "truck", label: "Delivery Challans", mod_code: "SASDH" },
			{ to: "/t/sales-invoice", icon: "receipt", label: "Invoices", mod_code: "SASAI" },
			{ to: "/t/sales-credit-note", icon: "arrow-return-left", label: "Credit Notes", mod_code: "SASAC" },
			{ to: "/t/sales-debit-note", icon: "arrow-return-right", label: "Debit Notes", mod_code: "SASAD" },
			{ to: "/t/receipt", icon: "cash-coin", label: "Receipts", mod_code: "SASAR" },
			{ to: "/einvoice", icon: "qr-code", label: "E-invoice / E-way bill", mod_codes: ["EINV", "SAEWB"] },
			{ to: "/customers", icon: "people", label: "Customers", mod_code: "MNCUS" },
		],
	},
	{
		title: "Purchases",
		links: [
			{ to: "/t/purchase-quote", icon: "file-earmark-text", label: "Purchase Quotes", mod_code: "PUPUQ" },
			{ to: "/t/purchase-order", icon: "cart", label: "Purchase Orders", mod_code: "PUPUO" },
			{ to: "/t/goods-receipt", icon: "box-arrow-in-down", label: "Goods Receipts", mod_code: "PUPUG" },
			{ to: "/t/purchase-bill", icon: "receipt-cutoff", label: "Bills", mod_code: "PUPUB" },
			{ to: "/t/purchase-credit-note", icon: "arrow-return-left", label: "Supplier Credit Notes", mod_code: "PUPUC" },
			{ to: "/t/purchase-debit-note", icon: "arrow-return-right", label: "Supplier Debit Notes", mod_code: "PUPUD" },
			{ to: "/t/payment", icon: "wallet2", label: "Payments", mod_code: "PUPUP" },
			{ to: "/suppliers", icon: "shop", label: "Suppliers", mod_code: "MNSUP" },
		],
	},
	{
		title: "Inventory",
		links: [
			{ to: "/items", icon: "box-seam", label: "Items", mod_code: "MNITM" },
			{ to: "/categories", icon: "diagram-3", label: "Categories", mod_code: "MNITM" },
		],
	},
	{
		title: "Office Inventory",
		links: [
			{ to: "/office-assets", icon: "pc-display", label: "Office Assets", mod_code: "OIAST" },
			{ to: "/office-assignments", icon: "person-lines-fill", label: "Assignments", mod_code: "OIASG" },
		],
	},
	{
		title: "Accounting",
		links: [
			{ to: "/accounts", icon: "journal-text", label: "Chart of Accounts", mod_code: "ACCHA" },
			{ to: "/opening-balances", icon: "box-arrow-in-right", label: "Opening Balances", mod_code: "ACCHA" },
			{ to: "/recurring", icon: "arrow-repeat", label: "Recurring Invoices", mod_code: "REC" },
			{ to: "/t/journal", icon: "journal-plus", label: "Journal Entries", mod_code: "ACJRL" },
			{ to: "/t/contra", icon: "arrow-left-right", label: "Cash Contra", mod_code: "ACCCT" },
			{ to: "/banks", icon: "bank", label: "Banking", mod_code: "BAN" },
		],
	},
	{
		title: "Reports",
		links: [{ to: "/reports", icon: "bar-chart-line", label: "All Reports", mod_codes: ["RLLDG", "RADAY", "RATBL", "RAPAL", "RABAS", "RTSAR", "RTPUR", "RTOSR", "RSSTS", "RRGS1"] }],
	},
	{ title: "Settings", links: [{ to: "/settings", icon: "gear", label: "Settings", mod_code: "SET" }] },
];

const Sidebar = ({ open }) => {
	const { user } = useGlobalState();
	const permissions = user.permissions || [];

	const canOpen = (link) => {
		if (link.mod_codes) {
			return link.mod_codes.some((mod_code) => permissions.includes(mod_code));
		}
		return permissions.includes(link.mod_code);
	};

	return (
		<nav className={`ob-sidebar ${open ? "open" : ""}`}>
			<a className="brand" href="/">
				<i className="bi bi-journal-bookmark-fill me-2" />OutputBooks
			</a>
			{MENU.map((section) => {
				const visibleLinks = section.links.filter(canOpen);
				if (visibleLinks.length === 0) {
					return null;
				}
				return (
					<div key={section.title || "main"}>
						{section.title && <div className="nav-section">{section.title}</div>}
						<ul className="nav flex-column">
							{visibleLinks.map((link) => (
								<li className="nav-item" key={link.to}>
									<NavLink className="nav-link" to={link.to} end={link.to === "/"}>
										<i className={`bi bi-${link.icon}`} />
										{link.label}
									</NavLink>
								</li>
							))}
						</ul>
					</div>
				);
			})}
		</nav>
	);
};

export default Sidebar;
