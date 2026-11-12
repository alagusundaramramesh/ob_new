import React, { useEffect, useState } from "react";
import { getOfficeAssignments } from "../services/api";
import { formatDate } from "../utils/format";
import PageHeader from "../components/page_header";
import Pagination from "../components/pagination";

const OfficeAssignments = () => {
	const [assignments, setAssignments] = useState([]);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [search, setSearch] = useState("");
	const [view, setView] = useState("");
	const limit = 20;

	useEffect(() => {
		document.title = "Assignments - OutputBooks";
	}, []);

	useEffect(() => {
		loadAssignments();
	}, [page, view]);

	async function loadAssignments(searchText = search) {
		const result = await getOfficeAssignments({
			search: searchText,
			assign_status: view === "ACTIVE" || view === "RETURNED" ? view : "",
			overdue_only: view === "OVERDUE",
			page,
			limit,
		});
		if (result.status === "S") {
			setAssignments(result.data);
			setTotalCount(result.total_count);
		}
	}

	function handleSearch(e) {
		e.preventDefault();
		setPage(1);
		loadAssignments(search);
	}

	const isOverdue = (assignment) => assignment.assign_status === "ACTIVE" && assignment.to_date && new Date(assignment.to_date) < new Date(new Date().toISOString().slice(0, 10));

	return (
		<>
			<PageHeader title="Asset assignments">
				<select className="form-select w-auto" value={view} onChange={(e) => { setPage(1); setView(e.target.value); }}>
					<option value="">All</option>
					<option value="ACTIVE">In use</option>
					<option value="OVERDUE">Overdue</option>
					<option value="RETURNED">Returned</option>
				</select>
				<form className="d-flex gap-2" onSubmit={handleSearch}>
					<input className="form-control" placeholder="Person, tag or department" value={search} onChange={(e) => setSearch(e.target.value)} />
					<button className="btn btn-outline-secondary">Search</button>
				</form>
			</PageHeader>

			<div className="ob-card p-0 table-responsive">
				<table className="table table-hover table-ob mb-0">
					<thead>
						<tr><th>Asset</th><th>Person</th><th>From</th><th>To</th><th>Returned</th><th>Condition when given</th><th>Condition when returned</th></tr>
					</thead>
					<tbody>
						{assignments.map((assignment) => (
							<tr key={assignment.assignment_id}>
								<td>{assignment.asset_tag}<div className="text-muted small">{assignment.asset_name}</div></td>
								<td>{assignment.assigned_to}{assignment.department && <div className="text-muted small">{assignment.department}</div>}</td>
								<td>{formatDate(assignment.from_date)}</td>
								<td>{assignment.to_date ? formatDate(assignment.to_date) : "-"}</td>
								<td>
									{assignment.returned_on ? formatDate(assignment.returned_on) : <span className="badge bg-primary">In use</span>}
									{isOverdue(assignment) && <span className="badge bg-danger ms-1">Overdue</span>}
								</td>
								<td>{assignment.condition_out}</td>
								<td>{assignment.condition_in}</td>
							</tr>
						))}
						{assignments.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">No assignments found</td></tr>}
					</tbody>
				</table>
			</div>
			<Pagination page={page} totalCount={totalCount} limit={limit} onChange={setPage} />
		</>
	);
};

export default OfficeAssignments;
