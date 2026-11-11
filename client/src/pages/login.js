import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { emailLogin } from "../services/api";

const Login = () => {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		document.title = "Login - OutputBooks";
	}, []);

	async function handleLogin(e) {
		e.preventDefault();
		setLoading(true);
		const result = await emailLogin(email, password);
		setLoading(false);
		if (result.status !== "S") {
			toast.error(result.message || "Login failed");
			return;
		}
		localStorage.setItem("token", result.token);
		navigate("/");
	}

	return (
		<form onSubmit={handleLogin}>
			<h5 className="mb-3">Login</h5>
			<div className="mb-3">
				<label className="form-label">Email</label>
				<input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
			</div>
			<div className="mb-3">
				<label className="form-label">Password</label>
				<input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
			</div>
			<button className="btn btn-primary w-100" disabled={loading}>{loading ? "Please wait..." : "Login"}</button>
			<div className="d-flex justify-content-between mt-3 small">
				<Link to="/forgot-password">Forgot password?</Link>
				<Link to="/signup">Create an account</Link>
			</div>
		</form>
	);
};

export default Login;
