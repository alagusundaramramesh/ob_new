/*
 * Preview of the totals while the user types an invoice.
 * The server calculates the real values when the document is saved (classes/class.transaction.js),
 * this uses the same formula so both match.
 */
// options.zeroRated: export / SEZ without payment of tax (no tax). options.reverseCharge: purchase where the buyer pays the tax to the government (not added to the total)
export function calculateTotals(lines, taxes, includeTax, sameState, roundOff = true, options = {}) {
	const stateType = sameState ? "I" : "X";
	const zeroRated = !!options.zeroRated;
	const reverseCharge = !!options.reverseCharge;
	let taxableAmount = 0;
	let totalTax = 0;

	const calculatedLines = lines.map((line) => {
		const qty = Number(line.qty) || 0;
		const rate = Number(line.rate) || 0;
		const grossAmount = qty * rate;
		const discAmount = line.disc_percentage ? (grossAmount * Number(line.disc_percentage)) / 100 : 0;
		const lineAmount = grossAmount - discAmount;

		const tax = taxes.find((item) => item.tax_id === Number(line.tax_id));
		const taxDetails = tax ? tax.details.filter((detail) => detail.state_type === stateType || detail.state_type === "A") : [];
		const totalTaxRate = taxDetails.reduce((sum, detail) => sum + detail.tax_rate, 0);

		const lineTaxable = includeTax && !zeroRated ? lineAmount / (1 + totalTaxRate / 100) : lineAmount;
		const lineTax = zeroRated ? 0 : taxDetails.reduce((sum, detail) => sum + Math.round(lineTaxable * detail.tax_rate) / 100, 0);
		taxableAmount += lineTaxable;
		totalTax += lineTax;
		return { ...line, taxable_amount: lineTaxable, tax_amount: lineTax, item_total: reverseCharge ? lineTaxable : lineTaxable + lineTax };
	});

	const rawTotal = Math.round((reverseCharge ? taxableAmount : taxableAmount + totalTax) * 100) / 100;
	const totalAmount = roundOff ? Math.round(rawTotal) : rawTotal;
	return {
		lines: calculatedLines,
		taxableAmount: Math.round(taxableAmount * 100) / 100,
		totalTax: Math.round(totalTax * 100) / 100,
		roundAmount: Math.round((totalAmount - rawTotal) * 100) / 100,
		totalAmount,
	};
}
