# PHP to Node.js Migration Map

This document shows how the old PHP application (`D:\htdocs\OutputBooks`, CodeIgniter 4) maps to the new
React / Node.js / MongoDB project, what is already ported, and what is left. Use it to plan the next steps.

## 1. About the PHP source

- Framework: CodeIgniter 4, MySQL, 137 tables (`database/outputbooks.sql`), about 106,000 lines in `app/`.
- The PHP files in `app/` are **obfuscated** (strings are written as `"\x68\x6f..."` and the code flow uses `goto`).
  The new project was built from the SQL schema, the seed data (`ob_sys_role_modules`, `ob_accountgroup`, `ob_account`,
  `ob_systaxtype`), the constants (`app/Config/AppConstants.php`), the route list and the folder structure.
  The accounting rules of the transaction engine (what is debited / credited for each document type, the GST split, stock direction)
  are a standard double entry implementation for Indian GST that uses the **same document codes and table meaning** as the PHP version.
  **They are not a line by line port** of `TransModel` / `TransAccTable` (about 17,000 lines). Before using the new version for real
  books, compare the results of a few documents of each type with the PHP application (for example a sales invoice with discount and
  round off, a credit note, a receipt with TDS) and adjust `class.transaction.js` where they differ.
  To read the PHP code, decode the strings first (the script is in section 6).
- The licence / activation code (`ObLicense`, `ob_licensekey`, `ob_activationkey`, `ob_activetrial`, `Home::checklic`) was **not** ported.

## 2. Architecture mapping

| PHP (CodeIgniter 4) | Node.js / React |
|---------------------|-----------------|
| `app/Config/Routes.php`, auto routing `controller/method` | `server/api/api_router.js`: one `POST /api/<endpoint>` per route file |
| `app/Controllers/*.php` | `server/api/routes/*.js` (one file per endpoint) |
| `app/Models/*.php`, `app/Libraries/*Table.php` | MongoDB queries inside the routes, shared logic in `server/classes/class.*.js` |
| `app/Processors/*`, `app/Classes/Trans/*`, `app/Validators/*` | `server/classes/class.transaction.js` |
| `app/Filters/AuthFilter`, `RoleFilter`, `ApiKeyAuthFilter` | `server/api/middleware/token_auth.js` + `class.permission.js` |
| PHP session + cookie login | JWT (15 days) sent as `Authorization: Bearer` |
| `app/Views/*.php` (server rendered) + `assets/` (jQuery / Semantic UI) | React pages in `client/src/pages` |
| `app/Obo/*` cron jobs | `server/classes/class.cron.js` + `server/api/cronjobs` |
| `app/Config/AppConstants.php` | `server/common/inc.config.js` |
| `ob_sys_*` seed tables | `server/common/sys_data.js` |
| `app/Helpers/*.php` | `server/utils/*.js` and `client/src/utils/*.js` |
| `app/Language/en/*.php` | Messages are written in the code (no translation layer yet) |

## 3. Table to collection mapping

| MySQL table(s) | MongoDB collection | Changes |
|----------------|--------------------|---------|
| `ob_users` | `ob_users` | `id` -> `user_id`; password is bcrypt (the PHP hash cannot be reused, users must reset their password) |
| `ob_companies`, `ob_compsettings` | `ob_companies` | Settings used by this version only: state, currency, FY start, lock date, negative stock |
| `ob_compusers` | `ob_company_users` | |
| `ob_role`, `ob_role_permissions`, `ob_sys_role_modules` | `ob_roles` (`permissions[]`), `SYS_MODULES` | Action rights (view / add / edit / delete) are not split; a module is either allowed or not |
| `ob_accountgroup` | `ACCOUNT_GROUPS` in `sys_data.js` | Same group codes (`SD`, `SC`, `BA`, `CH` ...) |
| `ob_account`, `ob_account_loc` | `ob_accounts` | Opening balance is stored on the account |
| `ob_contacts`, `ob_contacts_address`, `ob_contacts_config` | `ob_contacts` | Addresses embedded; `csType` -> `cs_type`; a ledger account per contact (`con_acc_id`) |
| `ob_category` | `ob_categories` | Nested set (`lft`, `rgt`) replaced by `parent_id` |
| `ob_items`, `ob_items_cur`, `ob_item_images` | `ob_items` | `isInventory` -> `is_inventory`, `curStk` -> `cur_stk` ... Images not ported |
| `ob_tax`, `ob_taxdetail` | `ob_taxes` (`details[]`) | |
| `ob_series` | `ob_series` | |
| `ob_paymentmode` | `ob_payment_modes` | |
| `ob_bank`, `ob_banktrans` | `ob_banks`, `ob_bank_transactions` | |
| `ob_trans` + `ob_trans_items` + `ob_trans_tax` + `ob_trans_pay` + `ob_trans_payment` + `ob_trans_addr` | `ob_transactions` | Items, taxes, payments and allocations are embedded in one document |
| `ob_trans_acc` | `ob_trans_acc` | Same idea: one row per debit / credit line |
| `ob_stock_entries`, `ob_stock_items`, `ob_stock_ref` | `ob_stock_ledger` | One row per stock movement |
| `ob_sessions`, `ob_captcha`, `ob_users_auth_tokens` | - | Replaced by JWT |

