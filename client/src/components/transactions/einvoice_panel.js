import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
	checkEinvoice, generateEinvoice, cancelEinvoice, checkEwb, generateEwb, cancelEwb, updateEwbVehicle, extendEwb, updateEwbTransporter, getTransporters,
} from "../../services/api";
import { useGlobalState } from "../../contexts/user";
import Modal from "../modal";

const EINVOICE_TYPES = ["SI", "SC", "SD"];
const EWB_TYPES = ["SI", "SR", "SH"];

const IRN_CANCEL_REASONS = { 1: "Duplicate", 2: "Data entry mistake", 3: "Order cancelled", 4: "Other" };
const EWB_CANCEL_REASONS = { 1: "Duplicate", 2: "Order cancelled", 3: "Data entry mistake", 4: "Other" };
const VEHICLE_REASONS = { 1: "Breakdown", 2: "Transshipment", 3: "Other", 4: "First time" };
const TRANS_MODES = { 1: "Road", 2: "Rail", 3: "Air", 4: "Ship" };

const EMPTY_TRANSPORT = { trans_mode: 1, distance: 0, vehicle_no: "", vehicle_type: "R", transporter_gstin: "", transporter_name: "", trans_doc_no: "", trans_doc_date: "" };

/* List of what is wrong, as red bullets */
const ErrorList = ({ errors }) => errors.length > 0 && (
	<div className="alert alert-danger small">
		<strong>Fix this first</strong>
		<ul className="mb-0">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
	</div>
);

/*
 * E-invoice (IRN) and e-way bill of a document, shown on the document view.
 * transaction = the document with transaction.einvoice / transaction.ewb. onChanged reloads the document.
 */
