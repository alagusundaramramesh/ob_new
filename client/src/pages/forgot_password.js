import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { forgotPassword } from "../services/api";

const ForgotPassword = () => {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);

	useEffect(() => {
		document.title = "Forgot password - OutputBooks";
	}, []);

	async function handleSubmit(e) {
		e.preventDefault();
		const result = await forgotPassword(email);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to send the link");
			return;
		}
		setSent(true);
	}

	if (sent) {
		return (
			<div>
				<h5>Check your email</h5>
				<p className="text-muted">If the email is registered, a link to reset the password has been sent.</p>
				<Link to="/login">Back to login</Link>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit}>
			<h5 className="mb-3">Forgot password</h5>
			<div className="mb-3">
				<label className="form-label">Email</label>
				<input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
			</div>
			<button className="btn btn-primary w-100">Send reset link</button>
			<div className="text-center mt-3 small"><Link to="/login">Back to login</Link></div>
		</form>
	);
};

export default ForgotPassword;
