import React from "react";

/* Title of a page with the action buttons on the right */
const PageHeader = ({ title, subtitle, children }) => {
	return (
		<div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
			<div>
				<h4 className="mb-0">{title}</h4>
				{subtitle && <div className="text-muted small">{subtitle}</div>}
			</div>
			<div className="d-flex gap-2 flex-wrap">{children}</div>
		</div>
	);
};

export default PageHeader;
