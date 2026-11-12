import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
	updateCompany, fetchUserData, getTaxes, saveTax, deleteTax, getSeries, saveSeries, getPaymentModes, savePaymentMode,
	getUsers, saveUser, deleteUser, getRoles, saveRole, getBanks, savePrintSettings, saveCompanyLogo, deleteCompanyLogo,
	getFileUrl, getTransactions, getTransactionPdf, getPriceLists, savePriceList, deletePriceList, getItems,
	saveReminderSettings, getReminderLog, getEinvoiceSettings, saveEinvoiceSettings, getTransporters, saveTransporter, deleteTransporter,
} from "../services/api";
import { STATES } from "../utils/format";
import { useGlobalState, useGlobalDispatch } from "../contexts/user";
import PageHeader from "../components/page_header";
import Modal from "../components/modal";

const TABS = [
	{ key: "company", label: "Company" },
	{ key: "print", label: "Print & logo" },
	{ key: "taxes", label: "Taxes" },
	{ key: "price_lists", label: "Price lists" },
	{ key: "reminders", label: "Reminders" },
	{ key: "einvoice", label: "E-invoice" },
	{ key: "series", label: "Numbering" },
	{ key: "payment_modes", label: "Payment modes" },
	{ key: "users", label: "Users" },
	{ key: "roles", label: "Roles" },
];

/* ---------------------------------------------------------------- Company */
const CompanyTab = () => {
	const { user } = useGlobalState();
	const dispatch = useGlobalDispatch();
	const [form, setForm] = useState({ ...user.company, locked_till: user.company.locked_till ? user.company.locked_till.slice(0, 10) : "" });

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setForm({ ...form, [name]: type === "checkbox" ? checked : value });
	};

	async function handleSave(e) {
		e.preventDefault();
		const result = await updateCompany({ ...form, locked_till: form.locked_till || null });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		const userResult = await fetchUserData();
		if (userResult.status === "S") dispatch({ type: "SET_USER", payload: userResult.data });
	}

	return (
		<form onSubmit={handleSave} className="row g-3">
			<div className="col-md-6"><label className="form-label">Company name *</label><input className="form-control" name="name" value={form.name} onChange={handleChange} required /></div>
			<div className="col-md-6"><label className="form-label">GSTIN</label><input className="form-control" name="tax_no" value={form.tax_no || ""} onChange={handleChange} maxLength={15} /></div>
			<div className="col-md-6"><label className="form-label">Address line 1</label><input className="form-control" name="address1" value={form.address1 || ""} onChange={handleChange} /></div>
			<div className="col-md-6"><label className="form-label">Address line 2</label><input className="form-control" name="address2" value={form.address2 || ""} onChange={handleChange} /></div>
			<div className="col-md-4"><label className="form-label">City</label><input className="form-control" name="city" value={form.city || ""} onChange={handleChange} /></div>
			<div className="col-md-4">
				<label className="form-label">State (decides CGST + SGST or IGST)</label>
				<select className="form-select" name="state_code" value={form.state_code || ""} onChange={handleChange}>
					<option value="">-</option>
					{STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
				</select>
			</div>
			<div className="col-md-4"><label className="form-label">PIN code</label><input className="form-control" name="zip" value={form.zip || ""} onChange={handleChange} /></div>
			<div className="col-md-4"><label className="form-label">Email</label><input type="email" className="form-control" name="email" value={form.email || ""} onChange={handleChange} /></div>
			<div className="col-md-4"><label className="form-label">Phone</label><input className="form-control" name="phone" value={form.phone || ""} onChange={handleChange} /></div>
			<div className="col-md-4"><label className="form-label">Currency</label><input className="form-control" name="currency" value={form.currency || "INR"} onChange={handleChange} maxLength={3} /></div>
			<div className="col-md-4"><label className="form-label">Financial year starts in month</label><input type="number" min="1" max="12" className="form-control" name="fy_start" value={form.fy_start || 4} onChange={handleChange} /></div>
			<div className="col-md-4"><label className="form-label">Lock books till</label><input type="date" className="form-control" name="locked_till" value={form.locked_till} onChange={handleChange} /><div className="form-text">Nothing can be added or changed on or before this date</div></div>
			<div className="col-md-4 d-flex align-items-center">
				<div className="form-check">
					<input className="form-check-input" type="checkbox" id="allow_negative_stock" name="allow_negative_stock" checked={form.allow_negative_stock !== false} onChange={handleChange} />
					<label className="form-check-label" htmlFor="allow_negative_stock">Allow negative stock</label>
				</div>
			</div>
			<div className="col-md-4">
				<label className="form-label">GST scheme</label>
				<select className="form-select" name="gst_scheme" value={form.gst_scheme || "REGULAR"} onChange={handleChange}>
					<option value="REGULAR">Regular (GSTR-1, GSTR-3B)</option>
					<option value="COMPOSITION">Composition (CMP-08, GSTR-4)</option>
				</select>
			</div>
			{form.gst_scheme === "COMPOSITION" && (
				<div className="col-md-4">
					<label className="form-label">Composition tax rate (% of turnover)</label>
					<input type="number" step="0.01" min="0" className="form-control" name="composition_rate" value={form.composition_rate || 1} onChange={handleChange} />
					<div className="form-text">1% traders and manufacturers, 5% restaurants, 6% other services. No GST can be charged on bills.</div>
				</div>
			)}
			<div className="col-12"><button className="btn btn-primary">Save</button></div>
		</form>
	);
};