const EinvoicePanel = ({ transaction, onChanged }) => {
	const { user } = useGlobalState();
	const [dialog, setDialog] = useState(null); // { kind: "generate" | "cancel_irn" | "ewb" | "cancel_ewb" | "vehicle", ... }
	const [transporters, setTransporters] = useState([]);
	const [busy, setBusy] = useState(false);

	const canEinvoice = user.permissions.includes("EINV") && EINVOICE_TYPES.includes(transaction.trans_type);
	const canEwb = user.permissions.includes("SAEWB") && EWB_TYPES.includes(transaction.trans_type);
	const einvoice = transaction.einvoice;
	const ewb = transaction.ewb;
	const hasActiveIrn = einvoice && einvoice.status === "ACT";
	const hasActiveEwb = ewb && ewb.status === "ACT";

	useEffect(() => {
		async function loadTransporters() {
			if (!canEwb) return;
			const result = await getTransporters();
			if (result.status === "S") setTransporters(result.data);
		}
		loadTransporters();
	}, []);

	if (!canEinvoice && !canEwb && !einvoice && !ewb) {
		return null;
	}

	/* ---------------- e-invoice */
	async function openGenerate() {
		const result = await checkEinvoice(transaction.trans_id);
		if (result.status !== "S") { toast.error(result.message); return; }
		setDialog({ kind: "generate", errors: result.data.errors, payload: result.data.payload });
	}

	async function doGenerate() {
		setBusy(true);
		const result = await generateEinvoice(transaction.trans_id);
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message || "Unable to generate the e-invoice", { autoClose: 9000 }); return; }
		toast.success(result.message);
		setDialog(null);
		onChanged();
	}

	async function doCancelIrn(e) {
		e.preventDefault();
		setBusy(true);
		const result = await cancelEinvoice({ trans_id: transaction.trans_id, reason: Number(dialog.reason), remark: dialog.remark, also_delete: dialog.also_delete });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		setDialog(null);
		if (dialog.also_delete) { window.location.replace("/einvoice"); return; }
		onChanged();
	}

	/* ---------------- e-way bill */
	async function runEwbCheck(transport) {
		const result = await checkEwb({ trans_id: transaction.trans_id, ...transport, distance: Number(transport.distance) });
		if (result.status !== "S") { toast.error(result.message); return null; }
		return result.data;
	}

	async function openEwb() {
		const transport = { ...EMPTY_TRANSPORT };
		const check = await runEwbCheck(transport);
		if (check) setDialog({ kind: "ewb", transport, check });
	}

	async function changeTransport(changes) {
		const transport = { ...dialog.transport, ...changes };
		setDialog({ ...dialog, transport });
		const check = await runEwbCheck(transport);
		if (check) setDialog((current) => (current && current.kind === "ewb" ? { ...current, transport, check } : current));
	}

	function pickTransporter(tp_id) {
		const transporter = transporters.find((item) => item.tp_id === Number(tp_id));
		changeTransport(transporter ? { transporter_gstin: transporter.gstin, transporter_name: transporter.name } : { transporter_gstin: "", transporter_name: "" });
	}

	async function doGenerateEwb(e) {
		e.preventDefault();
		setBusy(true);
		const result = await generateEwb({ trans_id: transaction.trans_id, ...dialog.transport, distance: Number(dialog.transport.distance) });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message || "Unable to generate the e-way bill", { autoClose: 9000 }); return; }
		toast.success(result.message);
		(result.warnings || []).forEach((warning) => toast.info(warning, { autoClose: 9000 }));
		setDialog(null);
		onChanged();
	}

	async function doCancelEwb(e) {
		e.preventDefault();
		setBusy(true);
		const result = await cancelEwb({ trans_id: transaction.trans_id, reason: Number(dialog.reason), remark: dialog.remark });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		setDialog(null);
		onChanged();
	}

	async function doExtend(e) {
		e.preventDefault();
		setBusy(true);
		const result = await extendEwb({ trans_id: transaction.trans_id, ...dialog.form });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		setDialog(null);
		onChanged();
	}

	async function doUpdateTransporter(e) {
		e.preventDefault();
		setBusy(true);
		const result = await updateEwbTransporter({ trans_id: transaction.trans_id, ...dialog.form });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		setDialog(null);
		onChanged();
	}

	async function doUpdateVehicle(e) {
		e.preventDefault();
		setBusy(true);
		const result = await updateEwbVehicle({ trans_id: transaction.trans_id, ...dialog.form });
		setBusy(false);
		if (result.status !== "S") { toast.error(result.message); return; }
		toast.success(result.message);
		setDialog(null);
		onChanged();
	}

	const isTest = (einvoice && einvoice.provider === "mock") || (ewb && ewb.provider === "mock");
	const set = (changes) => setDialog({ ...dialog, ...changes });

	return (
		<div className="ob-card mt-3 no-print">
			<div className="d-flex justify-content-between align-items-center mb-2">
				<h6 className="mb-0">E-invoice and e-way bill</h6>
				{isTest && <span className="badge bg-danger">TEST - not registered with the IRP</span>}
			</div>

			{/* e-invoice state */}
			{einvoice ? (
				<div className="small mb-2">
					<span className={`badge me-2 ${hasActiveIrn ? "bg-success" : "bg-secondary"}`}>{hasActiveIrn ? "E-invoice generated" : "E-invoice cancelled"}</span>
					<div className="mt-1"><span className="text-muted">IRN:</span> <code className="text-break">{einvoice.irn}</code></div>
					<div><span className="text-muted">Ack no:</span> {einvoice.ack_no} <span className="text-muted ms-3">Ack date:</span> {einvoice.ack_dt}</div>
					{!hasActiveIrn && <div className="text-muted">Cancelled {einvoice.cancel_date} - reason: {IRN_CANCEL_REASONS[einvoice.cancel_reason]} {einvoice.cancel_remark && `(${einvoice.cancel_remark})`}</div>}
				</div>
			) : canEinvoice ? (
				<div className="small text-muted mb-2">No e-invoice yet.</div>
			) : null}

			{/* e-way bill state */}
			{ewb && (
				<div className="small mb-2">
					<span className={`badge me-2 ${hasActiveEwb ? "bg-success" : "bg-secondary"}`}>{hasActiveEwb ? "E-way bill active" : "E-way bill cancelled"}</span>
					<strong>{ewb.ewb_no}</strong>
					<div><span className="text-muted">Generated:</span> {ewb.ewb_dt} <span className="text-muted ms-3">Valid till:</span> {ewb.valid_till}</div>
					<div><span className="text-muted">Vehicle:</span> {ewb.vehicle_no || "-"} <span className="text-muted ms-3">Distance:</span> {ewb.distance} km {ewb.transporter_name && <><span className="text-muted ms-3">Transporter:</span> {ewb.transporter_name}</>}</div>
					{ewb.vehicle_history && ewb.vehicle_history.length > 0 && <div className="text-muted">Vehicle changes: {ewb.vehicle_history.map((item) => `${item.vehicle_no} (${item.from_place})`).join(", ")}</div>}
				</div>
			)}

			<div className="d-flex flex-wrap gap-2">
				{canEinvoice && (!einvoice) && <button className="btn btn-sm btn-primary" onClick={openGenerate}>Generate e-invoice (IRN)</button>}
				{canEinvoice && hasActiveIrn && <button className="btn btn-sm btn-outline-danger" onClick={() => setDialog({ kind: "cancel_irn", reason: 2, remark: "", also_delete: false })}>Cancel e-invoice</button>}
				{canEwb && !hasActiveEwb && <button className="btn btn-sm btn-outline-primary" onClick={openEwb}>Generate e-way bill</button>}
				{canEwb && hasActiveEwb && <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ kind: "vehicle", form: { vehicle_no: "", from_place: user.company.city || "", from_state: user.company.state_code || "", reason_code: 1, reason_remark: "" } })}>Update vehicle</button>}
				{canEwb && hasActiveEwb && <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ kind: "extend", form: { vehicle_no: ewb.vehicle_no || "", from_place: user.company.city || "", from_state: user.company.state_code || "", from_pincode: user.company.zip || "", remaining_distance: "", reason_code: 5, reason_remark: "", consignment_status: "M" } })}>Extend validity</button>}
				{canEwb && hasActiveEwb && <button className="btn btn-sm btn-outline-secondary" onClick={() => setDialog({ kind: "transporter", form: { transporter_gstin: "", transporter_name: "" } })}>Change transporter</button>}
				{canEwb && hasActiveEwb && <button className="btn btn-sm btn-outline-danger" onClick={() => setDialog({ kind: "cancel_ewb", reason: 2, remark: "" })}>Cancel e-way bill</button>}
			</div>

			{/* ---------------- dialogs */}
			{dialog && dialog.kind === "generate" && (
				<Modal title={`E-invoice for ${transaction.trans_no}`} onClose={() => setDialog(null)}>
					<ErrorList errors={dialog.errors} />
					{dialog.errors.length === 0 && (
						<>
							<p>The document is ready to be sent to the IRP. After the IRN is generated the document <strong>can not be edited or deleted</strong>. An IRN can be cancelled only within 24 hours.</p>
							<details className="mb-3"><summary className="small text-muted">See the JSON that will be sent</summary><pre className="small bg-light p-2" style={{ maxHeight: 260, overflow: "auto" }}>{JSON.stringify(dialog.payload, null, 2)}</pre></details>
						</>
					)}
					<div className="text-end">
						<button className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button>
						{dialog.errors.length === 0 && <button className="btn btn-primary" disabled={busy} onClick={doGenerate}>{busy ? "Sending..." : "Generate IRN"}</button>}
					</div>
				</Modal>
			)}

			{dialog && dialog.kind === "cancel_irn" && (
				<Modal title={`Cancel e-invoice ${transaction.trans_no}`} onClose={() => setDialog(null)} size="md">
					<form onSubmit={doCancelIrn}>
						<div className="mb-3"><label className="form-label">Reason</label>
							<select className="form-select" value={dialog.reason} onChange={(e) => set({ reason: e.target.value })}>
								{Object.entries(IRN_CANCEL_REASONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
							</select></div>
						<div className="mb-3"><label className="form-label">Remark</label><input className="form-control" maxLength={100} value={dialog.remark} onChange={(e) => set({ remark: e.target.value })} /></div>
						<div className="form-check mb-3">
							<input className="form-check-input" type="checkbox" id="also_delete" checked={dialog.also_delete} onChange={(e) => set({ also_delete: e.target.checked })} />
							<label className="form-check-label" htmlFor="also_delete">Also delete this document</label>
						</div>
						<div className="form-text mb-3">Allowed only within 24 hours of generation, and not while an e-way bill is active. A cancelled document number can not be reported again.</div>
						<div className="text-end"><button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button><button className="btn btn-danger" disabled={busy}>Cancel e-invoice</button></div>
					</form>
				</Modal>
			)}

			{dialog && dialog.kind === "ewb" && (
				<Modal title={`E-way bill for ${transaction.trans_no}`} onClose={() => setDialog(null)}>
					<form onSubmit={doGenerateEwb}>
						<div className="small text-muted mb-2">{dialog.check.via === "irn" ? "It is generated with the IRN of this invoice." : "This document has no IRN: the e-way bill is generated directly and needs the addresses of both sides."}</div>
						<ErrorList errors={dialog.check.errors} />
						{dialog.check.warnings.length > 0 && <div className="alert alert-warning small"><ul className="mb-0">{dialog.check.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
						<div className="row g-3">
							<div className="col-md-4"><label className="form-label">Transport mode</label>
								<select className="form-select" value={dialog.transport.trans_mode} onChange={(e) => changeTransport({ trans_mode: Number(e.target.value) })}>
									{Object.entries(TRANS_MODES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
								</select></div>
							<div className="col-md-4"><label className="form-label">Distance (km)</label><input type="number" min="0" max="4000" className="form-control" value={dialog.transport.distance} onChange={(e) => changeTransport({ distance: e.target.value })} /><div className="form-text">0 = the portal calculates it</div></div>
							<div className="col-md-4"><label className="form-label">Vehicle type</label>
								<select className="form-select" value={dialog.transport.vehicle_type} onChange={(e) => changeTransport({ vehicle_type: e.target.value })}><option value="R">Regular</option><option value="O">Over dimensional</option></select></div>
							{dialog.transport.trans_mode === 1 ? (
								<div className="col-md-6"><label className="form-label">Vehicle number</label><input className="form-control" placeholder="TN09AB1234" value={dialog.transport.vehicle_no} onChange={(e) => changeTransport({ vehicle_no: e.target.value })} /></div>
							) : (
								<>
									<div className="col-md-6"><label className="form-label">Transport document no</label><input className="form-control" value={dialog.transport.trans_doc_no} onChange={(e) => changeTransport({ trans_doc_no: e.target.value })} /></div>
									<div className="col-md-6"><label className="form-label">Transport document date</label><input type="date" className="form-control" value={dialog.transport.trans_doc_date} onChange={(e) => changeTransport({ trans_doc_date: e.target.value })} /></div>
								</>
							)}
							<div className="col-md-6"><label className="form-label">Transporter</label>
								<select className="form-select" value={(transporters.find((item) => item.gstin === dialog.transport.transporter_gstin) || {}).tp_id || ""} onChange={(e) => pickTransporter(e.target.value)}>
									<option value="">None</option>
									{transporters.map((item) => <option key={item.tp_id} value={item.tp_id}>{item.name} - {item.gstin}</option>)}
								</select></div>
						</div>
						<div className="text-end mt-3">
							<button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button>
							<button className="btn btn-primary" disabled={busy || dialog.check.errors.length > 0}>{busy ? "Sending..." : "Generate e-way bill"}</button>
						</div>
					</form>
				</Modal>
			)}

			{dialog && dialog.kind === "cancel_ewb" && (
				<Modal title={`Cancel e-way bill ${ewb.ewb_no}`} onClose={() => setDialog(null)} size="md">
					<form onSubmit={doCancelEwb}>
						<div className="mb-3"><label className="form-label">Reason</label>
							<select className="form-select" value={dialog.reason} onChange={(e) => set({ reason: e.target.value })}>
								{Object.entries(EWB_CANCEL_REASONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
							</select></div>
						<div className="mb-3"><label className="form-label">Remark</label><input className="form-control" value={dialog.remark} onChange={(e) => set({ remark: e.target.value })} /></div>
						<div className="form-text mb-3">Allowed only within 24 hours of generation.</div>
						<div className="text-end"><button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button><button className="btn btn-danger" disabled={busy}>Cancel e-way bill</button></div>
					</form>
				</Modal>
			)}

			{dialog && dialog.kind === "vehicle" && (
				<Modal title={`Update vehicle - e-way bill ${ewb.ewb_no}`} onClose={() => setDialog(null)} size="md">
					<form onSubmit={doUpdateVehicle}>
						<div className="mb-3"><label className="form-label">New vehicle number *</label><input className="form-control" placeholder="TN10CD5678" value={dialog.form.vehicle_no} onChange={(e) => set({ form: { ...dialog.form, vehicle_no: e.target.value } })} required /></div>
						<div className="row g-3 mb-3">
							<div className="col-8"><label className="form-label">Place where the vehicle is now *</label><input className="form-control" value={dialog.form.from_place} onChange={(e) => set({ form: { ...dialog.form, from_place: e.target.value } })} required /></div>
							<div className="col-4"><label className="form-label">State code *</label><input className="form-control" maxLength={2} value={dialog.form.from_state} onChange={(e) => set({ form: { ...dialog.form, from_state: e.target.value } })} required /></div>
						</div>
						<div className="mb-3"><label className="form-label">Reason</label>
							<select className="form-select" value={dialog.form.reason_code} onChange={(e) => set({ form: { ...dialog.form, reason_code: Number(e.target.value) } })}>
								{Object.entries(VEHICLE_REASONS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
							</select></div>
						<div className="mb-3"><label className="form-label">Remark</label><input className="form-control" maxLength={50} value={dialog.form.reason_remark} onChange={(e) => set({ form: { ...dialog.form, reason_remark: e.target.value } })} /></div>
						<div className="text-end"><button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button><button className="btn btn-primary" disabled={busy}>Update vehicle</button></div>
					</form>
				</Modal>
			)}

			{dialog && dialog.kind === "extend" && (
				<Modal title={`Extend validity - e-way bill ${ewb.ewb_no}`} onClose={() => setDialog(null)} size="md">
					<form onSubmit={doExtend}>
						<div className="form-text mb-3">Valid till {ewb.valid_till}. The portal accepts this from 8 hours before the bill ends until 8 hours after.</div>
						<div className="mb-3"><label className="form-label">Vehicle number</label><input className="form-control" value={dialog.form.vehicle_no} onChange={(e) => set({ form: { ...dialog.form, vehicle_no: e.target.value } })} /></div>
						<div className="row g-3 mb-3">
							<div className="col-6"><label className="form-label">Place where the goods are now *</label><input className="form-control" value={dialog.form.from_place} onChange={(e) => set({ form: { ...dialog.form, from_place: e.target.value } })} required /></div>
							<div className="col-3"><label className="form-label">State code *</label><input className="form-control" maxLength={2} value={dialog.form.from_state} onChange={(e) => set({ form: { ...dialog.form, from_state: e.target.value } })} required /></div>
							<div className="col-3"><label className="form-label">PIN code *</label><input className="form-control" maxLength={6} value={dialog.form.from_pincode} onChange={(e) => set({ form: { ...dialog.form, from_pincode: e.target.value } })} required /></div>
						</div>
						<div className="row g-3 mb-3">
							<div className="col-6"><label className="form-label">Distance still to travel (km) *</label><input type="number" min="1" max="4000" className="form-control" value={dialog.form.remaining_distance} onChange={(e) => set({ form: { ...dialog.form, remaining_distance: e.target.value } })} required /></div>
							<div className="col-6"><label className="form-label">Goods are</label>
								<select className="form-select" value={dialog.form.consignment_status} onChange={(e) => set({ form: { ...dialog.form, consignment_status: e.target.value } })}><option value="M">In movement</option><option value="T">In transit (at a hub)</option></select></div>
						</div>
						<div className="mb-3"><label className="form-label">Reason</label>
							<select className="form-select" value={dialog.form.reason_code} onChange={(e) => set({ form: { ...dialog.form, reason_code: Number(e.target.value) } })}>
								<option value={1}>Natural calamity</option><option value={2}>Law and order</option><option value={3}>Transshipment</option><option value={4}>Accident</option><option value={5}>Other</option>
							</select></div>
						<div className="mb-3"><label className="form-label">Remark</label><input className="form-control" maxLength={50} value={dialog.form.reason_remark} onChange={(e) => set({ form: { ...dialog.form, reason_remark: e.target.value } })} /></div>
						<div className="text-end"><button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button><button className="btn btn-primary" disabled={busy}>Extend validity</button></div>
					</form>
				</Modal>
			)}

			{dialog && dialog.kind === "transporter" && (
				<Modal title={`Change transporter - e-way bill ${ewb.ewb_no}`} onClose={() => setDialog(null)} size="md">
					<form onSubmit={doUpdateTransporter}>
						<div className="mb-3"><label className="form-label">Transporter GSTIN *</label><input className="form-control" maxLength={15} value={dialog.form.transporter_gstin} onChange={(e) => set({ form: { ...dialog.form, transporter_gstin: e.target.value.toUpperCase() } })} required /></div>
						<div className="mb-3"><label className="form-label">Transporter name</label><input className="form-control" value={dialog.form.transporter_name} onChange={(e) => set({ form: { ...dialog.form, transporter_name: e.target.value } })} /></div>
						<div className="text-end"><button type="button" className="btn btn-light me-2" onClick={() => setDialog(null)}>Close</button><button className="btn btn-primary" disabled={busy}>Change transporter</button></div>
					</form>
				</Modal>
			)}
		</div>
	);
};

export default EinvoicePanel;
