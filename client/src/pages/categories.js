import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { getCategories, saveCategory, deleteCategory } from "../services/api";
import PageHeader from "../components/page_header";
import Modal from "../components/modal";

/* Flat list of categories shown as a tree (parent -> children) */
function buildRows(categories, parentId = 0, level = 0) {
	let rows = [];
	categories.filter((category) => category.parent_id === parentId).forEach((category) => {
		rows.push({ ...category, level });
		rows = rows.concat(buildRows(categories, category.category_id, level + 1));
	});
	return rows;
}

const Categories = () => {
	const [categories, setCategories] = useState([]);
	const [editing, setEditing] = useState(null);

	useEffect(() => {
		document.title = "Categories - OutputBooks";
		loadCategories();
	}, []);

	async function loadCategories() {
		const result = await getCategories();
		if (result.status === "S") {
			setCategories(result.data);
		}
	}

	async function handleSave(e) {
		e.preventDefault();
		const result = await saveCategory({ ...editing, parent_id: parseInt(editing.parent_id) || 0 });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to save");
			return;
		}
		toast.success(result.message);
		setEditing(null);
		loadCategories();
	}

	async function handleDelete(category) {
		if (!window.confirm(`Delete ${category.name}?`)) {
			return;
		}
		const result = await deleteCategory(category.category_id);
		if (result.status !== "S") {
			toast.error(result.message);
			return;
		}
		toast.success(result.message);
		loadCategories();
	}

	return (
		<>
			<PageHeader title="Item categories">
				<button className="btn btn-primary" onClick={() => setEditing({ category_id: 0, name: "", parent_id: 0 })}><i className="bi bi-plus-lg me-1" />New category</button>
			</PageHeader>

			<div className="ob-card p-0">
				<table className="table table-hover table-ob mb-0">
					<tbody>
						{buildRows(categories).map((category) => (
							<tr key={category.category_id}>
								<td style={{ paddingLeft: `${1 + category.level * 1.5}rem` }}>{category.level > 0 && "└ "}{category.name}</td>
								<td className="text-end text-nowrap">
									<button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing({ ...category })}>Edit</button>
									<button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(category)}>Delete</button>
								</td>
							</tr>
						))}
						{categories.length === 0 && <tr><td className="text-center text-muted py-4">No categories yet</td></tr>}
					</tbody>
				</table>
			</div>

			{editing && (
				<Modal title={editing.category_id ? "Edit category" : "New category"} onClose={() => setEditing(null)} size="md">
					<form onSubmit={handleSave}>
						<div className="mb-3"><label className="form-label">Name *</label><input className="form-control" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
						<div className="mb-3">
							<label className="form-label">Parent category</label>
							<select className="form-select" value={editing.parent_id} onChange={(e) => setEditing({ ...editing, parent_id: e.target.value })}>
								<option value={0}>None (top level)</option>
								{categories.filter((category) => category.category_id !== editing.category_id).map((category) => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}
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

export default Categories;
