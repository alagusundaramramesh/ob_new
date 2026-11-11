import React from "react";

/* Same markup as the pagination of cges.club (First / Previous / numbers / Next / Last) */
const Pagination = ({ page, totalCount, limit, onChange }) => {
	const totalPages = Math.ceil(totalCount / limit);
	if (totalPages <= 1) {
		return null;
	}

	return (
		<nav className="mt-3">
			<ul className="pagination justify-content-center flex-wrap">
				<li className={`page-item ${page === 1 ? "disabled" : ""}`}>
					<button className="page-link" onClick={() => onChange(1)}>First</button>
				</li>
				<li className={`page-item ${page === 1 ? "disabled" : ""}`}>
					<button className="page-link" onClick={() => onChange(page - 1)}>Previous</button>
				</li>
				{[...Array(totalPages)].map((_, index) => {
					const pageNumber = index + 1;
					const isVisible = pageNumber === 1 || pageNumber === totalPages || (pageNumber >= page - 1 && pageNumber <= page + 1);
					if (!isVisible) {
						return null;
					}
					return (
						<li key={pageNumber} className={`page-item ${pageNumber === page ? "active" : ""}`}>
							<button className="page-link" onClick={() => onChange(pageNumber)}>{pageNumber}</button>
						</li>
					);
				})}
				<li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
					<button className="page-link" onClick={() => onChange(page + 1)}>Next</button>
				</li>
				<li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
					<button className="page-link" onClick={() => onChange(totalPages)}>Last</button>
				</li>
			</ul>
		</nav>
	);
};

export default Pagination;
