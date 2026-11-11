/*
 * System (non company specific) master data.
 * This is the Mongo version of the PHP seed tables: ob_accountgroup, ob_account (cId = 0),
 * ob_sys_role_modules and ob_systaxtype. scripts/seed.js copies it to the database.
 */

// [group_code, name, parent_group_code, account_type, report_type]
// account_type: A - asset, L - liability, E - expense, I - income
// report_type : B - balance sheet, T - trading, P - profit and loss, L - loss
const ACCOUNT_GROUPS = [
    ['CP', 'Capital Account', '', 'L', 'B'],
    ['RS', 'Reserves & Surplus', 'CP', 'L', 'B'],
    ['CA', 'Current Assets', '', 'A', 'B'],
    ['BA', 'Bank Accounts', 'CA', 'A', 'B'],
    ['CH', 'Cash-in-hand', 'CA', 'A', 'B'],
    ['DA', 'Deposits (Asset)', 'CA', 'A', 'B'],
    ['LA', 'Loans & Advances (Asset)', 'CA', 'A', 'B'],
    ['SH', 'Stock-in-hand', 'CA', 'A', 'B'],
    ['SD', 'Sundry Debtors', 'CA', 'A', 'B'],
    ['CL', 'Current Liabilities', '', 'L', 'B'],
    ['TX', 'Duties & Taxes', 'CL', 'L', 'B'],
    ['EP', 'Provisions/Expenses Payable', 'CL', 'L', 'B'],
    ['SC', 'Sundry Creditors', 'CL', 'L', 'B'],
    ['ED', 'Direct Expenses', '', 'E', 'T'],
    ['EI', 'Indirect Expenses', '', 'E', 'L'],
    ['FA', 'Fixed Assets', '', 'A', 'B'],
    ['ID', 'Direct Income', '', 'I', 'T'],
    ['II', 'Indirect Income', '', 'I', 'P'],
    ['IN', 'Investments', '', 'A', 'B'],
    ['LO', 'Loans (Liability)', '', 'L', 'B'],
    ['BO', 'Bank O/D Account', 'LO', 'L', 'B'],
    ['SL', 'Secured Loans', 'LO', 'L', 'B'],
    ['UL', 'Unsecured Loans', 'LO', 'L', 'B'],
    ['PU', 'Purchase', '', 'E', 'T'],
    ['SA', 'Sales', '', 'I', 'T'],
    ['SU', 'Suspense Account', '', 'L', 'B'],
    ['CC', 'Credit Cards', 'LO', 'L', 'B'],
];

// [name, group_code, acc_code]
// acc_code is a fixed key the transaction engine uses to find the account (for example SALES, CGST_OUT)
const DEFAULT_ACCOUNTS = [
    ['Sales', 'SA', 'SALES'],
    ['Sales Returns', 'SA', 'SALES_RETURN'],
    ['Purchases', 'PU', 'PURCHASE'],
    ['Purchase Returns', 'PU', 'PURCHASE_RETURN'],
    ['Cash', 'CH', 'CASH'],
    ['Round Off', 'EI', 'ROUND_OFF'],
    ['Discount Allowed', 'EI', 'DISCOUNT_ALLOWED'],
    ['Discount Received', 'II', 'DISCOUNT_RECEIVED'],
    ['Opening Balance Equity', 'CP', 'OPENING_EQUITY'],
    ['Closing Stock', 'SH', 'CLOSING_STOCK'],
    ['Output CGST', 'TX', 'CGST_OUT'],
    ['Output SGST', 'TX', 'SGST_OUT'],
    ['Output IGST', 'TX', 'IGST_OUT'],
    ['Output Cess', 'TX', 'CESS_OUT'],
    ['Input CGST', 'TX', 'CGST_IN'],
    ['Input SGST', 'TX', 'SGST_IN'],
    ['Input IGST', 'TX', 'IGST_IN'],
    ['Input Cess', 'TX', 'CESS_IN'],
    ['TDS Receivable', 'LA', 'TDS_RECEIVABLE'],
    ['Advertising & Promotion', 'EI', ''],
    ['Bad Debts Written Off', 'EI', 'BAD_DEBT'],
    ['Travel Expense', 'EI', ''],
    ['IT and Internet Expenses', 'EI', ''],
    ['Depreciation Expenses', 'EI', ''],
    ['Insurance Expenses', 'EI', ''],
    ['Rent Expenses', 'EI', ''],
    ['Salary', 'EI', ''],
    ['Fuel Expenses', 'EI', ''],
    ['Printing & Stationery', 'EI', ''],
    ['Miscellaneous Expenses', 'EI', ''],
    ['Interest on loan', 'EI', ''],
    ['Interest Income', 'II', ''],
    ['Other Income', 'II', ''],
];

// [tax_type_code, name, state_type]
// state_type: I - inside the state, X - outside the state, A - any
const TAX_TYPES = [
    ['IGST', 'IGST', 'X'],
    ['CGST', 'CGST', 'I'],
    ['SGST', 'SGST', 'I'],
    ['UTGST', 'UTGST', 'U'],
    ['CESS', 'Cess', 'A'],
];

// GST slabs created for every new company. rate is the total GST rate
const DEFAULT_GST_RATES = [0, 5, 12, 18, 28];