Field naming: `camelCase` columns became `snake_case` fields (`transDate` -> `trans_date`, `conId` -> `con_id`, `totAmount` -> `tot_amount`).
Transaction type codes (`SI`, `PI`, `SP` ...) are **unchanged**, so documents can be imported later without a code mapping.

## 4. Feature coverage

Legend: **Done** = working and covered by the smoke test, **Partial** = a simpler version exists, **Not yet** = not ported.

### Core

| Feature | PHP controller / module | Status | Notes |
|---------|-------------------------|--------|-------|
| Login, signup, forgot / reset password | `User` | Done | Google login and captcha not ported |
| Companies, multi company, company settings | `Company` | Partial | Name, address, GSTIN, state, FY, lock date. Branches (`bId`) not ported |
| Users, roles, module permissions | `User`, `RoleFilter` | Done | No action level rights, no per-location access |
| Dashboard | `Dashboard` | Partial | Totals, monthly sales, low stock, recent documents |
| Chart of accounts | `Account` | Done | |
| Customers and suppliers | `Contacts` | Partial | One address list, credit days, GSTIN. Tags, credit limit, points, price list per contact not ported |
| Items, categories | `Items`, `Category` | Partial | Rates, tax, HSN, stock level, opening stock. Attributes, serial / batch, bundles, images, barcodes, units conversion not ported |
| Stock journal | `Stockjournal` | Partial | `stock_adjust` (one item at a time) |
| Taxes (GST) | `Tax` | Done | CGST + SGST / IGST by state. Cess is possible (add a part), VAT / sales tax of other countries not ported |
| Number series | `Series` | Partial | One default series per document type |
| Payment modes, banks | `Banktrans` | Partial | Statement lines and manual matching; no statement file import |

### Documents

| Feature | Status | Notes |
|---------|--------|-------|
| Quotes, sales orders, delivery challans | Done | Convert to the next document with `transaction_convert` |
| Sales invoices, credit / debit notes | Done | Tax split, ledger, stock, receipts |
| Receipts and payments with allocation | Done | TDS on receipts |
| Purchase quotes, orders, goods receipts, bills, notes, payments | Done | |
| Journal, cash contra | Done | |
| Retail sale (`SR`) | Partial | Backend supports it (customer optional); no POS screen |
| Opening balances (`AO`), expense invoices (`EI`), advance payments (`PA`) | Partial | Opening balances: one screen for all accounts with an automatic entry to Opening Balance Equity (not a dated document). Expense invoices and advance payments not yet |
| Job order (`JO`), manufacturing journal (`MJ`), BOM, transfer orders (`TO`, `TD`, `TR`), physical stock (`PS`) | Not yet | `Bom`, `Joborder`, `Storage_transactions`, modules `Storage` and `Order` |
| Reference between documents | Partial | `ref_id`; no partial conversion (quantity pending) |
| Approvals and workflows | Not yet | `Workflow`, `TransApproval` |
| Discount rules, max discount, negative item handlers | Partial | The discount % of a customer is the default discount of its lines; credit limit with block. Max discount and handlers not yet (`Trans/Handlers`) |

### Reports

| PHP report | New report | Status |
|------------|-----------|--------|
| `Report_ledger`, ledger summary | `report_ledger` | Done |
| `Report_accounts` daybook | `report_daybook` | Done |
| `Report_accounts` trial balance | `report_trial_balance` | Done |
| Profit and loss (`Report_profit`) | `report_profit_loss` | Partial (no invoice-wise / item-wise profit) |
| `Balancesheet` | `report_balance_sheet` | Partial (single company; `multiple_balancesheets` not ported) |
| `Report_transactions` sales / purchase register | `report_sales_register`, `report_purchase_register` | Done |
| Outstanding / aging | `report_outstanding` | Done |
| `Report_items` item sales | `report_item_sales` | Partial |
| `Report_stocks` stock summary / ledger | `report_stock_summary`, `report_stock_ledger` | Partial (valuation by item purchase rate, FIFO or weighted average; no aging, expiry, batch, reorder report page) |
| `Gstr` (GSTR-1, 2, 3B, 4, 9) | `report_gstr1`, `report_gstr3b`, `report_gst_summary` | GSTR-1 (with exports, SEZ, document issue table) and GSTR-3B JSON done, GSTR-2B reconciliation (`report_gstr2b`), GSTR-9 and GSTR-4 as figures (`report_gstr9`, `report_gstr4`, no JSON). Not done: amendments (B2BA, CDNRA), advances, deemed exports, ECO, GSTR-2A, GSTR-9C, CMP-08 JSON |
| Sales rep, referred by, tags, customer stock, supplier stock, margin claim, pending orders, postdated cheques, report builder, group / multiple reports | - | Not yet |

