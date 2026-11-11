# Importing the old MySQL data into MongoDB

`server/scripts/import_mysql.js` copies **one company** (one `cId`) from the PHP database into the MongoDB collections of this project.
Ids are kept (`ob_trans.id` becomes `trans_id`, and so on), so references between records stay valid.

## Steps

1. Take a backup of the MySQL database. Use an empty MongoDB database (or one that does not contain this company).
2. In `server/.env` set `MONGODB_URI` and `DB_NAME`, and the MySQL connection (same values as the PHP `env.php`):
   ```
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=outputbooks
   ```
3. `cd server && npm install mysql2` (the driver is only needed for the import).
4. Find the company id: `SELECT id, name FROM ob_companies;`
5. Test first, nothing is written:
   `node scripts/import_mysql.js --company 3 --dry-run`
6. Import: `node scripts/import_mysql.js --company 3`
7. Start the server and compare in the new app: trial balance, customer / supplier balances, stock summary, a few invoices
   against the PHP reports.

No MySQL access from this machine? Export each table to `<table>.json` (an array of rows, column names as in MySQL), put the files in a
folder and use `--from-json ./folder`.

## What is converted

| MySQL | MongoDB | Notes |
|-------|---------|-------|
| `ob_companies` | `ob_companies` | Same `id` as `c_id` |
| `ob_users`, `ob_compusers` | `ob_users`, `ob_company_users` | Password is **not** copied (the PHP hash cannot be used). Users choose a new one with *Forgot password*. A user whose email already exists is only linked |
| `ob_role`, `ob_role_permissions` | `ob_roles` | A module is allowed when `actionRights > 0` |
| `ob_account` | `ob_accounts` | Opening balance from `balance`. The accounts the engine needs (Sales, Purchases, Output CGST ...) are found **by name** and get their `acc_code`; missing ones are created |
| `ob_contacts`, `ob_contacts_address` | `ob_contacts` | A contact without `conAccId` gets a new ledger account |
| `ob_items` | `ob_items` | Stock is rebuilt from the documents; an opening entry is added so the quantity equals `curStk` |
| `ob_category`, `ob_tax`, `ob_taxdetail`, `ob_series`, `ob_paymentmode`, `ob_bank` | `ob_categories`, `ob_taxes`, `ob_series`, `ob_payment_modes`, `ob_banks` | |
| `ob_trans`, `ob_trans_items`, `ob_trans_tax`, `ob_trans_pay`, `ob_trans_payment` | `ob_transactions` | Items, taxes, payments and allocations are embedded. Void / cancelled documents (`status` V, X) are skipped |
| `ob_trans_acc` | `ob_trans_acc` | The ledger is copied **as the PHP application posted it** |

Id counters (`ob_counters`) are set after the highest imported id, so new records continue the numbering.

## Not imported

Attachments, images, custom fields, attributes / batches / serials, price lists, points, e-invoice / e-way bill data, workflow history,
branches (`bId`), second currencies, other companies. See `PHP_MIGRATION_MAP.md`.

## Checks and limits

- The script refuses to run when the company already exists in MongoDB, so a second run cannot duplicate data.
- It was tested with a small set of sample rows (a sales invoice with tax, a receipt allocated to it, stock). It has **not** been run against a
  real OutputBooks database, so always do the dry run and the comparison in step 7 before relying on it.
- Documents made from other documents keep `ref_id` only when the PHP row has it; the document type of the source is taken from `refTtype`.
- Posting rules of the new app may differ from the PHP ones for edited documents; the imported ledger is not recalculated until a document is edited.
