import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { changePassword } from "../services/api";
import { useGlobalState } from "../contexts/user";
import PageHeader from "../components/page_header";

const MyAccount = () => {
	const { user } = useGlobalState();
	const [passwords, setPasswords] = useState({ old_password: "", new_password: "" });

	useEffect(() => {
		document.title = "My account - OutputBooks";
	}, []);

	async function handleSubmit(e) {
		e.preventDefault();
		const result = await changePassword(passwords.old_password, passwords.new_password);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to change the password");
			return;
		}
		toast.success(result.message);
		setPasswords({ old_password: "", new_password: "" });
	}

	return (
		<>
			<PageHeader title="My account" />
			<div className="row g-3">
				<div className="col-md-6">
					<div className="ob-card">
						<h6>Profile</h6>
						<div><span className="text-muted">Name:</span> {user.user.name}</div>
						<div><span className="text-muted">Email:</span> {user.user.email}</div>
						<div><span className="text-muted">Company:</span> {user.company.name}</div>
						<div><span className="text-muted">Role:</span> {user.role.role_name}</div>
					</div>
				</div>
				<div className="col-md-6">
					<form className="ob-card" onSubmit={handleSubmit}>
						<h6>Change password</h6>
						<div className="mb-3"><label className="form-label">Old password</label><input type="password" className="form-control" value={passwords.old_password} onChange={(e) => setPasswords({ ...passwords, old_password: e.target.value })} required /></div>
						<div className="mb-3"><label className="form-label">New password (minimum 6 characters)</label><input type="password" minLength={6} className="form-control" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} required /></div>
						<button className="btn btn-primary">Change password</button>
					</form>
				</div>
			</div>
		</>
	);
};

export default MyAccount;
