# OutputBooks - Project Guide

This guide explains how the React / Node.js / MongoDB version of OutputBooks is built, so a new developer can read,
run and extend it. For what was taken from the old PHP application see [PHP_MIGRATION_MAP.md](PHP_MIGRATION_MAP.md).

## Contents

1. [What the application does](#1-what-the-application-does)
2. [Technology and conventions](#2-technology-and-conventions)
3. [Folder structure](#3-folder-structure)
4. [Running the project](#4-running-the-project)
5. [How a request flows](#5-how-a-request-flows)
6. [Multi company, users, roles and permissions](#6-multi-company-users-roles-and-permissions)
7. [Data model (MongoDB collections)](#7-data-model-mongodb-collections)
8. [The transaction engine](#8-the-transaction-engine)
9. [API reference](#9-api-reference)
10. [Reports](#10-reports)
11. [The React client](#11-the-react-client)
12. [How to add a new feature](#12-how-to-add-a-new-feature)
13. [Testing](#13-testing)
14. [Known limits and next steps](#14-known-limits-and-next-steps)

---

## 1. What the application does

OutputBooks is a small business accounting package for Indian GST billing:

- **Sales:** quotes, sales orders, delivery challans, invoices, credit notes, debit notes, receipts.
- **Purchases:** purchase quotes, orders, goods receipts, bills, supplier credit / debit notes, payments.
- **Inventory:** items (products and services), categories, stock adjustments, reorder levels, stock reports.
- **Accounting:** chart of accounts, journal entries, cash contra, banking and bank statement matching.
- **Printing and email:** PDF of every document with 3 templates, company logo, footer, terms and bank details; email with the PDF attached.
- **Price lists** per customer / supplier and **recurring invoices** created automatically by a daily job.
- **Payment reminders** by email (automatic and manual) and **GSTR-1 / GSTR-3B** returns with the JSON file for the GST portal.
- **E-invoice (IRN, QR code)** and **e-way bill** (by IRN or direct, vehicle update, cancel) with a test provider and the TaxPro provider.
- **Reports:** ledger, daybook, trial balance, profit and loss, balance sheet, sales / purchase register,
  outstanding and aging, item sales, stock summary, stock ledger, GST summary.
- **Administration:** many companies per user, users, roles with module permissions, taxes, number series,
  payment modes, books lock date.

Everything is **double entry**: every sales invoice, bill, receipt or journal creates balanced debit / credit
entries in the ledger, and every reports reads those entries.

## 2. Technology and conventions

| Part | Technology |
|------|-----------|
| Client | React 18, React Router 6 (`createBrowserRouter`), Bootstrap 5, react-toastify, chart.js |
| Server | Node.js, Express 4, MongoDB native driver (no Mongoose), JWT, bcrypt, node-cron, nodemailer |
| Database | MongoDB. Redis is optional (`CAN_ENABLE_REDIS` in `server/common/inc.config.js`, off by default) |

The project follows the structure and style of the `cges.club` project:

- **One route file per endpoint** in `server/api/routes`, written as `router.post('/', async (req, res) => {...})`.
- **Every endpoint is a `POST`** with a JSON body. Responses use `status`: `"S"` success, `"E"` error (with `message`),
  `"UA"` unauthorized (the client logs the user out).
- Server logic that is shared lives in **`server/classes/class.*.js`**, helpers in `server/utils`, constants in `server/common`.
- The database object comes from `res.locals.dbobj` (`const dbobj = res.locals.dbobj`). Redis (if enabled) is `res.locals.redisobj`.
- Files are `snake_case`; the client has `pages`, `components`, `layouts`, `contexts`, `services`, `utils`, `data` like cges.club.
- The client calls the server through `client/src/services/api.js`, a user is kept in `contexts/user.js`.

Code rules used in this project (also in `.claude/CLAUDE.md`): simple readable JavaScript, early returns for errors,
meaningful names (`pending_invoices`, not `data`), `try/catch` in every route, no secrets in logs.
Field names in MongoDB are `snake_case` (`trans_date`, `con_id`, `tot_amount`).

## 3. Folder structure

```
ob_new/
├── README.md
├── docs/                         This documentation
├── server/
│   ├── app.js                    Entry point: new Server().start()
│   ├── package.json
│   ├── .env.example              PORT, MONGODB_URI, DB_NAME, X_API_KEY, JWT_SECRET, SMTP_*, REDIS_*
│   ├── classes/
│   │   ├── class.server.js       Express + MongoDB start, middleware, serves client/build
│   │   ├── class.redis.js        Optional Redis helper
│   │   ├── class.cron.js         Scheduled jobs (node-cron)
│   │   ├── class.permission.js   Endpoint -> module code, role check
│   │   ├── class.company_setup.js  Creates a company with roles, accounts, taxes, series, payment modes
│   │   ├── class.invoice_pdf.js  PDF of a document: templates, logo, footer (pdfkit)
│   │   ├── class.price_list.js   Rate of an item for a price list
│   │   ├── class.recurring.js    Recurring invoice profiles and the job that creates the documents
│   │   ├── class.reminder.js     Payment reminders: rules, sending, log
│   │   ├── class.gst_return.js   GSTR-1 and GSTR-3B JSON
│   │   ├── class.einvoice.js     E-invoice and e-way bill: checks, calls, saving, log
│   │   ├── class.einvoice_formatter.js  IRP JSON (schema 1.1) and the checks before sending
│   │   ├── class.einvoice_mock.js       TEST provider (no government call)
│   │   ├── class.einvoice_taxpro.js     TaxPro provider (real)
│   │   ├── class.secret.js       AES-256-GCM for the saved portal passwords
│   │   ├── class.transaction.js  THE TRANSACTION ENGINE (tax, ledger, stock, allocation, save, delete)
│   │   └── class.report.js       Balances, trial balance rows, stock position
│   ├── common/
│   │   ├── inc.config.js         App constants: transaction type codes, status codes, defaults
│   │   ├── sys_data.js           System data: account groups, default accounts, modules, roles, series
│   │   └── indexes.js            MongoDB indexes, created at start
│   ├── api/
│   │   ├── api_router.js         All /api/... endpoints
│   │   ├── app_router.js         /ping and manual cron runs
│   │   ├── middleware/
│   │   │   ├── standard.js       body parser, cors, upload, access log
│   │   │   └── token_auth.js     x-api-key / JWT check, permission check
│   │   ├── routes/               One file per endpoint (about 60 files)
│   │   └── cronjobs/             overdue_invoices.js, recurring_transactions.js, payment_reminders.js
│   ├── utils/                    util.functions.js, util.error.js, util.email_templates.js
│   └── scripts/
│       ├── seed.js               Demo data
│       └── smoke_test.js         End to end API test
└── client/
    ├── package.json
    ├── .env.example              REACT_APP_API_URL, REACT_APP_X_API_KEY
    ├── public/index.html
    └── src/
        ├── index.js, App.js      Router and providers
        ├── services/api.js       Every API call
        ├── contexts/user.js      Logged in user, company, permissions
        ├── layouts/              mainlayout, header, sidebar, footer, auth_layout
        ├── pages/                One file per screen
        ├── components/           pagination, modal, page_header, contacts/, transactions/
        ├── data/                 trans_types.json (document types), report_list.json
        └── utils/                format.js (money, dates, states), tax_calc.js (invoice preview)
```

## 4. Running the project

Requirements: Node.js 18+, MongoDB 5+.

`server/.env`

| Variable | Meaning |
|----------|---------|
| `PORT` | API port (default in the example: 8100) |
| `MONGODB_URI`, `DB_NAME` | MongoDB connection and database name |
| `X_API_KEY` | Secret sent by the client in the `x-api-key` header for login / signup |
| `JWT_SECRET` | Secret used to sign the login token (15 days) |
| `SMTP_*` | Optional. Without `SMTP_HOST` mails (welcome, reset password) are only logged |
| `REDIS_*` | Only used when `CAN_ENABLE_REDIS` is true |
| `SEED_EMAIL`, `SEED_PASSWORD` | Optional login of the demo user created by `npm run seed` |

`client/.env`: `REACT_APP_API_URL` (server address) and `REACT_APP_X_API_KEY` (same value as the server `X_API_KEY`).

Commands

| Where | Command | What it does |
|-------|---------|--------------|
| server | `npm start` | Start with nodemon |
| server | `npm run prod` | Start with node |
| server | `npm run seed` | Create the demo company (skipped when it already exists) |
| server | `npm test` | Run the API test against the running server |
| client | `npm start` | Development server on port 3000 |
| client | `npm run build` | Production build; the server then serves it |

## 5. How a request flows

```
React page
  -> services/api.js  callApi('transaction_save', {...})     POST  /api/transaction_save
        headers: x-api-key  (always)   Authorization: Bearer <JWT>  (after login)
  -> api/middleware/token_auth.js
        1. pre-login endpoint (login, signup, forgot_password, reset_password): checks x-api-key
        2. any other endpoint: verifies the JWT, then COPIES the token values into the body:
              body.user_id, body.c_id, body.auth_email, body.auth_role_id
           (the client can not choose its company: c_id always comes from the token)
        3. finds the module of the endpoint (class.permission.js) and checks the role has it
  -> api/routes/<endpoint>.js   uses res.locals.dbobj, answers { status: "S", ... } or { status: "E", message }
```

Rules to remember:

- Every query on company data **must** contain `c_id`. It is taken from the token, never from user input.
- Names `user_id`, `c_id`, `auth_email`, `auth_role_id` are reserved for the logged in user.
  Use other names for the target of an action (for example `delete_user_id`, `target_c_id`, and `role_id` for "the role being edited").
- Business problems are thrown as `BusinessError` (`utils/util.error.js`) and sent to the client by `sendError`.
  Unexpected errors are logged on the server and the client only gets `Unable to process request`.
- `"UA"` makes the client delete the token and go to the login page.

## 6. Multi company, users, roles and permissions

- A **user** (`ob_users`) can belong to many **companies** (`ob_companies`) through `ob_company_users`, with one role per company.
- The login token contains `user_id`, `c_id`, `role_id`. `switch_company` returns a new token for another company.
- The first user of a company (created by `signup`) is the **primary user** with the **Admin** role.
- A **role** (`ob_roles`) has a list of **module codes** (`permissions`), for example `SASAI` (sales invoice), `RATBL` (trial balance).
  The full list is in `server/common/sys_data.js` (`SYS_MODULES`) and is the same as the PHP `ob_sys_role_modules`.
- The Admin role (`role_code = 'C'`) has every module and cannot be edited.
  New companies get 6 default roles: Admin, Sales, Purchase, Accountant, Storekeeper, Retail. More roles can be added in *Settings > Roles*.
- `class.permission.js` maps endpoints to modules. Transaction endpoints use the module of `trans_type`
  (`transaction_details` and `transaction_delete` look at the stored document, because the request has no `trans_type`).
- The sidebar of the client shows a link only when the module is in `user.permissions`.

## 7. Data model (MongoDB collections)

Ids are numbers generated by `UTILS.getNextId(dbobj, 'collection')` (collection `ob_counters`, atomic).
Every document has `stat`: `"A"` active or `"D"` deleted (soft delete). Always query with `stat: "A"`.

| Collection | Main fields | Notes |
|------------|-------------|-------|
| `ob_users` | `user_id, name, email, password (bcrypt), default_c_id, is_prime_user, is_active` | Email is unique |
| `ob_companies` | `c_id, name, state_code, country_code, currency, fy_start, tax_no, locked_till, allow_negative_stock` | `state_code` decides CGST+SGST or IGST |
| `ob_company_users` | `user_id, c_id, role_id` | Link between a user and a company |
| `ob_roles` | `role_id, c_id, role_code, role_name, permissions[]` | |
| `ob_accounts` | `acc_id, c_id, name, group_code, acc_code, opening_balance, is_system` | Chart of accounts. `acc_code` marks accounts the engine needs (SALES, CGST_OUT ...) |
| `ob_contacts` | `con_id, c_id, cs_type (C/S), name, state_code, tax_no, credit_days, con_acc_id, addresses[]` | Each contact has its own ledger account `con_acc_id` (Sundry Debtors / Creditors) |
| `ob_categories` | `category_id, c_id, name, parent_id` | |
| `ob_items` | `item_id, c_id, name, type (P/S), sku, hs, uom, sale_rate, purchase_rate, tax_id, is_inventory, cur_stk, stk_level` | `cur_stk` is kept in step with `ob_stock_ledger` |
| `ob_taxes` | `tax_id, c_id, name, details[{tax_type_code, tax_rate, state_type}]` | `state_type` I = inside state (CGST, SGST), X = other state (IGST) |
| `ob_series` | `series_id, c_id, trans_type, prefix, suffix, nxt_number` | Document numbers, for example `INV-12` |
| `ob_payment_modes` | `pay_mode_id, c_id, name, acc_group_code` | |
| `ob_banks` | `bank_id, c_id, acc_id, bank_name, acc_number ...` | Each bank has a ledger account `acc_id` |
| `ob_bank_transactions` | `btr_id, bank_id, btr_date, debit, credit, matched_trans_id, is_reconciled` | Bank statement lines |
| `ob_price_lists` | `price_list_id, c_id, name, list_type (S/P), adjust_percent, rates[{item_id, rate}], valid_from, valid_till` | Contacts point to one with `price_list_id` |
| `ob_reminders` | `reminder_id, c_id, trans_id, trans_no, kind (before/overdue/manual), sent_to, pending_amount, status (sent/failed), error, sent_on` | Log of every reminder; stops the same reminder going out twice |
| `ob_einvoice_credentials` | `c_id, api_username, api_password_enc` | GST portal API user of the company. The password is encrypted and never sent to the client |
| `ob_einvoice_log` | `c_id, trans_id, action, provider, mode, is_ok, error_code, error_message, at` | Every call to the provider (no payloads, no passwords) |
| `ob_transporters` | `tp_id, c_id, name, gstin` | Transporters for the e-way bill |
| `ob_recurring` | `recurring_id, c_id, name, source_trans_id, frequency (W/M/Q/Y), next_date, end_date, auto_email, is_active, run_count, last_error` | |
| `ob_transactions` | see below | Every document (invoice, bill, receipt, journal ...) |
| `ob_trans_acc` | `trans_id, c_id, acc_id, trans_date, debit, credit, desc, con_id` | The **ledger**: one row per debit / credit line |
| `ob_stock_ledger` | `trans_id, c_id, item_id, trans_date, qty_in, qty_out, rate, trans_type` | Stock movements (`trans_id` 0 = opening stock `OP` or adjustment `ST`) |

System data that is the same for all companies is not in the database but in `server/common/sys_data.js`:
account groups (`ACCOUNT_GROUPS`), default accounts, GST slabs, modules, default roles, default number series, payment modes.
`CompanySetup.createDefaults` copies them for each new company.

### The `ob_transactions` document

```js
{
  trans_id: 12, c_id: 1, trans_type: 'SI', trans_no: 'INV-3', series_id: 4,
  trans_date: ISODate('2026-11-11'), due_date: ISODate(...), ref: '', notes: '',
  con_id: 5, con_name: 'Chennai Retail Stores', con_tax_no: '33AABCC1234D1Z5',
  dst_state_code: '33',                      // place of supply
  include_tax: false,                        // rates include tax?
  items: [{ item_id, item_name, hs, unit, qty, free_qty, rate, disc_percentage, disc_amount,
            taxable_amount, tax_id, tax_name, taxes: [{ tax_type_code, tax_rate, tax_value }], item_total }],
  tax_summary: [{ tax_type_code: 'CGST', tax_rate: 9, tax_value: 324 }, ...],
  taxable_amount: 3600, tot_tax: 648, round_amount: 0, tot_amount: 4248,
  payments: [{ acc_id, amount }], inline_paid: 0,   // amount paid at billing time
  rec_amt: 2000,                             // total received / paid so far (inline + receipts)
  status: 'S',                               // S open, P paid, O overdue
  // receipts and payments (SP / PP):
  pay_acc_id, pay_ref, tds_amount, allocations: [{ trans_id, amount }],
  // journals (J / JC):
  lines: [{ acc_id, debit, credit, desc }],
  ref_id, ref_trans_type,                    // document this one was created from
  stat: 'A', updated_by, updated_on, crd_on
}
```

## 8. The transaction engine

All the accounting rules are in **`server/classes/class.transaction.js`**. The route `transaction_save` only calls
`TRANSACTION.save(dbobj, company, input, user_email)`. Reading this file is the best way to understand the application.

### Document types

The codes are the same as the PHP application, defined in `common/inc.config.js` (`TRANS_TYPES`).

| Code | Document | Ledger entries | Stock |
|------|----------|:--------------:|:-----:|
| `SE` | Quote | no | no |
| `SO` | Sales order | no | no |
| `SH` | Delivery challan | no | out |
| `SI` | Sales invoice | yes | out |
| `SR` | Retail sale (customer optional) | yes | out |
| `SC` | Sales credit note (return) | yes | in |
| `SD` | Sales debit note | yes | no |
| `SP` | Receipt from a customer | yes | no |
| `PQ` | Purchase quote | no | no |
| `PO` | Purchase order | no | no |
| `GR` | Goods receipt | no | in |
| `PI` | Purchase bill | yes | in |
| `PC` / `PD` | Supplier credit / debit note (purchase return) | yes | out |
| `PP` | Payment to a supplier | yes | no |
| `J` / `JC` | Journal / cash contra | yes | no |

An invoice or bill made **from** a delivery challan / goods receipt (`ref_trans_type` `SH` / `GR`) does not move stock again.

### Tax

For every item line the engine finds the tax (`ob_taxes`) and applies the parts for the place of supply:
`dst_state_code` equal to the company `state_code` (or empty) means **in state**: CGST + SGST parts. Otherwise **other state**: IGST part.
If `include_tax` is true the rate already contains the tax and the taxable amount is `amount / (1 + rate/100)`.
The total is rounded to a whole rupee by default and the difference is posted to the *Round Off* account.

### Ledger posting

Sales invoice `SI` (4,248 = 3,600 + 324 CGST + 324 SGST):

| Account | Debit | Credit |
|---------|------:|-------:|
| Customer (Sundry Debtors) | 4,248 | |
| Sales | | 3,600 |
| Output CGST | | 324 |
| Output SGST | | 324 |

| Document | Debit | Credit |
|----------|-------|--------|
| Purchase bill `PI` | Purchases, Input CGST / SGST / IGST | Supplier |
| Sales credit note `SC` | Sales Returns, Output tax | Customer |
| Supplier credit / debit note `PC`, `PD` | Supplier | Purchase Returns, Input tax |
| Receipt `SP` | Bank / cash (amount - TDS), TDS Receivable | Customer |
| Payment `PP` | Supplier | Bank / cash |
| Journal `J`, contra `JC` | lines typed by the user | |

When an invoice is saved with an amount received at the same time (`payments`), the engine also posts `Dr bank / Cr customer`.
`buildLedgerLines` refuses to save when total debit is not equal to total credit.

### Receipts and payments (allocation)

A receipt / payment carries `allocations: [{ trans_id, amount }]`. The engine checks that each invoice exists, belongs to the same
contact, and that the amount is not more than the pending amount; then it adds the amount to the invoice `rec_amt` and sets its status
(`P` when fully paid). An allocation total above the receipt amount is refused. What is not allocated stays on the customer account as an advance.

### Save, edit, delete

`save()` does the following, in this order:

1. Validate type, date, **books lock** (`company.locked_till`), contact (customer for sales documents, supplier for purchase documents).
2. Build the document (`buildTransaction`): items, tax, totals, payments / allocations / journal lines.
3. On **edit**: remove the old effects (ledger rows, stock rows, allocations), keep the document number.
4. Take the next document number from the series (new documents only).
5. Check the stock (when the company does not allow negative stock).
6. Write the document, then post ledger, stock and allocations.

MongoDB transactions are not used (the project must also run on a standalone MongoDB). Instead, when a step fails
`rollbackSave` restores the old document and its effects, so a failed edit leaves the data unchanged (this is covered by the smoke test).

`remove()` is a soft delete. It is refused when receipts / payments are allocated to the document ("Delete the receipts first")
or when another document was created from it. A delete removes the ledger and stock effects.

`transaction_convert` creates a new document from an existing one (quote -> order -> invoice ...). The allowed conversions are in
`transaction_convert.js` (`CONVERT_RULES`).

## 9. API reference

Base URL `http://localhost:8100/api/<endpoint>`, method `POST`, JSON body.
Headers: `x-api-key` for the pre-login endpoints; `Authorization: Bearer <token>` for all the others.
Lists accept `page` and `limit` (default 20, maximum 500) and answer `{ status, data, total_count, page, limit }`.

| Group | Endpoint | Purpose |
|-------|----------|---------|
| Auth | `login` | email + password -> `token` |
| | `signup` | user + first company -> `token` |
| | `forgot_password`, `reset_password` | Mail a reset link, set a new password |
| | `get_user_data` | User, company, role, permissions, company list |
| | `switch_company`, `company_create`, `company_update` | Multi company and company settings |
| | `change_password` | |
| Users | `user_list`, `user_save`, `user_delete` | Users of the company |
| | `role_list`, `role_save` | Roles and module permissions |
| Dashboard | `dashboard` | Sales, purchases, receivables, payables, cash, monthly sales, low stock |
| Accounts | `account_group_list`, `account_list`, `account_save`, `account_delete` | Chart of accounts (with balances) |
| Contacts | `contact_list`, `contact_save`, `contact_details`, `contact_delete` | `cs_type` `C` customer / `S` supplier |
| Items | `item_list`, `item_save`, `item_details`, `item_delete`, `stock_adjust` | |
| | `category_list`, `category_save`, `category_delete` | |
| Settings | `tax_list`, `tax_save`, `tax_delete` | |
| | `series_list`, `series_save` | Document numbering |
| | `payment_mode_list`, `payment_mode_save` | Also returns the bank / cash accounts |
| Banking | `bank_list`, `bank_save` | |
| | `bank_transaction_list`, `bank_transaction_save` | Statement lines and reconciliation |
| Documents | `transaction_list`, `transaction_save`, `transaction_details`, `transaction_delete`, `transaction_convert` | Every document type, selected by `trans_type` |
| | `transaction_pdf` | PDF of a document (`application/pdf`, made with pdfkit in `class.invoice_pdf.js`) |
| | `transaction_email` | Mails the PDF to the customer / supplier (needs the SMTP settings) |
| Printing | `print_settings_save` | Template, colour, footer, terms, bank details, signature line |
| | `company_logo_save`, `company_logo_delete` | Logo as a data url (PNG / JPEG, up to 500 KB) |
| Price lists | `price_list_list`, `price_list_save`, `price_list_delete` | |
| Recurring | `recurring_list`, `recurring_save`, `recurring_delete` | Needs the module `REC` |
| Reminders | `reminder_settings_save` | Switch on / off, days before due, repeat days, maximum |
| | `reminder_send` | Send a reminder for one invoice now (needs the module `RTOSR`) |
| | `reminder_log` | History of the reminders, optionally of one invoice |
| E-invoice | `einvoice_settings_get`, `einvoice_settings_save` | Switch on, mode, portal user and password (module `SET`) |
| | `einvoice_check`, `einvoice_generate`, `einvoice_cancel` | Module `EINV`. `check` lists what is wrong and the JSON that would be sent |
| | `einvoice_worklist` | `kind`: `einvoice_pending`, `einvoice_done`, `ewb_pending`, `ewb_done` |
| E-way bill | `ewb_check`, `ewb_generate`, `ewb_cancel`, `ewb_update_vehicle` | Module `SAEWB` |
| | `transporter_list`, `transporter_save`, `transporter_delete` | Module `SAEWB` |
| GST returns | `report_gstr1`, `report_gstr3b` | `month` = `"2026-11"`. Answer: `{ period, gstin, json, summary, warnings }` |
| Reports | `report_ledger`, `report_daybook`, `report_trial_balance`, `report_profit_loss`, `report_balance_sheet` | |
| | `report_sales_register`, `report_purchase_register`, `report_outstanding`, `report_item_sales` | |
| | `report_stock_summary`, `report_stock_ledger`, `report_gst_summary` | |

Internal (not under `/api`, header `x-api-key`): `GET /ping`, `POST /cron/overdue_invoices`, `POST /cron/recurring_transactions`, `POST /cron/payment_reminders`.

### Print templates and logo

`company.print_settings` holds `template` (`classic`, `modern`, `compact`), `accent_color`, `footer_text`, `terms`, `show_bank` / `bank_id` and `show_signature`.
The logo file is saved in `server/uploads/logos` and its name is in `company.logo_file` (the server also serves it under `/uploads/logos/...`).
The server checks the first bytes of the image, so a text file renamed to `.png` is refused. All drawing is in `class.invoice_pdf.js`; to add a template,
add its name to `TEMPLATES` and set what differs in the `theme` object of `build()`.
Settings screen: *Settings > Print & logo* (with a preview button that opens the latest invoice).

### Price lists

A price list has a percent change for all items, optional fixed rates per item, and an optional valid-from / valid-till. A customer uses a list of type `S`,
a supplier one of type `P` (set in the contact). When a document line is saved **without a rate**, the engine uses the list of the contact (if it is valid on the
document date): the fixed rate, otherwise the item rate changed by the percent. A rate typed by the user is never changed. The invoice form shows the same rate
when an item is selected (`client/src/utils/price_list.js` has the same rule as `class.price_list.js`).

### Payment reminders

Settings (*Settings > Reminders*, stored in `company.reminder_settings`): on / off, **days before the due date** (one reminder, 0 = none), **repeat every N days after the
due date** (0 = none) and a **maximum number** of overdue reminders. The job `payment_reminders` runs every day at 09:30 for every company that switched it on
and looks at the unpaid sales invoices and debit notes that have a due date:

- Due within the "before" days and no "before" reminder sent yet: sends one (also if the server was off on the exact day).
- Overdue: sends the first overdue reminder; the next ones only after the repeat days, up to the maximum.
- A customer without an email address, or with *Do not send payment reminders* ticked in the customer form, is skipped.
- Every mail has the invoice PDF attached and is written to `ob_reminders`. A failed mail is logged as `failed` and tried again at the next run.
- The invoice view has a **Send reminder** button (kind `manual`; it does not count for the schedule) and shows the last reminders.
- Without SMTP settings the job does nothing and writes no log, so nothing is lost when SMTP is configured later. Run it by hand: `POST /cron/payment_reminders` with the `x-api-key` header.

### GSTR-1 and GSTR-3B

`report_gstr1` and `report_gstr3b` (screens *Reports > GSTR-1 / GSTR-3B*) build the return of a month from the documents of that month. The company needs a valid
15 character GSTIN (*Settings > Company*). The screen shows a summary and warnings and has a **Download JSON** button; the file is for the GST offline tool / portal.
The rules are in `class.gst_return.js`:

| GSTR-1 table | What goes in |
|--------------|--------------|
| `b2b` | Invoices to buyers with a valid GSTIN, grouped by GSTIN. Items are grouped by rate. |
| `b2cl` | Inter-state invoices to unregistered buyers above Rs. 2,50,000, grouped by place of supply |
| `b2cs` | All other unregistered sales (retail sales included), summed by state and rate. Credit notes of unregistered buyers are **subtracted** here |
| `cdnr` / `cdnur` | Credit notes (`C`) and debit notes (`D`) of registered buyers / large inter-state unregistered buyers |
| `nil` | Items with a 0% tax, by supply type (`INTRAB2B`, `INTERB2C` ...) |
| `hsn` | Quantity, value and tax per HSN / SAC, rate and unit; credit notes reduce it. The unit of the item is mapped to the portal unit code (Nos -> NOS, Kg -> KGS, other -> OTH) |

GSTR-3B has: 3.1(a) outward taxable supplies (net of credit notes), the nil rated value, 3.2 inter-state supplies to unregistered buyers by state, input tax credit
(purchases minus supplier credit / debit notes, shown under `OTH`) and inward nil rated supplies. The screen also shows the tax payable per head (output minus credit).

Warnings the screen can show: an invalid buyer GSTIN (the sale is reported as unregistered), an item without an HSN code, and the aggregate turnover `gt`, which is left as 0.
The smoke test checks that the return agrees with the books: the taxable value and tax of GSTR-1 equal the sales register, and the GSTR-3B credit equals the GST summary.

**Limits:** exports, reverse charge, composition and SEZ supplies, e-commerce (TCS) and advances are not reported; the document issue table (13), the 3B interest / late fee,
and the portal's set-off order of credits are not produced. The JSON follows the structure of the offline tool as it was understood when this was written, but it has not been
imported into the portal here: **import it into the GST offline tool and check the tables before filing.**

### E-invoice and e-way bill

**What it does.** For a sales invoice, credit note or debit note to a registered buyer the app builds the IRP JSON (schema 1.1), sends it, and stores the answer in
`transaction.einvoice` (IRN, acknowledgement number and date, signed invoice, signed QR text, status `ACT` / `CNL`). The invoice PDF then shows the **QR code**, the IRN and
the acknowledgement. An **e-way bill** is made for invoices, retail invoices and delivery challans with goods: through the IRN when the invoice has one, otherwise directly
with the addresses of both sides (an unregistered buyer is sent as `URP`). The e-way bill is stored in `transaction.ewb` with the vehicle, the transporter and the vehicle history.
Screens: *Settings > E-invoice*, the panel on the document view (Generate / Cancel / Update vehicle) and the work list *Sales > E-invoice / E-way bill*.

**Providers.** `EINV_PROVIDER` in the server `.env`:

| Value | What happens |
|-------|--------------|
| `mock` (default) | A **test provider**. Nothing goes to the government. It follows the real rules (the IRN is the SHA-256 of seller GSTIN + financial year + type + number, the 24 hour cancel window, 1 day of e-way bill validity per 200 km) so the screens and the flow can be tried. Everything it creates is flagged `provider: mock`, shown as **TEST** on the screens and printed as a TEST document on the PDF. The *production* mode is refused with it. |
| `taxpro` | The **TaxPro GSP**, the one the PHP version used (hosts and paths taken from the PHP code). Needs `EINV_ASP_ID` and `EINV_ASP_PASSWORD` in `.env` and the GST portal API user and password of each company in *Settings > E-invoice*. The portal password is saved encrypted (`SECRET_KEY`) and is never sent back to the browser. |

**Status of the TaxPro provider.** It follows the endpoints, headers and payloads of the PHP code and was tested against a **fake** TaxPro server (login and token, headers, IRN, duplicate IRN 2150 recovery, cancel, e-way bill by IRN and direct,
vehicle update, error messages). It has **not been run against the TaxPro sandbox or the real IRP**. Before real use: get sandbox credentials, set `mode = sandbox`, generate a few documents, and compare the
JSON and the answers with the PHP application. Use production only after that.

**Checks before sending** (`class.einvoice_formatter.js`, the same idea as the PHP `E_invoice::validate`): document type SI / SC / SD, date from 01 Sep 2022, buyer with a valid GSTIN, seller and buyer address, city and 6 digit PIN code,
document number rules of the IRP (up to 16 characters, no leading 0, "/" or "-"), HSN code of 4-8 digits for goods and a SAC starting with 99 for services, GST rates the IRP accepts, totals that add up, and a referred invoice
whose e-invoice is not cancelled. All problems are shown together in plain words, and nothing is sent until the list is empty. The customer form now has the address fields the e-invoice needs.

**Rules after the IRN.** A document with an IRN can not be edited or deleted (cancel first; a cancelled number can not be reported again, so create a new document). An IRN can be cancelled only within 24 hours and not while an
e-way bill is active; *Also delete this document* (the PHP behaviour) is optional. An e-way bill can be cancelled within 24 hours; a document with an active e-way bill can not be edited. Every call is written to `ob_einvoice_log`
and two clicks can not register the same document twice.

**Not done:** e-invoice for exports, SEZ and reverse charge, dispatch / ship-to details, multiple e-way bills for one invoice (consolidated e-way bill, extend validity, transporter update), the e-way bill distance lookup by PIN code
(enter the distance or 0 to let the portal calculate it), B2C QR code (dynamic QR), and bulk generation. Fetching the IRP details of a lost answer works only for a duplicate IRN (error 2150).

**Secrets.** The PHP source and its README contain credentials of the TaxPro account (in plain text). They were not copied. Keep the new credentials in `.env` only, never in the repository.

### Recurring invoices

A profile (`ob_recurring`) points to a template sales invoice or purchase bill and repeats weekly, monthly, quarterly or yearly. The job `recurring_transactions`
runs every day at 01:00 (`class.cron.js`; in cluster mode only in the master process) and for each due profile creates a new document with the template items on the
due date, with the profile name as reference, then moves `next_date`. Rules:

- A profile that is behind (the server was off) creates the missed documents, at most 12 per run.
- The profile stops after `end_date`, or when the template document is deleted.
- When saving fails (locked books, stock, inactive contact) the date does not move, the reason is shown in `last_error`, and the job tries again the next day.
- With `auto_email` the PDF is mailed to the contact. A mail problem does not undo the document.

Screen: *Accounting > Recurring Invoices*, or the *Make recurring* button on an invoice. Run it by hand: `POST /cron/recurring_transactions` with the `x-api-key` header.
Companies created before this module existed must add the module `REC` to their non-admin roles in *Settings > Roles* (the Admin role has every module).

### Example

```bash
curl -X POST http://localhost:8100/api/transaction_save \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{ "trans_type": "SI", "trans_date": "2026-11-11", "con_id": 5,
        "items": [ { "item_id": 3, "qty": 2, "rate": 1000, "disc_percentage": 10 } ] }'
# { "status": "S", "message": "Transaction saved",
#   "data": { "trans_id": 12, "trans_no": "INV-3", "tot_amount": 2124, "status": "S" } }
```

An error looks like `{ "status": "E", "code": "BOOKS_LOCKED", "message": "Books are locked till 2026-03-31" }`.

## 10. Reports

All reports read `ob_trans_acc` (the ledger) and `ob_stock_ledger`; none of them reads the documents for accounting figures.
`from_date` / `to_date` default to the current financial year (company `fy_start` month).

- **Ledger**: opening balance (account opening + everything before `from_date`) and entries with a running balance. A customer ledger is the same report with `con_id`.
- **Trial balance**: opening, period debit / credit and closing per account. Because the opening balances are typed by the user and may not
  balance, a line *Difference in opening balance* is added so the totals match (same idea as the PHP version).
- **Profit and loss**: income and expense accounts by group type (trading and profit & loss), with opening / closing stock.
- **Balance sheet**: assets and liabilities on a date, with the accumulated profit as one liability line.
- **Stock value** (used by P&L and balance sheet) is `quantity x purchase rate of the item master`, a simple valuation.
  FIFO / weighted average from the PHP version is not ported (see section 14).
- **Outstanding**: pending invoices per customer / supplier with aging buckets (current, 1-30, 31-60, 61-90, over 90 days).
- **GST summary**: output tax and input tax by tax type and rate, credit notes subtracted, net payable.

## 11. The React client

- `App.js` creates the router: pages before login use `AuthLayout`; all other pages use `Mainlayout`
  (checks the token, loads `get_user_data`, shows the sidebar and header).
- Documents use **one set of screens for all types**, selected by the url key and `data/trans_types.json`:

  | URL | Screen |
  |-----|--------|
  | `/t/sales-invoice` | list (`pages/transactions.js`) |
  | `/t/sales-invoice/new`, `/t/sales-invoice/12` | form (`pages/transaction_form.js`) |
  | `/t/sales-invoice/12/view` | read only view and print (`pages/transaction_view.js`) |

  `trans_types.json` says which form to use: `kind` `items` (`components/transactions/items_form.js`), `receipt` (`receipt_form.js`)
  or `journal` (`journal_form.js`), the module code, and which documents it can be converted to.
- The invoice form calculates a **preview** of the totals with `utils/tax_calc.js` (same formula as the server).
  The server always calculates the real values when saving.
- Reports: `pages/reports.js` (menu, filtered by permission) and `pages/report_view.js` (filters + table of any report; list in `data/report_list.json`).
- The token is stored in `localStorage` (`token`), the user data in the `user` context.

## 12. How to add a new feature

Example: a new endpoint `item_price_history`.

1. Create `server/api/routes/item_price_history.js` (copy a small route such as `category_list.js`). Use `c_id` in every query and `sendError` in `catch`.
2. Register it in `server/api/api_router.js`: `route.use('/item_price_history', require('./routes/item_price_history'));`
3. If it needs a permission, add it to `ENDPOINT_MODULES` in `server/classes/class.permission.js`.
4. If it needs a new collection, add its indexes in `server/common/indexes.js`.
5. Add the call to `client/src/services/api.js` and use it in a page under `client/src/pages`; add the route in `App.js` and a link in `layouts/sidebar.js`.
6. Add checks to `server/scripts/smoke_test.js` and run `npm test`.

A **new document type**: add its code to `TRANS_TYPES` (`inc.config.js`), a series to `DEFAULT_SERIES` (`sys_data.js`),
its posting rule in `buildLedgerLines` and `STOCK_*_TYPES` (`class.transaction.js`), the module in `SYS_MODULES` and
`class.permission.js`, and an entry in `client/src/data/trans_types.json`.

## 13. Testing

`npm test` in `server/` runs `scripts/smoke_test.js` against a **running server on an empty database**. It signs up a company and checks
(about 280 checks): tax split (CGST+SGST / IGST), totals, ledger balance, stock after purchase / sale / edit / delete, receipt allocation rules,
rejected invalid saves (stock and ledger unchanged), trial balance, balance sheet, profit and loss, GST summary, bank balance,
journal validation, PDF templates and logo, price list rates, recurring invoices, payment reminders (with a local SMTP server that records the mails), GSTR-1 / GSTR-3B, e-invoice and e-way bill (the whole flow with the test provider, and with the TaxPro adapter against a fake IRP) and role permissions.

Use a throw away database, for example `DB_NAME=outputbooks_test`. The e-invoice checks adapt to the provider in `.env` (`mock`, or `taxpro` with `EINV_TAXPRO_TEST_HOST` pointing to a fake server; this variable only works in sandbox mode and is for tests). The mail checks only run when `SMTP_HOST` is set; point it at a local test SMTP server
(for example the `smtp-server` package, or MailHog) to run them. Without SMTP the test checks that the app refuses to send and says why.

## 14. Known limits and next steps

This version contains the **core** of OutputBooks. Features that are not ported yet are listed in
[PHP_MIGRATION_MAP.md](PHP_MIGRATION_MAP.md) (GST e-invoice, e-way bill, GSTR JSON, PDF / email of invoices, price lists, POS, branches,
multi currency, Tally import / export, workflows ...). Technical limits of the current code:

- No MongoDB multi document transactions: failures are handled by `rollbackSave`; run MongoDB as a replica set and wrap `save()` in
  a transaction if you need stronger guarantees.
- Stock valuation uses the purchase rate of the item, not FIFO / average cost.
- `cors` accepts every origin (`api/middleware/standard.js`): restrict it to the client url in production.
- The login token lives 15 days and is kept in `localStorage`.
- The PDF has three fixed templates (no template designer) and one language; amounts are written with "Rs." because the built in PDF font has no rupee sign. The logo must be PNG or JPEG.
- Recurring invoices copy the template document as it is at run time. The next date is calculated from the previous date, with the month end kept (31 Jan -> 28 Feb).
- Price lists do not support quantity slabs or per-customer discounts.