/* ---------------------------------------------------------------- Print and logo */
const TEMPLATE_INFO = {
	classic: "Classic - simple lines, colour on the title",
	modern: "Modern - coloured header band and table header",
	compact: "Compact - smaller text, fits more items on a page",
};

const PrintTab = () => {
	const { user } = useGlobalState();
	const dispatch = useGlobalDispatch();
	const [banks, setBanks] = useState([]);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({
		template: "classic", accent_color: "#0d6efd", footer_text: "", terms: "", show_bank: false, bank_id: 0, show_signature: true,
		...(user.company.print_settings || {}),
	});

	useEffect(() => {
		async function loadBanks() {
			const result = await getBanks();
			if (result.status === "S") setBanks(result.data);
		}
		loadBanks();
	}, []);

	async function refreshUser() {
		const result = await fetchUserData();
		if (result.status === "S") dispatch({ type: "SET_USER", payload: result.data });
	}

	async function handleSave(e) {
		e.preventDefault();
		setSaving(true);
		const result = await savePrintSettings({ ...form, bank_id: parseInt(form.bank_id) || 0 });
		setSaving(false);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		refreshUser();
	}

	// The image is sent to the server as a data url. The server checks the type, so only the size is checked here
	function handleLogoFile(e) {
		const file = e.target.files[0];
		e.target.value = "";
		if (!file) return;
		if (file.size > 500 * 1024) { toast.error("The logo must be smaller than 500 KB"); return; }
		const reader = new FileReader();
		reader.onload = async () => {
			const result = await saveCompanyLogo(reader.result);
			if (result.status !== "S") { toast.error(result.message || "Unable to save the logo"); return; }
			toast.success(result.message);
			refreshUser();
		};
		reader.readAsDataURL(file);
	}

	async function handleLogoRemove() {
		const result = await deleteCompanyLogo();
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		refreshUser();
	}

	// Opens the PDF of the latest invoice with the SAVED settings
	async function previewPdf() {
		const list = await getTransactions({ trans_type: "SI", limit: 1 });
		if (list.status !== "S" || list.data.length === 0) { toast.info("Create an invoice first to see a preview"); return; }
		const result = await getTransactionPdf(list.data[0].trans_id);
		if (result.status !== "S") { toast.error(result.message || "Unable to create the PDF"); return; }
		window.open(URL.createObjectURL(result.blob), "_blank");
	}

	const logoFile = user.company.logo_file;

	return (
		<div className="row g-4">
			<div className="col-lg-4">
				<h6>Logo</h6>
				<div className="border rounded d-flex align-items-center justify-content-center mb-2" style={{ height: 120, background: "#fafafa" }}>
					{logoFile ? <img src={getFileUrl(`/uploads/logos/${logoFile}`)} alt="Company logo" style={{ maxHeight: 100, maxWidth: "90%" }} /> : <span className="text-muted">No logo</span>}
				</div>
				<input type="file" accept="image/png,image/jpeg" className="form-control mb-2" onChange={handleLogoFile} />
				<div className="form-text mb-2">PNG or JPEG, up to 500 KB. A square or wide image works best.</div>
				{logoFile && <button className="btn btn-sm btn-outline-danger" onClick={handleLogoRemove}>Remove logo</button>}
			</div>
			<form className="col-lg-8" onSubmit={handleSave}>
				<h6>Template</h6>
				{Object.keys(TEMPLATE_INFO).map((template) => (
					<div className="form-check mb-1" key={template}>
						<input className="form-check-input" type="radio" name="template" id={`template_${template}`} checked={form.template === template} onChange={() => setForm({ ...form, template })} />
						<label className="form-check-label" htmlFor={`template_${template}`}>{TEMPLATE_INFO[template]}</label>
					</div>
				))}
				<div className="row g-3 mt-1">
					<div className="col-md-4"><label className="form-label">Accent colour</label><input type="color" className="form-control form-control-color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} /></div>
					<div className="col-md-8"><label className="form-label">Footer text</label><input className="form-control" maxLength={120} value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} placeholder="Thank you for your business" /></div>
					<div className="col-12"><label className="form-label">Terms and conditions</label><textarea className="form-control" rows="3" maxLength={1000} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>
					<div className="col-md-6">
						<div className="form-check">
							<input className="form-check-input" type="checkbox" id="show_bank" checked={form.show_bank} onChange={(e) => setForm({ ...form, show_bank: e.target.checked })} />
							<label className="form-check-label" htmlFor="show_bank">Print bank details</label>
						</div>
					</div>
					<div className="col-md-6">
						<select className="form-select" disabled={!form.show_bank} value={form.bank_id || 0} onChange={(e) => setForm({ ...form, bank_id: e.target.value })}>
							<option value={0}>First bank account</option>
							{banks.map((bank) => <option key={bank.bank_id} value={bank.bank_id}>{bank.bank_name} - {bank.acc_number}</option>)}
						</select>
					</div>
					<div className="col-12">
						<div className="form-check">
							<input className="form-check-input" type="checkbox" id="show_signature" checked={form.show_signature} onChange={(e) => setForm({ ...form, show_signature: e.target.checked })} />
							<label className="form-check-label" htmlFor="show_signature">Print "Authorised signatory" line</label>
						</div>
					</div>
				</div>
				<div className="mt-3">
					<button className="btn btn-primary me-2" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
					<button type="button" className="btn btn-outline-secondary" onClick={previewPdf}><i className="bi bi-file-earmark-pdf me-1" />Preview with the latest invoice</button>
				</div>
			</form>
		</div>
	);
};

