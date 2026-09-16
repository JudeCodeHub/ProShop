# proshop-pos

Full-featured point-of-sale system for sports retail — variant-based inventory, checkout, returns, customer loyalty, reporting, and purchasing.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js (App Router), JavaScript, Tailwind CSS |
| Backend | NestJS (REST API), TypeScript |
| Database | PostgreSQL 18 via Prisma 7, run in Docker |
| Barcode scanning | USB/HID scanner read as keyboard input |

## Project structure

```text
proshop-pos/
├── backend/             NestJS API + Prisma
├── frontend/            Next.js app
└── docker-compose.yml   PostgreSQL container
```

## Running locally

**Prerequisites:** Node.js 20.9+, npm, and Docker.

You need three things running: the database, the backend, and the frontend. Start them in that order, each in its own terminal.

### 1. Database

From the project root:

```bash
docker compose up -d
```

This runs PostgreSQL on `localhost:5432` (user `proshop`, password `proshop`, database `proshop_pos`). Data stays in the `postgres_data` volume across restarts. Stop it with `docker compose down`; add `-v` to also delete the data.

### 2. Backend — <http://localhost:3001>

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npx prisma generate
npm run start:dev
```

Environment variables (`backend/.env`):

| Variable | Example | What it does |
| --- | --- | --- |
| `PORT` | `3001` | Port the API listens on |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed origin for browser requests |
| `DATABASE_URL` | `postgresql://proshop:proshop@localhost:5432/proshop_pos` | Database connection |
| `JWT_SECRET` | `change-me` | Signs login tokens. Use a long random value |
| `JWT_EXPIRES_IN` | `8h` | How long a login lasts |
| `LOW_STOCK_THRESHOLD` | `5` | Default limit for the low-stock list |
| `LOYALTY_SPEND_PER_POINT` | `100` | Spend this much to earn 1 point |
| `LOYALTY_POINT_VALUE` | `1` | What 1 point is worth as a discount |

Create the first admin account once (the command refuses to run if an admin already exists):

```bash
ADMIN_NAME="Store Owner" ADMIN_EMAIL=owner@proshop.lk ADMIN_PASSWORD=change-me-now npm run create-admin
```

**Sample data (optional)** — instead of starting empty, fill the database with one admin, one cashier, four categories, nine products with variants, and the store settings row:

```bash
npm run build
npx prisma db seed
```

It creates `admin@proshop.lk` / `admin-password-1` and `cashier@proshop.lk` / `cashier-password-1`. Change these on the Users page before real use, or set your own with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CASHIER_EMAIL` and `SEED_CASHIER_PASSWORD`. Running the seed again is safe: it updates the same rows instead of adding duplicates.

Other backend commands:

```bash
npm run build                 # compile to dist/
npm run start:dev             # watch mode
npm run lint                  # oxlint
npm test                      # unit tests
npm run test:e2e              # end-to-end tests (needs the database)
npx prisma migrate dev --name my_change   # after editing prisma/schema.prisma
npx prisma studio             # browse the data
```

### 3. Frontend — <http://localhost:3000>

In a second terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Environment variables (`frontend/.env.local`):

| Variable | Example | What it does |
| --- | --- | --- |
| `BACKEND_API_URL` | `http://localhost:3001/api` | Where the Next.js server talks to the API |

This one is read on the server only. The browser never calls the backend directly: it calls `/api/backend/...` on the Next.js server, which adds the login token from an httpOnly cookie and forwards the request. So the token never reaches browser JavaScript.

Other frontend commands:

```bash
npm run build                 # production build
npm start                     # run the production build
npm run lint                  # eslint
```

### 4. Open the app

Go to <http://localhost:3000> and sign in.

- **Admin** lands on `/admin/dashboard` and can use everything: products, categories, bulk import, stock adjustments, orders, returns, customers, reports, suppliers, purchase orders, store settings and users.
- **Cashier** lands on `/pos` and can use checkout and held sales only. Admin pages send a cashier back to the POS.

A normal day: scan or search items at `/pos`, pick a customer if they have a loyalty card, take payment, print the receipt. Park a sale with **Hold** and finish it later from **Held sales**. Refunds and size swaps are done by an admin at `/admin/returns` using the receipt number.

If the backend is not running, the pages load but show "Cannot reach the server. Please try again." Start the backend and reload.
