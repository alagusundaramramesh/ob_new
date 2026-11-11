/* Same rule as server/classes/class.price_list.js: a fixed rate of the list, otherwise the master rate +/- the percent */
export function getListRate(priceList, itemId, baseRate) {
	const fixedRate = (priceList.rates || []).find((priceItem) => priceItem.item_id === itemId);
	if (fixedRate) {
		return fixedRate.rate;
	}
	return Math.round(baseRate * (1 + (priceList.adjust_percent || 0) / 100) * 100) / 100;
}

/* True when the list can be used on that date (yyyy-mm-dd) */
export function isListValid(priceList, date) {
	if (!priceList || !priceList.is_active) {
		return false;
	}
	const day = new Date(date);
	if (priceList.valid_from && day < new Date(priceList.valid_from)) return false;
	if (priceList.valid_till && day > new Date(priceList.valid_till)) return false;
	return true;
}
