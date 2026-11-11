import React from "react";

/* Small modal without the Bootstrap JavaScript */
const Modal = ({ title, onClose, children, size = "lg" }) => {
	return (
		<>
			<div className="modal-backdrop fade show" />
			<div className="modal fade show d-block" tabIndex="-1" role="dialog" onMouseDown={onClose}>
				<div className={`modal-dialog modal-${size} modal-dialog-scrollable`} onMouseDown={(e) => e.stopPropagation()}>
					<div className="modal-content">
						<div className="modal-header">
							<h5 className="modal-title">{title}</h5>
							<button type="button" className="btn-close" onClick={onClose} />
						</div>
						<div className="modal-body">{children}</div>
					</div>
				</div>
			</div>
		</>
	);
};

export default Modal;
