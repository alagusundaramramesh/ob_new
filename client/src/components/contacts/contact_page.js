import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getContacts, saveContact, deleteContact, getContactDetails, getPriceLists } from "../../services/api";
import { formatBalance, STATES } from "../../utils/format";
import PageHeader from "../page_header";
import Pagination from "../pagination";
import Modal from "../modal";

const EMPTY_CONTACT = {
	con_id: 0, name: "", company: "", email: "", phone: "", contact_person: "", tax_no: "", state_code: "33",
	credit_days: 0, discount: 0, tds: 0, opening_balance: 0, price_list_id: 0, reminders_off: false, is_active: true,
};

/* Customers (cs_type C) and suppliers (cs_type S) use the same screen */
const ContactPage = ({ csType }) => {
	const label = csType === "C" ? "Customer" : "Supplier";
	const [contacts, setContacts] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState(null);
	const [priceLists, setPriceLists] = useState([]);
	const limit = 20;

	useEffect(() => {
		document.title = `${label}s - OutputBooks`;
		loadContacts();
	}, [page, csType]);

	// A customer uses a sales list (S), a supplier a purchase list (P)
	useEffect(() => {
		async function loadPriceLists() {
			const result = await getPriceLists(csType === "C" ? "S" : "P");
			if (result.status === "S") setPriceLists(result.data);
		}
		loadPriceLists();
	}, [csType]);

	async function loadContacts(searchText = search) {
		const result = await getContacts({ cs_type: csType, search: searchText, page, limit });
		if (result.status === "S") {
			setContacts(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadContacts(search);
	}

	async function openEdit(contact) {
		const result = await getContactDetails(contact.con_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		setEditing(result.data);
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveContact({ ...editing, cs_type: csType, price_list_id: parseInt(editing.price_list_id) || 0 });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadContacts();
	}

	async function handleDelete(contact) {
		if (!window.confirm(`Delete ${contact.name}?`)) {
			return;
		}
		const result = await deleteContact(contact.con_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadContacts();
	}

	// The first address of the contact: the e-invoice and the e-way bill use it
	const getAddress = () => (editing.addresses && editing.addresses[0]) || {};
	const handleAddressChange = (field, value) => {
		setEditing({ ...editing, addresses: [{ ...getAddress(), [field]: value }] });
	};

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setEditing({ ...editing, [name]: type === "checkbox" ? checked : value });
	};

	return (
		<>
			<PageHeader title={`${label}s`}>
				<form className="d-flex gap-2" onSubmit={handleSearch}>
					<input className="form-control" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
					<button className="btn btn-outline-secondary">Search</button>
				</form>
				<button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_CONTACT })}><i className="bi bi-plus-lg me-1" />New {label}</button>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0">
					<thead>
						<tr><th>Name</th><th>Phone</th><th>Email</th><th>GSTIN</th><th className="text-end-num">Balance</th><th /></tr>
					</thead>
					<tbody>
						{contacts.map((contact) => (
							<tr key={contact.con_id} className={contact.is_active ? "" : "text-muted"}>
								<td>{contact.name}{!contact.is_active && <span className="badge bg-secondary ms-2">Inactive</span>}</td>
								<td>{contact.phone}</td>
								<td>{contact.email}</td>
								<td>{contact.tax_no}</td>
								<td className="text-end-num">{formatBalance(contact.balance)}</td>
								<td className="text-end text-nowrap">
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => openEdit(contact)}>Edit</button>
									<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(contact)}>Delete</button>
								</td>
							</tr>
						))}
						{contacts.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-4">No {label.toLowerCase()}s found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />

			{editing && (
				<Modal title={editing.con_id ? `Edit ${label}` : `New ${label}`} onClose={() => setEditing(null)}>
					<form onSubmit={handleSave}>
						<div className="row g-3">
							<div className="col-md-6"><label className="form-label">Name *</label><input className="form-control" name="name" value={editing.name} onChange={handleChange} required /></div>
							<div className="col-md-6"><label className="form-label">Company</label><input className="form-control" name="company" value={editing.company || ""} onChange={handleChange} /></div>
							<div className="col-md-6"><label className="form-label">Email</label><input type="email" className="form-control" name="email" value={editing.email || ""} onChange={handleChange} /></div>
							<div className="col-md-6"><label className="form-label">Phone</label><input className="form-control" name="phone" value={editing.phone || ""} onChange={handleChange} /></div>
							<div className="col-md-6"><label className="form-label">GSTIN</label><input className="form-control" name="tax_no" value={editing.tax_no || ""} onChange={handleChange} maxLength={15} /></div>
							<div className="col-md-6">
								<label className="form-label">State (place of supply)</label>
								<select className="form-select" name="state_code" value={editing.state_code || ""} onChange={handleChange}>
									<option value="">-</option>
									{STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
								</select>
							</div>
							<div className="col-md-6"><label className="form-label">Address</label><input className="form-control" value={getAddress().address1 || ""} onChange={(e) => handleAddressChange("address1", e.target.value)} /></div>
							<div className="col-md-6"><label className="form-label">Address line 2</label><input className="form-control" value={getAddress().address2 || ""} onChange={(e) => handleAddressChange("address2", e.target.value)} /></div>
							<div className="col-md-6"><label className="form-label">City</label><input className="form-control" value={getAddress().city || ""} onChange={(e) => handleAddressChange("city", e.target.value)} /></div>
							<div className="col-md-6"><label className="form-label">PIN code</label><input className="form-control" maxLength={6} value={getAddress().zip || ""} onChange={(e) => handleAddressChange("zip", e.target.value)} /></div>
							<div className="col-md-4"><label className="form-label">Credit days</label><input type="number" min="0" className="form-control" name="credit_days" value={editing.credit_days} onChange={handleChange} /></div>
							<div className="col-md-4"><label className="form-label">Contact person</label><input className="form-control" name="contact_person" value={editing.contact_person || ""} onChange={handleChange} /></div>
							<div className="col-md-4">
								<label className="form-label">Opening balance (Dr +, Cr -)</label>
								<input type="number" step="0.01" className="form-control" name="opening_balance" value={editing.opening_balance} onChange={handleChange} />
							</div>
							<div className="col-md-6">
								<label className="form-label">Price list</label>
								<select className="form-select" name="price_list_id" value={editing.price_list_id || 0} onChange={handleChange}>
									<option value={0}>None (item rates)</option>
									{priceLists.map((priceList) => <option key={priceList.price_list_id} value={priceList.price_list_id}>{priceList.name}</option>)}
								</select>
							</div>
							{csType === "C" && (
								<div className="col-md-6 d-flex align-items-end">
									<div className="form-check">
										<input className="form-check-input" type="checkbox" id="reminders_off" name="reminders_off" checked={!!editing.reminders_off} onChange={handleChange} />
										<label className="form-check-label" htmlFor="reminders_off">Do not send payment reminders</label>
									</div>
								</div>
							)}
							<div className="col-12">
								<div className="form-check">
									<input className="form-check-input" type="checkbox" id="contact_active" name="is_active" checked={editing.is_active} onChange={handleChange} />
									<label className="form-check-label" htmlFor="contact_active">Active</label>
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
		</>
	);
};

export default ContactPage;
