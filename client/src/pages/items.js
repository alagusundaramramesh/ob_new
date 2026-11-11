import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getItems, saveItem, deleteItem, getTaxes, getCategories, adjustStock } from "../services/api";
import { formatMoney, formatQty, toInputDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";
import Modal from "../components/modal";

const EMPTY_ITEM = {
	item_id: 0, name: "", type: "P", sku: "", hs: "", uom: "Nos", sale_rate: 0, purchase_rate: 0, mrp: 0, tax_id: 0,
	category_id: 0, stk_level: 0, opening_stk: 0, description: "", is_active: true,
};

const Items = () => {
	const [items, setItems] = useState([]);
	const [taxes, setTaxes] = useState([]);
	const [categories, setCategories] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [search, setSearch] = useState("");
	const [lowStock, setLowStock] = useState(false);
	const [editing, setEditing] = useState(null);
	const [adjusting, setAdjusting] = useState(null);
	const limit = 20;

	useEffect(() => {
		document.title = "Items - OutputBooks";
		async function loadMasters() {
			const [taxResult, categoryResult] = await Promise.all([getTaxes(), getCategories()]);
			if (taxResult.status === "S") setTaxes(taxResult.data);
			if (categoryResult.status === "S") setCategories(categoryResult.data);
		}
		loadMasters();
	}, []);

	useEffect(() => {
		loadItems();
	}, [page, lowStock]);

	async function loadItems(searchText = search) {
		const result = await getItems({ search: searchText, low_stock: lowStock, page, limit });
		if (result.status === "S") {
			setItems(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadItems(search);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveItem({
			...editing,
			sale_rate: Number(editing.sale_rate), purchase_rate: Number(editing.purchase_rate), mrp: Number(editing.mrp),
			tax_id: parseInt(editing.tax_id) || 0, category_id: parseInt(editing.category_id) || 0,
			stk_level: Number(editing.stk_level), opening_stk: Number(editing.opening_stk),
		});
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadItems();
	}

	async function handleDelete(item) {
		if (!window.confirm(`Delete ${item.name}?`)) {
			return;
		}
		const result = await deleteItem(item.item_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadItems();
	}

	async function handleAdjust(e) {
		e.preventDefault();
		const result = await adjustStock({ item_id: adjusting.item_id, qty: Number(adjusting.qty), trans_date: adjusting.trans_date, notes: adjusting.notes });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to adjust the stock");
			return;
		}
		toast.success(result.message);
		setAdjusting(null);
		loadItems();
	}

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setEditing({ ...editing, [name]: type === "checkbox" ? checked : value });
	};

	const getTaxName = (tax_id) => {
		const tax = taxes.find((item) => item.tax_id === tax_id);
		return tax ? tax.name : "";
	};

	return (
		<>
			<PageHeader title="Items">
				<div className="form-check form-switch d-flex align-items-center gap-2">
					<input className="form-check-input" type="checkbox" id="low_stock" checked={lowStock} onChange={(e) => { setPage(1); setLowStock(e.target.checked); }} />
					<label className="form-check-label" htmlFor="low_stock">Low stock only</label>
				</div>
				<form className="d-flex gap-2" onSubmit={handleSearch}>
					<input className="form-control" placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
					<button className="btn btn-outline-secondary">Search</button>
				</form>
				<button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_ITEM })}><i className="bi bi-plus-lg me-1" />New item</button>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0">
					<thead>
						<tr><th>Name</th><th>SKU</th><th>Type</th><th>Tax</th><th className="text-end-num">Sale rate</th><th className="text-end-num">Purchase rate</th><th className="text-end-num">Stock</th><th /></tr>
					</thead>
					<tbody>
						{items.map((item) => (
							<tr key={item.item_id} className={item.is_active ? "" : "text-muted"}>
								<td>{item.name}{!item.is_active && <span className="badge bg-secondary ms-2">Inactive</span>}</td>
								<td>{item.sku}</td>
								<td>{item.type === "P" ? "Product" : "Service"}</td>
								<td>{getTaxName(item.tax_id)}</td>
								<td className="text-end-num">{formatMoney(item.sale_rate)}</td>
								<td className="text-end-num">{formatMoney(item.purchase_rate)}</td>
								<td className={`text-end-num ${item.is_inventory && item.cur_stk <= item.stk_level ? "text-danger fw-bold" : ""}`}>
									{item.is_inventory ? `${formatQty(item.cur_stk)} ${item.uom}` : "-"}
								</td>
								<td className="text-end text-nowrap">
									{item.is_inventory && <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => setAdjusting({ item_id: item.item_id, name: item.name, qty: 0, trans_date: toInputDate(), notes: "" })}>Adjust stock</button>}
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...item })}>Edit</button>
									<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(item)}>Delete</button>
								</td>
							</tr>
						))}
						{items.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No items found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />

			{editing && (
				<Modal title={editing.item_id ? "Edit item" : "New item"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="row g-3">
							<div className="col-md-8"><label className="form-label">Name *</label><input className="form-control" name="name" value={editing.name} onChange={handleChange} required /></div>
							<div className="col-md-4">
								<label className="form-label">Type</label>
								<select className="form-select" name="type" value={editing.type} onChange={handleChange} disabled={!!editing.item_id}>
									<option value="P">Product (with stock)</option>
									<option value="S">Service</option>
								</select>
							</div>
							<div className="col-md-4"><label className="form-label">SKU</label><input className="form-control" name="sku" value={editing.sku || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">HSN / SAC</label><input className="form-control" name="hs" value={editing.hs || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Unit</label><input className="form-control" name="uom" value={editing.uom || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Sale rate</label><input type="number" step="0.01" min="0" className="form-control" name="sale_rate" value={editing.sale_rate} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Purchase rate</label><input type="number" step="0.01" min="0" className="form-control" name="purchase_rate" value={editing.purchase_rate} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">MRP</label><input type="number" step="0.01" min="0" className="form-control" name="mrp" value={editing.mrp} onChange={handleChange} /></div>
							<div className="col-md-6">
								<label className="form-label">Tax</label>
								<select className="form-select" name="tax_id" value={editing.tax_id} onChange={handleChange}>
									<option value={0}>No tax</option>
									{taxes.map((tax) => <option key={tax.tax_id} value={tax.tax_id}>{tax.name}</option>)}
								</select>
							</div>
							<div className="col-md-6">
								<label className="form-label">Category</label>
								<select className="form-select" name="category_id" value={editing.category_id} onChange={handleChange}>
									<option value={0}>None</option>
									{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}
								</select>
							</div>
							{editing.type === "P" && (
								<>
									<div className="col-md-6"><label className="form-label">Reorder level</label><input type="number" min="0" className="form-control" name="stk_level" value={editing.stk_level} onChange={handleChange} /></div>
									{!editing.item_id && <div className="col-md-6"><label className="form-label">Opening stock</label><input type="number" className="form-control" name="opening_stk" value={editing.opening_stk} onChange={handleChange} /></div>}
								</>
							)}
							<div className="col-12">
								<div className="form-check">
									<input className="form-check-input" type="checkbox" id="item_active" name="is_active" checked={editing.is_active} onChange={handleChange} />
									<label className="form-check-label" htmlFor="item_active">Active</label>
								</div>
							</div>
						</div>
						<div className="text-end mt-3">
							<button type="button" className="btn btn-light me-2" onClick={() => setEditing(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}

			{adjusting && (
				<Modal title={`Adjust stock - ${adjusting.name}`} onClose={() => setAdjusting(null)} size="md">
					<form onSubmit={handleAdjust}>
						<div className="mb-3">
							<label className="form-label">Quantity (use a minus sign to remove stock)</label>
							<input type="number" step="any" className="form-control" value={adjusting.qty} onChange={(e) => setAdjusting({ ...adjusting, qty: e.target.value })} required />
						</div>
						<div className="mb-3"><label className="form-label">Date</label><input type="date" className="form-control" value={adjusting.trans_date} onChange={(e) => setAdjusting({ ...adjusting, trans_date: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">Reason</label><input className="form-control" value={adjusting.notes} onChange={(e) => setAdjusting({ ...adjusting, notes: e.target.value })} /></div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setAdjusting(null)}>Cancel</button>
							<button className="btn btn-primary">Update stock</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
};

export default Items;
