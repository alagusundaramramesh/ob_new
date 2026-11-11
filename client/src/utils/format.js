/* Money: 1234.5 -> 1,234.50 */
export function formatMoney(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Quantity: no trailing zeros */
export function formatQty(value) {
  return (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/* '2026-04-01T00:00:00.000Z' -> 01 Apr 2026 */
export function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/* Value for <input type="date"> */
export function toInputDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
}

/* Debit positive balance -> '1,000.00 Dr' */
export function formatBalance(value) {
  const amount = Number(value) || 0;
  if (amount === 0) {
    return "0.00";
  }
  return `${formatMoney(Math.abs(amount))} ${amount > 0 ? "Dr" : "Cr"}`;
}

/* Indian states with the GST state code. Used for the place of supply */
export const STATES = [
  { code: "35", name: "Andaman and Nicobar Islands" }, { code: "37", name: "Andhra Pradesh" },
  { code: "12", name: "Arunachal Pradesh" }, { code: "18", name: "Assam" }, { code: "10", name: "Bihar" },
  { code: "04", name: "Chandigarh" }, { code: "22", name: "Chhattisgarh" }, { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "07", name: "Delhi" }, { code: "30", name: "Goa" }, { code: "24", name: "Gujarat" }, { code: "06", name: "Haryana" },
  { code: "02", name: "Himachal Pradesh" }, { code: "01", name: "Jammu and Kashmir" }, { code: "20", name: "Jharkhand" },
  { code: "29", name: "Karnataka" }, { code: "32", name: "Kerala" }, { code: "38", name: "Ladakh" }, { code: "31", name: "Lakshadweep" },
  { code: "23", name: "Madhya Pradesh" }, { code: "27", name: "Maharashtra" }, { code: "14", name: "Manipur" }, { code: "17", name: "Meghalaya" },
  { code: "15", name: "Mizoram" }, { code: "13", name: "Nagaland" }, { code: "21", name: "Odisha" }, { code: "34", name: "Puducherry" },
  { code: "03", name: "Punjab" }, { code: "08", name: "Rajasthan" }, { code: "11", name: "Sikkim" }, { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" }, { code: "16", name: "Tripura" }, { code: "09", name: "Uttar Pradesh" }, { code: "05", name: "Uttarakhand" },
  { code: "19", name: "West Bengal" },
];
