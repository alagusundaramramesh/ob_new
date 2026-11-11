import React, { useState, useEffect } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import Header from "./header";
import Sidebar from "./sidebar";
import Footer from "./footer";
import { fetchUserData } from "../services/api";
import { useGlobalState, useGlobalDispatch } from "../contexts/user";

const Mainlayout = () => {
	const { user } = useGlobalState();
	const dispatch = useGlobalDispatch();
	const location = useLocation();
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const token = localStorage.getItem("token");

	// Reload the user, company and permissions each time the app is opened
	useEffect(() => {
		if (!token) {
			return;
		}
		async function loadUser() {
			const result = await fetchUserData();
			if (result.status === "S") {
				dispatch({ type: "SET_USER", payload: result.data });
			}
		}
		loadUser();
	}, [token]);

	// close the mobile menu after moving to another page
	useEffect(() => {
		setSidebarOpen(false);
	}, [location.pathname]);

	if (!token) {
		return <Navigate to="/login" replace />;
	}

	if (!user) {
		return (
			<div className="d-flex justify-content-center align-items-center vh-100">
				<div className="spinner-border text-primary" role="status" />
			</div>
		);
	}

	return (
		<>
			<Sidebar open={sidebarOpen} />
			<div className="ob-main d-flex flex-column">
				<Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
				<main className="ob-content flex-grow-1">
					<Outlet />
				</main>
				<Footer />
			</div>
		</>
	);
};

export default Mainlayout;
