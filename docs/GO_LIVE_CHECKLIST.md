# Go-live checklist

Do these before real users and real data. Tick each line.

## Secrets (`server/.env`, never commit this file)
- [ ] `JWT_SECRET`: long random value, not `change-me-jwt-secret`
- [ ] `X_API_KEY`: random value, and the same value in the React build (`REACT_APP_X_API_KEY`)
- [ ] `SECRET_KEY`: 64 hex characters, used to encrypt the saved GST portal passwords. Keep a copy: if it changes, the passwords must be typed again
  (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `MONGODB_URI` uses a user with a password, and MongoDB is not open to the internet
- [ ] `EINV_PROVIDER=mock` is **not** used for real documents (see the e-invoice section of PROJECT_GUIDE.md)

## Data
- [ ] MySQL import done on a copy, dry run first (MYSQL_IMPORT.md)
- [ ] Reports compared with the PHP app: trial balance, profit and loss, balance sheet, customer and supplier balances, stock summary, GST summary
- [ ] Every user used *Forgot password* once (PHP hashes are not imported)
- [ ] Books lock date set for the closed financial year

## Server
- [ ] `npm run build` in `client`, then `npm run prod` in `server` (the server serves `client/build`)
- [ ] HTTPS in front of the app (nginx, Caddy or the host's proxy) and a process manager (pm2 or a service) that restarts it
- [ ] SMTP set (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`): needed for forgot password, emailed invoices and payment reminders
- [ ] Redis only if you run cluster mode: set `CAN_ENABLE_REDIS` in `common/inc.config.js` and the `REDIS_*` values
- [ ] One cron owner: the cron jobs (overdue, recurring invoices, reminders) run in the master process only; do not start two copies of the app on the same database

## Backups
- [ ] Daily `mongodump` kept off the server, and one restore tested
- [ ] `.env` stored safely outside the repository

## First day
- [ ] One test invoice, one receipt and one purchase made and checked in the ledger
- [ ] PDF printed and the company logo, footer and bank details looked at
- [ ] An email invoice sent to yourself
- [ ] GSTR-1 / GSTR-3B JSON opened in the GST offline tool
