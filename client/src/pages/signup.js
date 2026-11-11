import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { signUp } from "../services/api";
import { STATES } from "../utils/format";

const Signup = () => {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({ name: "", email: "", password: "", phone: "", company_name: "", state_code: "33" });

	useEffect(() => {
		document.title = "Sign up - OutputBooks";
	}, []);

	const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

	async function handleSignup(e) {
		e.preventDefault();
		setLoading(true);
		const result = await signUp(formData);
		setLoading(false);
		if (result.status !== "S") {
			toast.error(result.message || "Sign up failed");
			return;
		}
		localStorage.setItem("token", result.token);
		navigate("/");
	}

	return (
		<form onSubmit={handleSignup}>
			<h5 className="mb-3">Create your account</h5>
			<div className="mb-3">
				<label className="form-label">Your name</label>
				<input className="form-control" name="name" value={formData.name} onChange={handleChange} required />
			</div>
			<div className="mb-3">
				<label className="form-label">Email</label>
				<input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required />
			</div>
			<div className="mb-3">
				<label className="form-label">Password (minimum 6 characters)</label>
				<input type="password" className="form-control" name="password" value={formData.password} onChange={handleChange} minLength={6} required />
			</div>
			<div className="mb-3">
				<label className="form-label">Phone</label>
				<input className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
			</div>
			<div className="mb-3">
				<label className="form-label">Company name</label>
				<input className="form-control" name="company_name" value={formData.company_name} onChange={handleChange} required />
			</div>
			<div className="mb-3">
				<label className="form-label">State</label>
				<select className="form-select" name="state_code" value={formData.state_code} onChange={handleChange}>
					{STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
				</select>
			</div>
			<button className="btn btn-primary w-100" disabled={loading}>{loading ? "Please wait..." : "Sign up"}</button>
			<div className="text-center mt-3 small">
				Already have an account? <Link to="/login">Login</Link>
			</div>
		</form>
	);
};

export default Signup;
