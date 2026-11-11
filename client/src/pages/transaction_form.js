import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTransactionDetails } from "../services/api";
import ItemsForm from "../components/transactions/items_form";
import ReceiptForm from "../components/transactions/receipt_form";
import JournalForm from "../components/transactions/journal_form";
import transTypes from "../data/trans_types.json";

/* New document: /t/sales-invoice/new   Edit: /t/sales-invoice/12 */
const TransactionForm = () => {
	const { type_key, trans_id } = useParams();
	const transType = transTypes.find((item) => item.key === type_key);
	const [existing, setExisting] = useState(null);
	const [loading, setLoading] = useState(!!trans_id);
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		if (!trans_id) {
			setExisting(null);
			setLoading(false);
			return;
		}
		async function loadTransaction() {
			setLoading(true);
			const result = await getTransactionDetails(parseInt(trans_id));
			if (result.status === "S") {
				setExisting(result.data);
			} else {
				setErrorMessage(result.message || "Unable to load the document");
			}
			setLoading(false);
		}
		loadTransaction();
	}, [trans_id]);

	if (!transType) {
		return <div className="alert alert-warning">Unknown document type</div>;
	}
	if (loading) {
		return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
	}
	if (errorMessage) {
		return <div className="alert alert-danger">{errorMessage}</div>;
	}

	if (existing && existing.trans_type !== transType.type) {
		return <div className="alert alert-danger">This document is not a {transType.title}. Open it from its own list.</div>;
	}

	// key makes the form start fresh when another document is opened
	const formKey = `${type_key}-${trans_id || "new"}`;
	if (transType.kind === "receipt") {
		return <ReceiptForm key={formKey} transType={transType} existing={existing} />;
	}
	if (transType.kind === "journal") {
		return <JournalForm key={formKey} transType={transType} existing={existing} />;
	}
	return <ItemsForm key={formKey} transType={transType} existing={existing} />;
};

export default TransactionForm;