### Not yet ported (larger modules)

| Area | PHP location | Notes |
|------|--------------|-------|
| GST e-invoice (IRN) and e-way bill | `Einvoice`, `Ewb`, `ThirdParty/einvoice`, `EwbTransTable` | Done: IRN, QR code, cancel, e-way bill by IRN and direct, vehicle update, extend validity, transporter change, transporters, work lists. The TaxPro provider is written from the PHP code and the NIC API description but **not yet run against the real sandbox**. E-invoice for exports / SEZ / zero rated, consolidated e-way bills, bulk generation and dynamic QR are not ported |
| Digital signature of PDF | `Dsign`, `Libraries/DigitalSign` | |
| PDF print / email / SMS of documents | `Transaction::pdf`, `Views`, `mpdf`, `OutputSMS` | PDF download, email with attachment, 3 templates, logo, footer, terms and bank details are done. The PHP print designer (`ob_printsettings`, custom layouts per document) and SMS are not ported |
| Tally XML export / import, Excel export, `TransImport` | `Classes/Export`, `Classes/Import` | |
| Price lists / rate sheets | `Ratesheet`, `PriceList` | Done (percent + fixed rates + quantity slabs + validity, per contact). Franchise lists and the rate sheet import are not ported |
| Coupons, customer points, loyalty | `Coupons`, `CustomerPoints`, module `Points` | |
| POS / counter, KOT (restaurant), weighment, section | `Countertrans`, modules `Kot`, `Weighment`, `Section` | |
| E-commerce API and sync | module `Ecommerce`, `Api`, `Sync`, `EcomApiController` | Public API with API keys |
| Multi branch and multi currency | `bId` everywhere, `MulCurrencyModel`, `MultipleLedger` | |
| Other countries | modules `AUS`, `USA`, `IND` and `database/*.sql` country files | Only India (GST) |
| Recurring invoices | `Obo/RecurringTransaction`, `Obo/RecurringInvoice` | Done (sales invoice and purchase bill, see the project guide) |
| Payment reminders | `Obo/PaymentReminder` | Done by email (before due, overdue, manual). SMS / WhatsApp not ported |
| Weekly backup | `Obo/WeeklyBackup` | Not yet (use `mongodump` on the server) |
| Custom fields, attributes, barcode, cheque printing, budget, tags, attachments | `Fields`, `Attributes`, `Barcode`, `Cheque`, `Budget`, `Tag`, `Attachment` | Barcode (one per item, scan box on the invoice screen) and contact tags are done. The rest is not |
| Installer, updater, licence | module `Installer`, `Update`, `ObLicense` | Not needed in the new design |

## 5. Suggested order for the next work

1. **Run the MySQL import on a copy of real data** with invoices and compare the reports with the PHP app (see MYSQL_IMPORT.md and GO_LIVE_CHECKLIST.md).
2. **Try the e-invoice and e-way bill with TaxPro sandbox credentials** and compare with the PHP JSON (before any production use).
3. **Batch / serial items, bundles, attributes, item images, units conversion** (these change the stock engine).
4. **Print designer** (custom layout per document) and **SMS / WhatsApp** reminders (needs a provider account).
5. **Loyalty points**, max discount, expense invoices, advance payments.
6. **Branches** (add `b_id` to the collections and to the token) and **multi currency**.
7. POS screen for retail sale, Google login and captcha, dynamic QR for B2C.

Each step is a new route group, one class in `server/classes`, and a few pages; follow *How to add a new feature* in `PROJECT_GUIDE.md`.

## 6. Reading the obfuscated PHP

The PHP strings are escaped, which makes the code unreadable but does not change the logic. To read a file, decode the
`\xHH` and octal escapes (the `goto` blocks then read from label to label). A small Node script that does it:

```js
const fs = require('fs');
let code = fs.readFileSync(process.argv[2], 'latin1');
code = code.replace(/\\(x[0-9a-fA-F]{2}|[0-7]{1,3})/g, (match, escape) => {
    const charCode = escape[0] === 'x' ? parseInt(escape.slice(1), 16) : parseInt(escape, 8);
    const character = String.fromCharCode(charCode);
    if (charCode < 32 || charCode > 126) return match;
    return ['"', '\\', '$'].includes(character) ? '\\' + character : character;
});
fs.writeFileSync(process.argv[3], code);
```

The files with the most business logic, in the order they are worth reading: `Models/TransModel.php` (14,000 lines), `Libraries/TransAccTable.php`
(ledger posting), `Libraries/TransItems.php`, `Processors/*` (rules per document type), `Models/ItemsModel.php`, `Models/ContactsModel.php`,
`Controllers/Report_*.php`, `Controllers/Gstr.php`.
