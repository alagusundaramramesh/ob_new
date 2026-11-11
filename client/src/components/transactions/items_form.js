import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { getContacts, getItems, getTaxes, getPaymentModes, getPriceLists, saveTransaction } from "../../services/api";
import { getListRate, isListValid } from "../../utils/price_list";
import { calculateTotals } from "../../utils/tax_calc";
import { formatMoney, toInputDate, STATES } from "../../utils/format";
import { useGlobalState } from "../../contexts/user";
import PageHeader from "../page_header";

const EMPTY_LINE = { item_id: 0, item_name: "", qty: 1, rate: 0, disc_percentage: 0, tax_id: 0, unit: "", hs: "" };

/* Form of every document with items: quotes, orders, invoices, bills, credit / debit notes ... */
const ItemsForm = ({ transType, existing }) => {
	const { user } = useGlobalState();
	const navigate = useNavigate();
	const isSales = transType.side === "S";
	const canTakePayment = transType.type === "SI" || transType.type === "PI";

	const [contacts, setContacts] = useState([]);
	const [items, setItems] = useState([]);
	const [taxes, setTaxes] = useState([]);
	const [payAccounts, setPayAccounts] = useState([]);
	const [saving, setSaving] = useState(false);
	const [priceLists, setPriceLists] = useState([]);
	const [form, setForm] = useState({
		trans_id: existing ? existing.trans_id : 0,
		con_id: existing ? existing.con_id : 0,
		trans_date: toInputDate(existing ? existing.trans_date : null),
		due_date: existing && existing.due_date ? toInputDate(existing.due_date) : "",
		ref: existing ? existing.ref : "",
		notes: existing ? existing.notes : "",
		dst_state_code: existing ? existing.dst_state_code : "",
		include_tax: existing ? existing.include_tax : false,
		lines: existing
			? existing.items.map((item) => ({ item_id: item.item_id, item_name: item.item_name, qty: item.qty, rate: item.rate, disc_percentage: item.disc_percentage, tax_id: item.tax_id, unit: item.unit, hs: item.hs }))
			: [{ ...EMPTY_LINE }],
		pay_amount: 0,
		pay_acc_id: 0,
	});

	useEffect(() => {
		async function loadMasters() {
			const priceListResult = await getPriceLists(isSales ? "S" : "P");
			if (priceListResult.status === "S") setPriceLists(priceListResult.data);
			const [contactResult, itemResult, taxResult, payResult] = await Promise.all([
				getContacts({ cs_type: isSales ? "C" : "S", limit: 500, is_active: true }),
				getItems({ limit: 500, is_active: true }),
				getTaxes(),
				getPaymentModes(),
			]);
			if (contactResult.status === "S") setContacts(contactResult.data);
			if (itemResult.status === "S") setItems(itemResult.data);
			if (taxResult.status === "S") setTaxes(taxResult.data);
			if (payResult.status === "S") {
				setPayAccounts(payResult.accounts);
				if (payResult.accounts.length > 0) {
					setForm((current) => ({ ...current, pay_acc_id: payResult.accounts[0].acc_id }));
				}
			}
		}
		loadMasters();
	}, []);

	// Rate of an item for the selected contact: its price list (when valid on the document date), otherwise the item master
	const getRateFor = (item, con_id, transDate) => {
		const baseRate = isSales ? item.sale_rate : item.purchase_rate;
		const contact = contacts.find((entry) => entry.con_id === con_id);
		const priceList = contact ? priceLists.find((list) => list.price_list_id === contact.price_list_id) : null;
		return priceList && isListValid(priceList, transDate) ? getListRate(priceList, item.item_id, baseRate) : baseRate;
	};

	// New contact: the dropdown values and the rates of the lines follow its price list
	const handleContactChange = (con_id) => {
		const contact = contacts.find((item) => item.con_id === con_id);
		const lines = form.lines.map((line) => {
			const item = items.find((master) => master.item_id === line.item_id);
			return item ? { ...line, rate: getRateFor(item, con_id, form.trans_date) } : line;
		});
		setForm({ ...form, con_id, lines, dst_state_code: contact ? contact.state_code : form.dst_state_code });
	};

	const updateLine = (index, changes) => {
		const lines = form.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line));
		setForm({ ...form, lines });
	};

	// Selecting an item fills the name, rate, tax and unit from the item master
	const handleItemChange = (index, item_id) => {
		const item = items.find((master) => master.item_id === item_id);
		if (!item) {
			updateLine(index, { ...EMPTY_LINE });
			return;
		}
		updateLine(index, {
			item_id: item.item_id, item_name: item.name, rate: getRateFor(item, form.con_id, form.trans_date),
			tax_id: item.tax_id, unit: item.uom, hs: item.hs,
		});
	};

	const removeLine = (index) => {
		const lines = form.lines.filter((line, lineIndex) => lineIndex !== index);
		setForm({ ...form, lines: lines.length > 0 ? lines : [{ ...EMPTY_LINE }] });
	};

	const sameState = !form.dst_state_code || !user.company.state_code || form.dst_state_code === user.company.state_code;
	const totals = calculateTotals(form.lines, taxes, form.include_tax, sameState);

	async function handleSave(e) {
		e.preventDefault();
		const validLines = form.lines.filter((line) => line.item_id);
		if (validLines.length === 0) {
			toast.error("Add at least one item");
			return;
		}
		const payload = {
			trans_id: form.trans_id || undefined,
			trans_type: transType.type,
			con_id: form.con_id || 0,
			trans_date: form.trans_date,
			due_date: form.due_date || undefined,
			ref: form.ref,
			notes: form.notes,
			dst_state_code: form.dst_state_code,
			include_tax: form.include_tax,
			items: validLines.map((line) => ({
				item_id: line.item_id, qty: Number(line.qty), rate: Number(line.rate),
				disc_percentage: Number(line.disc_percentage) || 0, tax_id: Number(line.tax_id) || 0,
			})),
		};
		if (canTakePayment && Number(form.pay_amount) > 0) {
			payload.payments = [{ acc_id: Number(form.pay_acc_id), amount: Number(form.pay_amount) }];
		}

		setSaving(true);
		const result = await saveTransaction(payload);
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
					<div className="col-md-4">
						<label className="form-label">{isSales ? "Customer" : "Supplier"} *</label>
						<select className="form-select" value={form.con_id} onChange={(e) => handleContactChange(parseInt(e.target.value))} required>
							<option value={0}>Select</option>
							{contacts.map((contact) => <option key={contact.con_id} value={contact.con_id}>{contact.name}</option>)}
						</select>
					</div>
					<div className="col-md-2"><label className="form-label">Date *</label><input type="date" className="form-control" value={form.trans_date} onChange={(e) => setForm({ ...form, trans_date: e.target.value })} required /></div>
					<div className="col-md-2"><label className="form-label">Due date</label><input type="date" className="form-control" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
					<div className="col-md-2"><label className="form-label">Reference</label><input className="form-control" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} /></div>
					<div className="col-md-2">
						<label className="form-label">Place of supply</label>
						<select className="form-select" value={form.dst_state_code} onChange={(e) => setForm({ ...form, dst_state_code: e.target.value })}>
							<option value="">Same state</option>
							{STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
						</select>
					</div>
				</div>
			</div>

			<div className="ob-card mb-3 p-0 table-responsive">
				<table className="table table-ob mb-0 align-middle">
					<thead>
						<tr><th style={{ minWidth: 220 }}>Item</th><th style={{ width: 100 }}>Qty</th><th style={{ width: 130 }}>Rate</th><th style={{ width: 100 }}>Disc %</th><th style={{ width: 150 }}>Tax</th><th className="text-end-num" style={{ width: 130 }}>Amount</th><th style={{ width: 40 }} /></tr>
					</thead>
					<tbody>
						{totals.lines.map((line, index) => (
							<tr key={index}>
								<td>
									<select className="form-select form-select-sm" value={line.item_id} onChange={(e) => handleItemChange(index, parseInt(e.target.value))}>
										<option value={0}>Select item</option>
										{items.map((item) => <option key={item.item_id} value={item.item_id}>{item.name}</option>)}
									</select>
								</td>
								<td><input type="number" step="any" min="0" className="form-control form-control-sm" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} /></td>
								<td><input type="number" step="0.01" min="0" className="form-control form-control-sm" value={line.rate} onChange={(e) => updateLine(index, { rate: e.target.value })} /></td>
								<td><input type="number" step="0.01" min="0" max="100" className="form-control form-control-sm" value={line.disc_percentage} onChange={(e) => updateLine(index, { disc_percentage: e.target.value })} /></td>
								<td>
									<select className="form-select form-select-sm" value={line.tax_id} onChange={(e) => updateLine(index, { tax_id: parseInt(e.target.value) })}>
										<option value={0}>No tax</option>
										{taxes.map((tax) => <option key={tax.tax_id} value={tax.tax_id}>{tax.name}</option>)}
									</select>
								</td>
								<td className="text-end-num">{formatMoney(line.item_total)}</td>
								<td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeLine(index)}><i className="bi bi-x-lg" /></button></td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="p-2">
					<button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setForm({ ...form, lines: [...form.lines, { ...EMPTY_LINE }] })}><i className="bi bi-plus-lg me-1" />Add line</button>
				</div>
			</div>

			<div className="row g-3">
				<div className="col-md-7">
					<div className="ob-card">
						<label className="form-label">Notes</label>
						<textarea className="form-control" rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
						<div className="form-check mt-3">
							<input className="form-check-input" type="checkbox" id="include_tax" checked={form.include_tax} onChange={(e) => setForm({ ...form, include_tax: e.target.checked })} />
							<label className="form-check-label" htmlFor="include_tax">Rates include tax</label>
						</div>
						{canTakePayment && !existing && (
							<div className="row g-2 mt-2">
								<div className="col-6"><label className="form-label">{isSales ? "Amount received now" : "Amount paid now"}</label><input type="number" step="0.01" min="0" className="form-control" value={form.pay_amount} onChange={(e) => setForm({ ...form, pay_amount: e.target.value })} /></div>
								<div className="col-6">
									<label className="form-label">Bank / cash account</label>
									<select className="form-select" value={form.pay_acc_id} onChange={(e) => setForm({ ...form, pay_acc_id: e.target.value })}>
										{payAccounts.map((account) => <option key={account.acc_id} value={account.acc_id}>{account.name}</option>)}
									</select>
								</div>
							</div>
						)}
					</div>
				</div>
				<div className="col-md-5">
					<div className="ob-card">
						<div className="d-flex justify-content-between"><span>Taxable amount</span><span className="text-end-num">{formatMoney(totals.taxableAmount)}</span></div>
						<div className="d-flex justify-content-between"><span>Tax ({sameState ? "CGST + SGST" : "IGST"})</span><span className="text-end-num">{formatMoney(totals.totalTax)}</span></div>
						<div className="d-flex justify-content-between"><span>Round off</span><span className="text-end-num">{formatMoney(totals.roundAmount)}</span></div>
						<hr />
						<div className="d-flex justify-content-between fs-5 fw-bold"><span>Total</span><span className="text-end-num">{formatMoney(totals.totalAmount)}</span></div>
					</div>
				</div>
			</div>
		</form>
	);
};

export default ItemsForm;