/* ---------------------------------------------------------------- Price lists */
const PriceListsTab = () => {
	const [priceLists, setPriceLists] = useState([]);
	const [items, setItems] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => {
		loadPriceLists();
		async function loadItems() {
			const result = await getItems({ limit: 500, is_active: true });
			if (result.status === "S") setItems(result.data);
		}
		loadItems();
	}, []);

	async function loadPriceLists() {
		const result = await getPriceLists();
		if (result.status === "S") setPriceLists(result.data);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await savePriceList({
			...editing,
			adjust_percent: Number(editing.adjust_percent) || 0,
			valid_from: editing.valid_from || null,
			valid_till: editing.valid_till || null,
			rates: editing.rates.filter((priceItem) => priceItem.item_id).map((priceItem) => ({
					item_id: Number(priceItem.item_id), rate: Number(priceItem.rate),
					slabs: (priceItem.slabs || []).filter((slab) => Number(slab.min_qty) > 0).map((slab) => ({ min_qty: Number(slab.min_qty), rate: Number(slab.rate) })),
				})),
		});
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setEditing(null);
		loadPriceLists();
	}

	async function handleDelete(priceList) {
		if (!window.confirm(`Delete ${priceList.name}?`)) return;
		const result = await deletePriceList(priceList.price_list_id);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		loadPriceLists();
	}

	const updateRate = (index, changes) => setEditing({ ...editing, rates: editing.rates.map((priceItem, rateIndex) => (rateIndex === index ? { ...priceItem, ...changes } : priceItem)) });
	const toDay = (value) => (value ? String(value).slice(0, 10) : "");

	return (
		<>
			<div className="d-flex justify-content-between mb-2">
				<div className="text-muted">A price list changes the rates for the customers (sales) or suppliers (purchase) that use it. Choose the list in the contact.</div>
				<button className="btn btn-primary" onClick={() => setEditing({ price_list_id: 0, name: "", list_type: "S", adjust_percent: 0, rates: [], valid_from: "", valid_till: "", is_active: true })}>New price list</button>
			</div>
			<table className="table table-ob align-middle">
				<thead><tr><th>Name</th><th>For</th><th>Change</th><th>Fixed rates</th><th>Valid</th><th /></tr></thead>
				<tbody>
					{priceLists.map((priceList) => (
						<tr key={priceList.price_list_id} className={priceList.is_active ? "" : "text-muted"}>
							<td>{priceList.name}</td>
							<td>{priceList.list_type === "S" ? "Customers" : "Suppliers"}</td>
							<td>{priceList.adjust_percent > 0 ? "+" : ""}{priceList.adjust_percent}%</td>
							<td>{priceList.rates.length} items</td>
							<td className="small">{toDay(priceList.valid_from) || "any time"} to {toDay(priceList.valid_till) || "any time"}</td>
							<td className="text-end text-nowrap">
								<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...priceList, valid_from: toDay(priceList.valid_from), valid_till: toDay(priceList.valid_till) })}>Edit</button>
								<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(priceList)}>Delete</button>
							</td>
						</tr>
					))}
					{priceLists.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-3">No price lists yet</td></tr>}
				</tbody>
			</table>

			{editing && (
				<Modal title={editing.price_list_id ? "Edit price list" : "New price list"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="row g-3 mb-3">
							<div className="col-md-6"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
							<div className="col-md-3">
								<label className="form-label">For</label>
								<select className="form-select" value={editing.list_type} onChange={(e) => setEditing({ ...editing, list_type: e.target.value })}>
									<option value="S">Customers</option><option value="P">Suppliers</option>
								</select>
							</div>
							<div className="col-md-3"><label className="form-label">Change all rates by %</label><input type="number" step="0.01" className="form-control" value={editing.adjust_percent} onChange={(e) => setEditing({ ...editing, adjust_percent: e.target.value })} /><div className="form-text">-10 = 10% cheaper</div></div>
							<div className="col-md-4"><label className="form-label">Valid from</label><input type="date" className="form-control" value={editing.valid_from} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} /></div>
							<div className="col-md-4"><label className="form-label">Valid till</label><input type="date" className="form-control" value={editing.valid_till} onChange={(e) => setEditing({ ...editing, valid_till: e.target.value })} /></div>
							<div className="col-md-4 d-flex align-items-end">
								<div className="form-check">
									<input className="form-check-input" type="checkbox" id="list_active" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
									<label className="form-check-label" htmlFor="list_active">Active</label>
								</div>
							</div>
						</div>
						<h6>Fixed rates (they win over the percent)</h6>
						<table className="table table-sm align-middle">
							<tbody>
								{editing.rates.map((priceItem, index) => (
									<React.Fragment key={index}>
										<tr>
											<td>
												<select className="form-select form-select-sm" value={priceItem.item_id} onChange={(e) => updateRate(index, { item_id: parseInt(e.target.value) })}>
													<option value={0}>Select item</option>
													{items.map((item) => <option key={item.item_id} value={item.item_id}>{item.name}</option>)}
												</select>
											</td>
											<td style={{ width: 140 }}><input type="number" step="0.01" min="0" className="form-control form-control-sm" value={priceItem.rate} onChange={(e) => updateRate(index, { rate: e.target.value })} /></td>
											<td style={{ width: 40 }}><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setEditing({ ...editing, rates: editing.rates.filter((entry, rateIndex) => rateIndex !== index) })}><i className="bi bi-x-lg" /></button></td>
										</tr>
										<tr>
											<td colSpan="3" className="border-0 pt-0 ps-4">
												{(priceItem.slabs || []).map((slab, slabIndex) => (
													<div key={slabIndex} className="d-flex align-items-center gap-2 mb-1 small">
														<span>From quantity</span>
														<input type="number" step="any" min="0" className="form-control form-control-sm" style={{ width: 90 }} value={slab.min_qty} onChange={(e) => updateRate(index, { slabs: priceItem.slabs.map((entry, entryIndex) => (entryIndex === slabIndex ? { ...entry, min_qty: e.target.value } : entry)) })} />
														<span>rate</span>
														<input type="number" step="0.01" min="0" className="form-control form-control-sm" style={{ width: 110 }} value={slab.rate} onChange={(e) => updateRate(index, { slabs: priceItem.slabs.map((entry, entryIndex) => (entryIndex === slabIndex ? { ...entry, rate: e.target.value } : entry)) })} />
														<button type="button" className="btn btn-sm btn-outline-danger" onClick={() => updateRate(index, { slabs: priceItem.slabs.filter((entry, entryIndex) => entryIndex !== slabIndex) })}><i className="bi bi-x-lg" /></button>
													</div>
												))}
												<button type="button" className="btn btn-link btn-sm p-0" onClick={() => updateRate(index, { slabs: [...(priceItem.slabs || []), { min_qty: "", rate: priceItem.rate }] })}>+ Add quantity slab (bigger quantity, other rate)</button>
											</td>
										</tr>
									</React.Fragment>
								))}
							</tbody>
						</table>
						<button type="button" className="btn btn-sm btn-outline-primary mb-3" onClick={() => setEditing({ ...editing, rates: [...editing.rates, { item_id: 0, rate: 0 }] })}><i className="bi bi-plus-lg me-1" />Add item rate</button>
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

/* ---------------------------------------------------------------- Payment reminders */
const RemindersTab = () => {
	const { user } = useGlobalState();
	const dispatch = useGlobalDispatch();
	const [form, setForm] = useState({ enabled: false, before_due_days: 3, overdue_repeat_days: 7, max_overdue_reminders: 3, ...(user.company.reminder_settings || {}) });
	const [log, setLog] = useState([]);

	useEffect(() => {
		async function loadLog() {
			const result = await getReminderLog();
			if (result.status === "S") setLog(result.data);
		}
		loadLog();
	}, []);

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveReminderSettings(form);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		const userResult = await fetchUserData();
		if (userResult.status === "S") dispatch({ type: "SET_USER", payload: userResult.data });
	}

	return (
		<div className="row g-4">
			<form className="col-lg-5" onSubmit={handleSave}>
				<div className="form-check form-switch mb-3">
					<input className="form-check-input" type="checkbox" id="reminders_enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
					<label className="form-check-label" htmlFor="reminders_enabled">Send payment reminders automatically (every day at 09:30)</label>
				</div>
				<div className="mb-3">
					<label className="form-label">Remind this many days before the due date</label>
					<input type="number" min="0" max="60" className="form-control" value={form.before_due_days} onChange={(e) => setForm({ ...form, before_due_days: e.target.value })} />
					<div className="form-text">0 = no reminder before the due date</div>
				</div>
				<div className="mb-3">
					<label className="form-label">After the due date, repeat every (days)</label>
					<input type="number" min="0" max="90" className="form-control" value={form.overdue_repeat_days} onChange={(e) => setForm({ ...form, overdue_repeat_days: e.target.value })} />
					<div className="form-text">0 = no reminder after the due date</div>
				</div>
				<div className="mb-3">
					<label className="form-label">Maximum reminders for an overdue invoice</label>
					<input type="number" min="1" max="20" className="form-control" value={form.max_overdue_reminders} onChange={(e) => setForm({ ...form, max_overdue_reminders: e.target.value })} />
				</div>
				<button className="btn btn-primary">Save</button>
				<div className="form-text mt-2">Customers need an email address. A customer can be excluded in the customer form. The invoice PDF is attached. The server needs the SMTP settings.</div>
			</form>
			<div className="col-lg-7">
				<h6>Latest reminders</h6>
				<table className="table table-sm table-ob">
					<thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th>Sent to</th><th>Result</th></tr></thead>
					<tbody>
						{log.map((entry) => (
							<tr key={entry.reminder_id}>
								<td>{new Date(entry.sent_on).toLocaleString()}</td><td>{entry.trans_no}</td><td>{entry.kind}</td><td>{entry.sent_to}</td>
								<td>{entry.status === "sent" ? <span className="badge bg-success">Sent</span> : <span className="badge bg-danger" title={entry.error}>Failed</span>}</td>
							</tr>
						))}
						{log.length === 0 && <tr><td colSpan="5" className="text-center text-muted">No reminders sent yet</td></tr>}
					</tbody>
				</table>
			</div>
		</div>
	);
};

/* ---------------------------------------------------------------- E-invoice and e-way bill */
const EinvoiceTab = () => {
	const [info, setInfo] = useState(null);
	const [form, setForm] = useState({ enabled: false, mode: "sandbox", ewb_only: false, api_username: "", api_password: "" });
	const [transporters, setTransporters] = useState([]);
	const [newTransporter, setNewTransporter] = useState({ name: "", gstin: "" });

	useEffect(() => {
		loadSettings();
		loadTransporters();
	}, []);

	async function loadSettings() {
		const result = await getEinvoiceSettings();
		if (result.status !== "S") return;
		setInfo(result.data);
		setForm({ enabled: result.data.enabled, mode: result.data.mode, ewb_only: result.data.ewb_only, api_username: result.data.api_username, api_password: "" });
	}

	async function loadTransporters() {
		const result = await getTransporters();
		if (result.status === "S") setTransporters(result.data);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveEinvoiceSettings(form);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		loadSettings();
	}

	async function addTransporter(e) {
		e.preventDefault();
		const result = await saveTransporter(newTransporter);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setNewTransporter({ name: "", gstin: "" });
		loadTransporters();
	}

	async function removeTransporter(transporter) {
		const result = await deleteTransporter(transporter.tp_id);
		if (result.status !== "S") { toast.error(result.message); return; }
		loadTransporters();
	}

	if (!info) return <div className="text-muted">Loading...</div>;

	return (
		<div className="row g-4">
			<form className="col-lg-6" onSubmit={handleSave}>
				{!info.provider_is_live && (
					<div className="alert alert-danger small">
						<strong>Test provider.</strong> The server is not connected to the IRP, so every IRN and e-way bill is a <strong>test</strong> (marked TEST on the PDF) and has no legal value.
						To go live set <code>EINV_PROVIDER=taxpro</code> with your TaxPro (ASP) id and password in the server <code>.env</code>.
					</div>
				)}
				{info.provider_is_live && <div className="alert alert-info small">Connected provider: <strong>{info.provider}</strong>. Try the sandbox mode first.</div>}
				{!info.gstin_is_valid && <div className="alert alert-warning small">Enter a valid GSTIN of the company in the Company tab first.</div>}

				<div className="form-check form-switch mb-3">
					<input className="form-check-input" type="checkbox" id="einv_enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
					<label className="form-check-label" htmlFor="einv_enabled">Use e-invoice and e-way bill</label>
				</div>
				<div className="mb-3">
					<label className="form-label">Mode</label>
					<select className="form-select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
						<option value="sandbox">Sandbox (test portal)</option>
						<option value="production">Production (real documents)</option>
					</select>
				</div>
				<div className="form-check mb-3">
					<input className="form-check-input" type="checkbox" id="einv_ewb_only" checked={form.ewb_only} onChange={(e) => setForm({ ...form, ewb_only: e.target.checked })} />
					<label className="form-check-label" htmlFor="einv_ewb_only">My company needs only e-way bills (no e-invoice)</label>
				</div>
				<div className="mb-3"><label className="form-label">GST portal API user name</label><input className="form-control" autoComplete="off" value={form.api_username} onChange={(e) => setForm({ ...form, api_username: e.target.value })} /></div>
				<div className="mb-3">
					<label className="form-label">GST portal API password</label>
					<input type="password" className="form-control" autoComplete="new-password" placeholder={info.has_password ? "Saved. Leave empty to keep it" : ""} value={form.api_password} onChange={(e) => setForm({ ...form, api_password: e.target.value })} />
					<div className="form-text">The password is stored encrypted on the server and is never shown again.</div>
				</div>
				<button className="btn btn-primary">Save</button>
			</form>

			<div className="col-lg-6">
				<h6>Transporters (for the e-way bill)</h6>
				<table className="table table-sm table-ob">
					<tbody>
						{transporters.map((transporter) => (
							<tr key={transporter.tp_id}><td>{transporter.name}</td><td>{transporter.gstin}</td><td className="text-end"><button className="btn btn-sm btn-outline-danger" onClick={() => removeTransporter(transporter)}>Delete</button></td></tr>
						))}
						{transporters.length === 0 && <tr><td className="text-muted">No transporters yet</td></tr>}
					</tbody>
				</table>
				<form className="d-flex gap-2" onSubmit={addTransporter}>
					<input className="form-control" placeholder="Name" value={newTransporter.name} onChange={(e) => setNewTransporter({ ...newTransporter, name: e.target.value })} required />
					<input className="form-control" placeholder="Transporter GSTIN" maxLength={15} value={newTransporter.gstin} onChange={(e) => setNewTransporter({ ...newTransporter, gstin: e.target.value })} required />
					<button className="btn btn-primary">Add</button>
				</form>
			</div>
		</div>
	);
};

/* ---------------------------------------------------------------- Taxes */
const TaxesTab = () => {
	const [taxes, setTaxes] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => { loadTaxes(); }, []);
	async function loadTaxes() {
		const result = await getTaxes();
		if (result.status === "S") setTaxes(result.data);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveTax(editing);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setEditing(null);
		loadTaxes();
	}

	async function handleDelete(tax) {
		if (!window.confirm(`Delete ${tax.name}?`)) return;
		const result = await deleteTax(tax.tax_id);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		loadTaxes();
	}

	const updateDetail = (index, changes) => setEditing({ ...editing, details: editing.details.map((detail, detailIndex) => (detailIndex === index ? { ...detail, ...changes } : detail)) });

	return (
		<>
			<div className="d-flex justify-content-between mb-2">
				<div className="text-muted">A tax is a group of parts. Inside the state the "In state" parts apply (CGST + SGST), outside the state the "Other state" parts apply (IGST).</div>
				<button className="btn btn-primary" onClick={() => setEditing({ tax_id: 0, name: "", tax_code: "", is_default: false, details: [{ tax_type_code: "CGST", tax_rate: 0, state_type: "I" }, { tax_type_code: "SGST", tax_rate: 0, state_type: "I" }, { tax_type_code: "IGST", tax_rate: 0, state_type: "X" }] })}>New tax</button>
			</div>
			<table className="table table-ob">
				<thead><tr><th>Name</th><th>Parts</th><th /></tr></thead>
				<tbody>
					{taxes.map((tax) => (
						<tr key={tax.tax_id}>
							<td>{tax.name}{tax.is_default && <span className="badge bg-light text-dark ms-2">Default</span>}</td>
							<td>{tax.details.map((detail) => `${detail.tax_type_code} ${detail.tax_rate}%`).join(", ")}</td>
							<td className="text-end text-nowrap">
								<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...tax })}>Edit</button>
								<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(tax)}>Delete</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{editing && (
				<Modal title={editing.tax_id ? "Edit tax" : "New tax"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="row g-3 mb-3">
							<div className="col-md-8"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
							<div className="col-md-4"><label className="form-label">Code</label><input className="form-control" value={editing.tax_code || ""} onChange={(e) => setEditing({ ...editing, tax_code: e.target.value })} /></div>
						</div>
						<table className="table table-sm">
							<thead><tr><th>Tax type</th><th>Rate %</th><th>Applies</th></tr></thead>
							<tbody>
								{editing.details.map((detail, index) => (
									<tr key={index}>
										<td>{detail.tax_type_code}</td>
										<td><input type="number" step="0.01" min="0" className="form-control form-control-sm" value={detail.tax_rate} onChange={(e) => updateDetail(index, { tax_rate: e.target.value })} /></td>
										<td>{detail.state_type === "I" ? "In state" : detail.state_type === "X" ? "Other state" : "Always"}</td>
									</tr>
								))}
							</tbody>
						</table>
						<div className="form-check mb-3">
							<input className="form-check-input" type="checkbox" id="tax_default" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
							<label className="form-check-label" htmlFor="tax_default">Default tax</label>
						</div>
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

/* ---------------------------------------------------------------- Numbering */
const SeriesTab = () => {
	const [series, setSeries] = useState([]);

	useEffect(() => { loadSeries(); }, []);
	async function loadSeries() {
		const result = await getSeries();
		if (result.status === "S") setSeries(result.data);
	}

	async function handleSave(row) {
		const result = await saveSeries(row);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		loadSeries();
	}

	const updateRow = (series_id, changes) => setSeries(series.map((row) => (row.series_id === series_id ? { ...row, ...changes } : row)));

	return (
		<table className="table table-ob align-middle">
			<thead><tr><th>Document</th><th>Prefix</th><th>Next number</th><th>Suffix</th><th>Next document number</th><th /></tr></thead>
			<tbody>
				{series.map((row) => (
					<tr key={row.series_id}>
						<td>{row.trans_type}</td>
						<td><input className="form-control form-control-sm" value={row.prefix} onChange={(e) => updateRow(row.series_id, { prefix: e.target.value })} /></td>
						<td><input type="number" min="1" className="form-control form-control-sm" value={row.nxt_number} onChange={(e) => updateRow(row.series_id, { nxt_number: e.target.value })} /></td>
						<td><input className="form-control form-control-sm" value={row.suffix || ""} onChange={(e) => updateRow(row.series_id, { suffix: e.target.value })} /></td>
						<td className="text-muted">{row.prefix}{row.nxt_number}{row.suffix}</td>
						<td><button className="btn btn-sm btn-outline-primary" onClick={() => handleSave(row)}>Save</button></td>
					</tr>
				))}
			</tbody>
		</table>
	);
};

/* ---------------------------------------------------------------- Payment modes */
const PaymentModesTab = () => {
	const [modes, setModes] = useState([]);
	const [newMode, setNewMode] = useState({ name: "", acc_group_code: "BA" });

	useEffect(() => { loadModes(); }, []);
	async function loadModes() {
		const result = await getPaymentModes();
		if (result.status === "S") setModes(result.data);
	}

	async function handleSave(mode) {
		const result = await savePaymentMode(mode);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setNewMode({ name: "", acc_group_code: "BA" });
		loadModes();
	}

	return (
		<>
			<table className="table table-ob align-middle">
				<thead><tr><th>Name</th><th>Goes to</th><th>Active</th></tr></thead>
				<tbody>
					{modes.map((mode) => (
						<tr key={mode.pay_mode_id}>
							<td>{mode.name}</td>
							<td>{mode.acc_group_code === "CH" ? "Cash" : "Bank"}</td>
							<td><input type="checkbox" className="form-check-input" checked={mode.is_active} onChange={(e) => handleSave({ ...mode, is_active: e.target.checked })} /></td>
						</tr>
					))}
				</tbody>
			</table>
			<form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSave(newMode); }}>
				<input className="form-control" placeholder="New payment mode" value={newMode.name} onChange={(e) => setNewMode({ ...newMode, name: e.target.value })} required />
				<select className="form-select" style={{ maxWidth: 160 }} value={newMode.acc_group_code} onChange={(e) => setNewMode({ ...newMode, acc_group_code: e.target.value })}>
					<option value="BA">Bank</option><option value="CH">Cash</option>
				</select>
				<button className="btn btn-primary">Add</button>
			</form>
		</>
	);
};

/* ---------------------------------------------------------------- Users */
const UsersTab = () => {
	const [users, setUsers] = useState([]);
	const [roles, setRoles] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => {
		loadUsers();
		async function loadRoles() {
			const result = await getRoles();
			if (result.status === "S") setRoles(result.data);
		}
		loadRoles();
	}, []);

	async function loadUsers() {
		const result = await getUsers();
		if (result.status === "S") setUsers(result.data);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveUser({ ...editing, role_id: parseInt(editing.role_id) });
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setEditing(null);
		loadUsers();
	}

	async function handleRemove(user) {
		if (!window.confirm(`Remove ${user.name} from this company?`)) return;
		const result = await deleteUser(user.user_id);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		loadUsers();
	}

	return (
		<>
			<div className="text-end mb-2"><button className="btn btn-primary" onClick={() => setEditing({ user_id: 0, name: "", email: "", phone: "", password: "", role_id: roles.length ? roles[0].role_id : 0 })}>Add user</button></div>
			<table className="table table-ob align-middle">
				<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th /></tr></thead>
				<tbody>
					{users.map((user) => (
						<tr key={user.user_id}>
							<td>{user.name}{user.is_prime_user && <span className="badge bg-light text-dark ms-2">Primary</span>}</td>
							<td>{user.email}</td><td>{user.role_name}</td>
							<td className="small text-muted">{user.last_login ? new Date(user.last_login).toLocaleString() : "-"}</td>
							<td className="text-end text-nowrap">
								<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...user, password: "" })}>Edit</button>
								{!user.is_prime_user && <button className="btn btn-sm btn-outline-danger" onClick={() => handleRemove(user)}>Remove</button>}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{editing && (
				<Modal title={editing.user_id ? "Edit user" : "Add user"} onClose={() => setEditing(null)} size="md">
					<form onSubmit={handleSave}>
						<div className="mb-3"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">Email *</label><input type="email" className="form-control" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required disabled={!!editing.user_id} /></div>
						<div className="mb-3"><label className="form-label">Phone</label><input className="form-control" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
						<div className="mb-3"><label className="form-label">{editing.user_id ? "New password (leave empty to keep)" : "Password *"}</label><input type="password" minLength={6} className="form-control" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} required={!editing.user_id} /></div>
						<div className="mb-3">
							<label className="form-label">Role *</label>
							<select className="form-select" value={editing.role_id} onChange={(e) => setEditing({ ...editing, role_id: e.target.value })}>
								{roles.map((role) => <option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}
							</select>
						</div>
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

/* ---------------------------------------------------------------- Roles */
const RolesTab = () => {
	const [roles, setRoles] = useState([]);
	const [modules, setModules] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => { loadRoles(); }, []);
	async function loadRoles() {
		const result = await getRoles();
		if (result.status === "S") {
			setRoles(result.data);
			setModules(result.modules);
		}
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveRole(editing);
		if (result.status !== "S") { toast.error(result.message || "Unable to save"); return; }
		toast.success(result.message);
		setEditing(null);
		loadRoles();
	}

	const toggleModule = (mod_code) => {
		const permissions = editing.permissions.includes(mod_code) ? editing.permissions.filter((code) => code !== mod_code) : [...editing.permissions, mod_code];
		setEditing({ ...editing, permissions });
	};

	return (
		<>
			<div className="text-end mb-2"><button className="btn btn-primary" onClick={() => setEditing({ role_id: 0, role_name: "", permissions: [] })}>New role</button></div>
			<table className="table table-ob align-middle">
				<thead><tr><th>Role</th><th>Modules</th><th /></tr></thead>
				<tbody>
					{roles.map((role) => (
						<tr key={role.role_id}>
							<td>{role.role_name}</td>
							<td>{role.role_code === "C" ? "All modules" : `${role.permissions.length} modules`}</td>
							<td className="text-end">{role.role_code !== "C" && <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing({ ...role })}>Edit</button>}</td>
						</tr>
					))}
				</tbody>
			</table>
			{editing && (
				<Modal title={editing.role_id ? "Edit role" : "New role"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="mb-3"><label className="form-label">Role name *</label><input className="form-control" value={editing.role_name} onChange={(e) => setEditing({ ...editing, role_name: e.target.value })} required /></div>
						<div className="row">
							{modules.map((module) => (
								<div className="col-md-6" key={module.mod_code}>
									<div className="form-check">
										<input className="form-check-input" type="checkbox" id={`mod_${module.mod_code}`} checked={editing.permissions.includes(module.mod_code)} onChange={() => toggleModule(module.mod_code)} />
										<label className="form-check-label" htmlFor={`mod_${module.mod_code}`}>{module.mod_name}</label>
									</div>
								</div>
							))}
						</div>
						<div className="text-end mt-3">
							<button type="button" className="btn btn-light me-2" onClick={() => setEditing(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
};

const Settings = () => {
	const [activeTab, setActiveTab] = useState("company");

	useEffect(() => {
		document.title = "Settings - OutputBooks";
	}, []);

	return (
		<>
			<PageHeader title="Settings" />
			<ul className="nav nav-tabs mb-3">
				{TABS.map((tab) => (
					<li className="nav-item" key={tab.key}>
						<button className={`nav-link ${activeTab === tab.key ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
					</li>
				))}
			</ul>
			<div className="ob-card">
				{activeTab === "company" && <CompanyTab />}
				{activeTab === "print" && <PrintTab />}
				{activeTab === "taxes" && <TaxesTab />}
				{activeTab === "price_lists" && <PriceListsTab />}
				{activeTab === "reminders" && <RemindersTab />}
				{activeTab === "einvoice" && <EinvoiceTab />}
				{activeTab === "series" && <SeriesTab />}
				{activeTab === "payment_modes" && <PaymentModesTab />}
				{activeTab === "users" && <UsersTab />}
				{activeTab === "roles" && <RolesTab />}
			</div>
		</>
	);
};

export default Settings;
