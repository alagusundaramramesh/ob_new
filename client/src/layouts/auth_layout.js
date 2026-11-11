import React from "react";
import { Outlet, Navigate } from "react-router-dom";

/* Layout of the pages shown before login: login, signup, forgot / reset password */
const AuthLayout = () => {
	if (localStorage.getItem("token")) {
		return <Navigate to="/" replace />;
	}
	return (
		<div className="auth-wrapper">
			<div className="auth-card">
				<div className="text-center text-white mb-3">
					<h2 className="fw-bold"><i className="bi bi-journal-bookmark-fill me-2" />OutputBooks</h2>
					<div className="opacity-75">Accounting, inventory and GST billing</div>
				</div>
				<div className="ob-card shadow">
					<Outlet />
				</div>
			</div>
		</div>
	);
};

export default AuthLayout;
