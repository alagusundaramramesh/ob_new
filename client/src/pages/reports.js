import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useGlobalState } from "../contexts/user";
import PageHeader from "../components/page_header";
import reportList from "../data/report_list.json";

const Reports = () => {
	const { user } = useGlobalState();
	const allowedReports = reportList.filter((report) => user.permissions.includes(report.mod_code));
	const groups = [...new Set(allowedReports.map((report) => report.group))];

	useEffect(() => {
		document.title = "Reports - OutputBooks";
	}, []);

	return (
		<>
			<PageHeader title="Reports" />
			{groups.map((group) => (
				<div className="mb-4" key={group}>
					<h6 className="text-muted text-uppercase">{group}</h6>
					<div className="row g-3">
						{allowedReports.filter((report) => report.group === group).map((report) => (
							<div className="col-md-6 col-xl-4" key={report.name}>
								<Link to={`/reports/${report.name}`} className="text-decoration-none text-reset">
									<div className="ob-card h-100">
										<div className="fw-bold">{report.title}</div>
										<div className="text-muted small">{report.info}</div>
									</div>
								</Link>
							</div>
						))}
					</div>
				</div>
			))}
		</>
	);
};

export default Reports;