// [mod_code, mod_name, role_codes]
// role_codes are the letters of the default roles that get the module
const SYS_MODULES = [
    ['DAS', 'Dashboard', 'C'],
    ['MNCUS', 'Customer', 'R,S,C,F,I'],
    ['MNSUP', 'Supplier', 'I,C,F'],
    ['MNITM', 'Items', 'R,S,I,F,C,K'],
    ['MNSTJ', 'Stock Journal', 'C,K'],
    ['MNPHY', 'Physical Stock', 'C,K'],
    ['SASAQ', 'Quotes', 'R,S,I,C,F'],
    ['SASAO', 'Sales Order', 'R,S,I,C,F'],
    ['SASDH', 'Delivery Challan', 'R,S,I,C,K,F'],
    ['SASAI', 'Sales Invoice', 'R,S,I,C,F'],
    ['SASAC', 'Sales Credit Note', 'R,S,I,C,F'],
    ['SASAD', 'Sales Debit Note', 'R,S,I,C,F'],
    ['SASAR', 'Receipt', 'R,S,I,C,F'],
    ['PUPUQ', 'Purchase Quotes', 'I,C,F'],
    ['PUPUO', 'Purchase Order', 'I,C,F'],
    ['PUPUG', 'Goods Receipt Note', 'I,C,K,R'],
    ['PUPUB', 'Purchase Bill', 'I,C,F'],
    ['PUPUP', 'Bill Payment', 'I,C,F'],
    ['PUPUC', 'Sup.Credit Note', 'I,C,F'],
    ['PUPUD', 'Sup.Debit Note', 'I,C,F'],
    ['BAN', 'Bank Transactions', 'C'],
    ['ACJRL', 'Journal Entry', 'C'],
    ['ACCCT', 'Cash Contra', 'C'],
    ['ACCHA', 'Chart of Accounts', 'C'],
    ['ACOPB', 'Opening Balances', 'C'],
    ['RLLDG', 'Ledger', 'C'],
    ['RLCUS', 'Customer Ledger', 'C'],
    ['RLSUP', 'Supplier Ledger', 'C'],
    ['RADAY', 'Daybook', 'C'],
    ['RATBL', 'Trial Balance', 'C'],
    ['RAPAL', 'Profit & Loss', 'C'],
    ['RABAS', 'Balance Sheet', 'C'],
    ['RTSAR', 'Sales Register', 'R,C,S,I'],
    ['RTPUR', 'Purchase Register', 'C,I'],
    ['RTOSR', 'Outstanding Receivables', 'R,C,S,I'],
    ['RTOSP', 'Outstanding Payables', 'C,I'],
    ['RTCUS', 'Customer Sales', 'R,C,S,I'],
    ['RTSUP', 'Supplier purchases', 'C,I'],
    ['RIITS', 'Item Sales', 'R,S,I,F,C'],
    ['RIITP', 'Item Purchases', 'I,F,C'],
    ['RSSTS', 'Stock Summary', 'R,S,I,F,C'],
    ['RSSTL', 'Stock Ledger', 'R,S,I,F,C'],
    ['RSRER', 'Reorder Report', 'R,S,I,F,C'],
    ['RRGS1', 'GSTR1', 'C'],
    ['RRGS3', 'GSTR3B', 'C'],
    ['REC', 'Recurring Invoices', 'C,F'],
    ['EINV', 'E-invoice', 'C,F'],
    ['SAEWB', 'E-way Bill', 'C,F'],
    ['SET', 'Settings', 'C'],
];

// Default roles of every company. role_code is the letter used in SYS_MODULES
const DEFAULT_ROLES = [
    { role_code: 'C', role_name: 'Admin' },
    { role_code: 'S', role_name: 'Sales' },
    { role_code: 'I', role_name: 'Purchase' },
    { role_code: 'F', role_name: 'Accountant' },
    { role_code: 'K', role_name: 'Storekeeper' },
    { role_code: 'R', role_name: 'Retail' },
];

// Transaction number series created for every new company [trans_type, prefix, start]
const DEFAULT_SERIES = [
    ['SE', 'QT-', 1],
    ['SO', 'SO-', 1],
    ['SH', 'DC-', 1],
    ['SI', 'INV-', 1],
    ['SR', 'RT-', 1],
    ['SC', 'CN-', 1],
    ['SD', 'DN-', 1],
    ['SP', 'RC-', 1],
    ['PQ', 'PQ-', 1],
    ['PO', 'PO-', 1],
    ['GR', 'GRN-', 1],
    ['PI', 'BILL-', 1],
    ['PC', 'PCN-', 1],
    ['PD', 'PDN-', 1],
    ['PP', 'PAY-', 1],
    ['J', 'JV-', 1],
    ['JC', 'CT-', 1],
];

// Payment modes created for every new company [name, account group code]
const DEFAULT_PAYMENT_MODES = [
    ['Cash', 'CH'],
    ['Cheque', 'BA'],
    ['Bank Transfer', 'BA'],
    ['UPI', 'BA'],
    ['Card', 'BA'],
];

module.exports = {
    ACCOUNT_GROUPS,
    DEFAULT_ACCOUNTS,
    TAX_TYPES,
    DEFAULT_GST_RATES,
    SYS_MODULES,
    DEFAULT_ROLES,
    DEFAULT_SERIES,
    DEFAULT_PAYMENT_MODES,
};
