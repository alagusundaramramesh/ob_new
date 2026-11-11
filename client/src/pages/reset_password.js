import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { resetPassword } from "../services/api";

const ResetPassword = () => {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [password, setPassword] = useState("");

	useEffect(() => {
		document.title = "Reset password - OutputBooks";
	}, []);

	async function handleSubmit(e) {
		e.preventDefault();
		const result = await resetPassword(searchParams.get("token"), password);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to reset the password");
			return;
		}
		toast.success("Password updated. Please login");
		navigate("/login");
	}

	return (
		<form onSubmit={handleSubmit}>
			<h5 className="mb-3">Set a new password</h5>
			<div className="mb-3">
				<label className="form-label">New password (minimum 6 characters)</label>
				<input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
			</div>
			<button className="btn btn-primary w-100">Update password</button>
			<div className="text-center mt-3 small"><Link to="/login">Back to login</Link></div>
		</form>
	);
};

export default ResetPassword;
