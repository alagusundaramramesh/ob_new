# OutputBooks (ob_new)

Accounting, inventory and GST billing. This is the **React + Node.js + MongoDB** version of the PHP (CodeIgniter 4)
OutputBooks application in `D:\htdocs\OutputBooks`. The code is organised the same way as the `cges.club` project.

```
ob_new/
├── client/      React 18 (create-react-app), React Router 6, Bootstrap 5
├── server/      Node.js + Express 4 + MongoDB native driver
└── docs/
    ├── PROJECT_GUIDE.md      <- start here: how the project works
    ├── PHP_MIGRATION_MAP.md  <- what was ported from the PHP app, and what is still to do
    └── MYSQL_IMPORT.md       <- how to copy the old MySQL data into MongoDB
```

## Quick start

You need Node.js 18 or later and a MongoDB server (local or Atlas).

**1. Server**

```bash
cd server
cp .env.example .env      # then edit MONGODB_URI, DB_NAME, X_API_KEY, JWT_SECRET
npm install
npm run seed              # optional: demo company with sample data (admin@demo.com / Admin@123)
npm start                 # http://localhost:8100
```

**2. Client**

```bash
cd client
cp .env.example .env      # REACT_APP_X_API_KEY must be the same value as X_API_KEY in server/.env
npm install
npm start                 # http://localhost:3000
```

Open http://localhost:3000, log in with the demo user, or use *Create an account* to start with an empty company.

**3. Check that the API works** (start the server on an empty database first)

```bash
cd server
npm test
```

**Production:** run `npm run build` in `client/`. The server serves `client/build` by itself (see `server/classes/class.server.js`),
so one Node process serves both the API (`/api/...`) and the web app.

Read [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) next.
