import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
	getOfficeAssets, getOfficeAssetDetails, saveOfficeAsset, deleteOfficeAsset, setOfficeAssetStatus,
	assignOfficeAsset, returnOfficeAsset,
} from "../services/api";
import { formatMoney, formatDate, toInputDate } from "../utils/format";
import { useGlobalState } from "../contexts/user";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";
import Modal from "../components/modal";

const CATEGORIES = ["Computer", "Laptop", "Controller", "Monitor", "Keyboard", "Mouse", "Printer", "Phone", "Tablet", "Other"];

const STATUS_LABELS = { AVAILABLE: "Available", ASSIGNED: "Assigned", UNDER_REPAIR: "Under repair", RETIRED: "Retired" };
const STATUS_COLORS = { AVAILABLE: "success", ASSIGNED: "primary", UNDER_REPAIR: "warning", RETIRED: "secondary" };

const EMPTY_ASSET = {
	asset_id: 0, asset_tag: "", name: "", category: "Laptop", brand: "", model: "", serial_no: "",
	purchase_date: "", warranty_till: "", purchase_cost: 0, notes: "",
};

const OfficeAssets = () => {
	const { user } = useGlobalState();
	const canAssign = user.permissions.includes("OIASG");

	const [assets, setAssets] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("");
	const [status, setStatus] = useState("");
	const [editing, setEditing] = useState(null);
	const [assigning, setAssigning] = useState(null);
	const [returning, setReturning] = useState(null);
	const [viewing, setViewing] = useState(null);
	const limit = 20;

	useEffect(() => {
		document.title = "Office Assets - OutputBooks";
	}, []);

	useEffect(() => {
		loadAssets();
	}, [page, category, status]);

	async function loadAssets(searchText = search) {
		const result = await getOfficeAssets({ search: searchText, category, status, page, limit });
		if (result.status === "S") {
			setAssets(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadAssets(search);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveOfficeAsset({ ...editing, purchase_cost: Number(editing.purchase_cost) });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadAssets();
	}

	async function handleDelete(asset) {
		if (!window.confirm(`Delete ${asset.asset_tag} - ${asset.name}?`)) {
			return;
		}
		const result = await deleteOfficeAsset(asset.asset_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadAssets();
	}

	async function handleStatus(asset, newStatus) {
		const result = await setOfficeAssetStatus(asset.asset_id, newStatus);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadAssets();
	}

	async function handleAssign(e) {
		e.preventDefault();
		const result = await assignOfficeAsset(assigning);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to assign");
			return;
		}
		toast.success(result.message);
		setAssigning(null);
		loadAssets();
	}

	async function handleReturn(e) {
		e.preventDefault();
		const result = await returnOfficeAsset(returning);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to return");
			return;
		}
		toast.success(result.message);
		setReturning(null);
		loadAssets();
	}

	async function openHistory(asset) {
		const result = await getOfficeAssetDetails(asset.asset_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		setViewing({ asset: result.data, history: result.history });
	}

	const handleChange = (e) => {
		setEditing({ ...editing, [e.target.name]: e.target.value });
	};

	const isOverdue = (asset) => asset.status === "ASSIGNED" && asset.current_to_date && new Date(asset.current_to_date) < new Date(toInputDate());

	return (
		<>
			<PageHeader title="Office assets">
				<select className="form-select w-auto" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }}>
					<option value="">All categories</option>
					{CATEGORIES.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
				</select>
				<select className="form-select w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
					<option value="">All status</option>
					{Object.keys(STATUS_LABELS).map((statusCode) => <option key={statusCode} value={statusCode}>{STATUS_LABELS[statusCode]}</option>)}
				</select>
				<form className="d-flex gap-2" onSubmit={handleSearch}>
					<input className="form-control" placeholder="Tag, name, serial or person" value={search} onChange={(e) => setSearch(e.target.value)} />
					<button className="btn btn-outline-secondary">Search</button>
				</form>
				<button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_ASSET })}><i className="bi bi-plus-lg me-1" />New asset</button>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0">
					<thead>
						<tr><th>Tag</th><th>Name</th><th>Category</th><th>Status</th><th>Current holder</th><th>Last user</th><th /></tr>
					</thead>
					<tbody>
						{assets.map((asset) => (
							<tr key={asset.asset_id}>
								<td>{asset.asset_tag}</td>
								<td>{asset.name}<div className="text-muted small">{[asset.brand, asset.model].filter(Boolean).join(" ")}</div></td>
								<td>{asset.category}</td>
								<td>
									<span className={`badge bg-${STATUS_COLORS[asset.status]}`}>{STATUS_LABELS[asset.status]}</span>
									{isOverdue(asset) && <span className="badge bg-danger ms-1">Overdue</span>}
								</td>
								<td>
									{asset.current_holder}
									{asset.status === "ASSIGNED" && asset.current_to_date && <div className="text-muted small">till {formatDate(asset.current_to_date)}</div>}
								</td>
								<td>{asset.last_user}</td>
								<td className="text-end text-nowrap">
									{canAssign && asset.status === "AVAILABLE" && (
										<button className="btn btn-sm btn-success me-1" onClick={() => setAssigning({ asset_id: asset.asset_id, asset_tag: asset.asset_tag, name: asset.name, assigned_to: "", department: "", from_date: toInputDate(), to_date: "", condition_out: "", remarks: "" })}>Assign</button>
									)}
									{canAssign && asset.status === "ASSIGNED" && (
										<button className="btn btn-sm btn-warning me-1" onClick={() => setReturning({ asset_id: asset.asset_id, asset_tag: asset.asset_tag, name: asset.name, assigned_to: asset.current_holder, returned_on: toInputDate(), condition_in: "", send_to_repair: false })}>Return</button>
									)}
									<button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openHistory(asset)}>History</button>
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...asset, purchase_date: asset.purchase_date ? toInputDate(asset.purchase_date) : "", warranty_till: asset.warranty_till ? toInputDate(asset.warranty_till) : "" })}>Edit</button>
									{asset.status === "AVAILABLE" && <button className="btn btn-sm btn-outline-warning me-1" onClick={() => handleStatus(asset, "UNDER_REPAIR")}>To repair</button>}
									{asset.status === "UNDER_REPAIR" && <button className="btn btn-sm btn-outline-success me-1" onClick={() => handleStatus(asset, "AVAILABLE")}>Repaired</button>}
									{(asset.status === "AVAILABLE" || asset.status === "UNDER_REPAIR") && <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => handleStatus(asset, "RETIRED")}>Retire</button>}
									{asset.status === "RETIRED" && <button className="btn btn-sm btn-outline-success me-1" onClick={() => handleStatus(asset, "AVAILABLE")}>Reactivate</button>}
									<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(asset)}>Delete</button>
								</td>
							</tr>
						))}
						{assets.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">No assets found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />

			{editing && (
				<Modal title={editing.asset_id ? "Edit asset" : "New asset"} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="row g-3">
							<div className="col-md-4"><label className="form-label">Asset tag *</label><input className="form-control" name="asset_tag" value={editing.asset_tag} onChange={handleChange} placeholder="LAP-001" required /></div>
							<div className="col-md-8"><label className="form-label">Name *</label><input className="form-control" name="name" value={editing.name} onChange={handleChange} required /></div>
							<div className="col-md-4">
								<label className="form-label">Category *</label>
								<select className="form-select" name="category" value={editing.category} onChange={handleChange}>
									{CATEGORIES.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
								</select>
							</div>
							<div className="col-md-4"><label className="form-label">Brand</label><input className="form-control" name="brand" value={editing.brand || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Model</label><input className="form-control" name="model" value={editing.model || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Serial number</label><input className="form-control" name="serial_no" value={editing.serial_no || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Purchase date</label><input type="date" className="form-control" name="purchase_date" value={editing.purchase_date || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Warranty till</label><input type="date" className="form-control" name="warranty_till" value={editing.warranty_till || ""} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Purchase cost</label><input type="number" step="0.01" min="0" className="form-control" name="purchase_cost" value={editing.purchase_cost || 0} onChange={handleChange} /></div>
							<div className="col-md-8"><label className="form-label">Notes</label><input className="form-control" name="notes" value={editing.notes || ""} onChange={handleChange} /></div>
						</div>
						<div className="text-end mt-3">
							<button type="button" className="btn btn-light me-2" onClick={() => setEditing(null)}>Cancel</button>
							<button className="btn btn-primary">Save</button>
						</div>
					</form>
				</Modal>
			)}

			{assigning && (
				<Modal title={`Assign - ${assigning.asset_tag} ${assigning.name}`} onClose={() => setAssigning(null)} size="md">
					<form onSubmit={handleAssign}>
						<div className="mb-3"><label className="form-label">Employee name *</label><input className="form-control" value={assigning.assigned_to} onChange={(e) => setAssigning({ ...assigning, assigned_to: e.target.value })} required autoFocus /></div>
						<div className="mb-3"><label className="form-label">Department</label><input className="form-control" value={assigning.department} onChange={(e) => setAssigning({ ...assigning, department: e.target.value })} /></div>
						<div className="row g-3 mb-3">
							<div className="col-6"><label className="form-label">From date *</label><input type="date" className="form-control" value={assigning.from_date} onChange={(e) => setAssigning({ ...assigning, from_date: e.target.value })} required /></div>
							<div className="col-6"><label className="form-label">To date</label><input type="date" className="form-control" value={assigning.to_date} min={assigning.from_date} onChange={(e) => setAssigning({ ...assigning, to_date: e.target.value })} /><div className="form-text">Expected return date. Leave empty if not fixed</div></div>
						</div>
						<div className="mb-3"><label className="form-label">Condition (optional)</label><input className="form-control" value={assigning.condition_out} onChange={(e) => setAssigning({ ...assigning, condition_out: e.target.value })} placeholder="Example: small scratch on the lid" /></div>
						<div className="mb-3"><label className="form-label">Remarks</label><input className="form-control" value={assigning.remarks} onChange={(e) => setAssigning({ ...assigning, remarks: e.target.value })} /></div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setAssigning(null)}>Cancel</button>
							<button className="btn btn-success">Assign</button>
						</div>
					</form>
				</Modal>
			)}

			{returning && (
				<Modal title={`Return - ${returning.asset_tag} ${returning.name}`} onClose={() => setReturning(null)} size="md">
					<form onSubmit={handleReturn}>
						<div className="mb-3 text-muted">Returned by {returning.assigned_to}</div>
						<div className="mb-3"><label className="form-label">Return date *</label><input type="date" className="form-control" value={returning.returned_on} onChange={(e) => setReturning({ ...returning, returned_on: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">Condition (optional)</label><input className="form-control" value={returning.condition_in} onChange={(e) => setReturning({ ...returning, condition_in: e.target.value })} placeholder="Example: key missing on keyboard" /></div>
						<div className="form-check mb-3">
							<input className="form-check-input" type="checkbox" id="send_to_repair" checked={returning.send_to_repair} onChange={(e) => setReturning({ ...returning, send_to_repair: e.target.checked })} />
							<label className="form-check-label" htmlFor="send_to_repair">Needs repair (do not make it available)</label>
						</div>
						<div className="text-end">
							<button type="button" className="btn btn-light me-2" onClick={() => setReturning(null)}>Cancel</button>
							<button className="btn btn-warning">Return</button>
						</div>
					</form>
				</Modal>
			)}

			{viewing && (
				<Modal title={`${viewing.asset.asset_tag} - ${viewing.asset.name}`} onClose={() => setViewing(null)}>
					<div className="row g-2 mb-3 small">
						<div className="col-md-4"><span className="text-muted">Category:</span> {viewing.asset.category}</div>
						<div className="col-md-4"><span className="text-muted">Brand / model:</span> {[viewing.asset.brand, viewing.asset.model].filter(Boolean).join(" ") || "-"}</div>
						<div className="col-md-4"><span className="text-muted">Serial:</span> {viewing.asset.serial_no || "-"}</div>
						<div className="col-md-4"><span className="text-muted">Purchased:</span> {viewing.asset.purchase_date ? formatDate(viewing.asset.purchase_date) : "-"}</div>
						<div className="col-md-4"><span className="text-muted">Warranty till:</span> {viewing.asset.warranty_till ? formatDate(viewing.asset.warranty_till) : "-"}</div>
						<div className="col-md-4"><span className="text-muted">Cost:</span> {formatMoney(viewing.asset.purchase_cost)}</div>
						<div className="col-md-4"><span className="text-muted">Status:</span> {STATUS_LABELS[viewing.asset.status]}</div>
						<div className="col-md-4"><span className="text-muted">Current holder:</span> {viewing.asset.current_holder || "-"}</div>
						<div className="col-md-4"><span className="text-muted">Last user:</span> {viewing.asset.last_user || "-"}</div>
					</div>
					<h6>Assignment history</h6>
					<div className="table-responsive">
						<table className="table table-sm table-ob">
							<thead><tr><th>Person</th><th>From</th><th>To</th><th>Returned</th><th>Condition when given</th><th>Condition when returned</th></tr></thead>
							<tbody>
								{viewing.history.map((assignment) => (
									<tr key={assignment.assignment_id}>
										<td>{assignment.assigned_to}{assignment.department && <div className="text-muted small">{assignment.department}</div>}</td>
										<td>{formatDate(assignment.from_date)}</td>
										<td>{assignment.to_date ? formatDate(assignment.to_date) : "-"}</td>
										<td>{assignment.returned_on ? formatDate(assignment.returned_on) : <span className="badge bg-primary">In use</span>}</td>
										<td>{assignment.condition_out}</td>
										<td>{assignment.condition_in}</td>
									</tr>
								))}
								{viewing.history.length === 0 && <tr><td colSpan="6" className="text-center text-muted">Never assigned</td></tr>}
							</tbody>
						</table>
					</div>
				</Modal>
			)}
		</>
	);
};

export default OfficeAssets;
