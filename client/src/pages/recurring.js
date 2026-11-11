import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { getRecurring, saveRecurring, deleteRecurring, getTransactions } from "../services/api";
import { formatMoney, formatDate, toInputDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Modal from "../components/modal";

const FREQUENCIES = { W: "Weekly", M: "Monthly", Q: "Quarterly", Y: "Yearly" };

/*
 * Recurring invoices: on every due date a new invoice / bill is created from a template document.
 * The server job runs every day at 01:00 (server/classes/class.cron.js).
 * /recurring?source=12 opens the form for invoice 12 (button on the invoice view).
 */
const Recurring = () => {
	const [searchParams] = useSearchParams();
	const [profiles, setProfiles] = useState([]);
	const [templates, setTemplates] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => {
		document.title = "Recurring invoices - OutputBooks";
		loadProfiles();
		loadTemplates();
		const sourceId = parseInt(searchParams.get("source"));
		if (sourceId) {
			setEditing({ recurring_id: 0, name: "", source_trans_id: sourceId, frequency: "M", next_date: toInputDate(), end_date: "", auto_email: false, is_active: true });
		}
	}, []);

	async function loadProfiles() {
		const result = await getRecurring();
		if (result.status === "S") setProfiles(result.data);
	}

	// Invoices and bills that can be used as the template
	async function loadTemplates() {
		const [invoices, bills] = await Promise.all([getTransactions({ trans_type: "SI", limit: 200 }), getTransactions({ trans_type: "PI", limit: 200 })]);
		setTemplates([...(invoices.data || []), ...(bills.data || [])]);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveRecurring({ ...editing, source_trans_id: parseInt(editing.source_trans_id), end_date: editing.end_date || null });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadProfiles();
	}

	async function handleDelete(profile) {
		if (!window.confirm(`Delete ${profile.name}? Documents already created stay.`)) {
			return;
		}
		const result = await deleteRecurring(profile.recurring_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadProfiles();
	}

	const toDay = (value) => (value ? String(value).slice(0, 10) : "");

	return (
		<>
			<PageHeader title="Recurring invoices" subtitle="A new invoice or bill is created automatically on each due date">
				<button className="btn btn-primary" onClick={() => setEditing({ recurring_id: 0, name: "", source_trans_id: 0, frequency: "M", next_date: toInputDate(), end_date: "", auto_email: false, is_active: true })}>
					<i className="bi bi-plus-lg me-1" />New recurring invoice
				</button>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0 align-middle">
					<thead><tr><th>Name</th><th>Template</th><th>Repeats</th><th>Next date</th><th className="text-end-num">Created</th><th>Status</th><th /></tr></thead>
					<tbody>
						{profiles.map((profile) => (
							<tr key={profile.recurring_id}>
								<td>{profile.name}{profile.auto_email && <i className="bi bi-envelope ms-2 text-muted" title="Emailed automatically" />}</td>
								<td>{profile.source ? <>{profile.source.trans_no} <span className="text-muted small">{profile.source.con_name} - {formatMoney(profile.source.tot_amount)}</span></> : "-"}</td>
								<td>{FREQUENCIES[profile.frequency]}</td>
								<td>{formatDate(profile.next_date)}{profile.end_date && <div className="text-muted small">until {formatDate(profile.end_date)}</div>}</td>
								<td className="text-end-num">{profile.run_count}</td>
								<td>
									{profile.is_active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Stopped</span>}
									{profile.last_error && <div className="text-danger small">{profile.last_error}</div>}
								</td>
								<td className="text-end text-nowrap">
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...profile, next_date: toDay(profile.next_date), end_date: toDay(profile.end_date) })}>Edit</button>
									<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(profile)}>Delete</button>
								</td>
							</tr>
						))}
						{profiles.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">No recurring invoices yet. Open an invoice and press "Make recurring", or use the button above.</td></tr>}
					</tbody>
				</table>
			</div>

			{editing && (
				<Modal title={editing.recurring_id ? "Edit recurring invoice" : "New recurring invoice"} onClose={() => setEditing(null)} size="md">
					<form onSubmit={handleSave}>
						<div className="mb-3"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Monthly support for Customer A" required /></div>
						<div className="mb-3">
							<label className="form-label">Template invoice / bill *</label>
							<select className="form-select" value={editing.source_trans_id} onChange={(e) => setEditing({ ...editing, source_trans_id: e.target.value })} required>
								<option value="">Select</option>
								{templates.map((template) => <option key={template.trans_id} value={template.trans_id}>{template.trans_no} - {template.con_name} - {formatMoney(template.tot_amount)}</option>)}
							</select>
							<div className="form-text">The items of this document are copied each time. Change the template to change the next invoices.</div>
						</div>
						<div className="row g-3 mb-3">
							<div className="col-md-4">
								<label className="form-label">Repeats</label>
								<select className="form-select" value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}>
									{Object.entries(FREQUENCIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
								</select>
							</div>
							<div className="col-md-4"><label className="form-label">Next date *</label><input type="date" className="form-control" value={editing.next_date} onChange={(e) => setEditing({ ...editing, next_date: e.target.value })} required /></div>
							<div className="col-md-4"><label className="form-label">Stop after</label><input type="date" className="form-control" value={editing.end_date || ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} /></div>
						</div>
						<div className="form-check mb-2">
							<input className="form-check-input" type="checkbox" id="auto_email" checked={editing.auto_email} onChange={(e) => setEditing({ ...editing, auto_email: e.target.checked })} />
							<label className="form-check-label" htmlFor="auto_email">Email the PDF to the customer / supplier</label>
						</div>
						<div className="form-check mb-3">
							<input className="form-check-input" type="checkbox" id="recurring_active" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
							<label className="form-check-label" htmlFor="recurring_active">Active</label>
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

export default Recurring;
