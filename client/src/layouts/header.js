import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useGlobalState, useGlobalDispatch } from "../contexts/user";
import { switchCompany, createCompany } from "../services/api";

const Header = ({ onMenuClick }) => {
	const { user } = useGlobalState();
	const dispatch = useGlobalDispatch();
	const navigate = useNavigate();
	const [menuOpen, setMenuOpen] = useState(false);

	const logout = () => {
		dispatch({ type: "CLEAR_USER" });
		navigate("/login");
	};

	const changeCompany = async (c_id) => {
		if (c_id === user.company.c_id) {
			return;
		}
		const result = await switchCompany(c_id);
		if (result.status !== "S") {
			toast.error(result.message || "Unable to switch company");
			return;
		}
		localStorage.setItem("token", result.token);
		window.location.replace("/");
	};

	const addCompany = async () => {
		const name = window.prompt("Name of the new company");
		if (!name) {
			return;
		}
		const result = await createCompany({ name, state_code: user.company.state_code });
		if (result.status !== "S") {
			toast.error(result.message || "Unable to create the company");
			return;
		}
		localStorage.setItem("token", result.token);
		window.location.replace("/");
	};

	return (
		<header className="ob-topbar d-flex align-items-center justify-content-between">
			<div className="d-flex align-items-center gap-2">
				<button className="btn btn-outline-secondary d-lg-none" onClick={onMenuClick}>
					<i className="bi bi-list" />
				</button>
				<select className="form-select form-select-sm" style={{ minWidth: 200 }} value={user.company.c_id} onChange={(e) => changeCompany(parseInt(e.target.value))}>
					{user.companies.map((company) => (
						<option key={company.c_id} value={company.c_id}>{company.name}</option>
					))}
				</select>
				{user.user.is_prime_user && (
					<button className="btn btn-sm btn-outline-primary" onClick={addCompany} title="Add company">
						<i className="bi bi-plus-lg" />
					</button>
				)}
			</div>

			<div className="dropdown">
				<button className="btn btn-light dropdown-toggle" onClick={() => setMenuOpen(!menuOpen)}>
					<i className="bi bi-person-circle me-1" />{user.user.name} <span className="text-muted small">({user.role.role_name})</span>
				</button>
				{menuOpen && (
					<ul className="dropdown-menu dropdown-menu-end show">
						<li><button className="dropdown-item" onClick={() => { setMenuOpen(false); navigate("/my-account"); }}>My account</button></li>
						<li><hr className="dropdown-divider" /></li>
						<li><button className="dropdown-item" onClick={logout}>Logout</button></li>
					</ul>
				)}
			</div>
		</header>
	);
};

export default Header;
