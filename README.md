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

**1. Database** — start PostgreSQL first, from the project root

```bash
docker compose up -d
```

This runs PostgreSQL on `localhost:5432` (user `proshop`, password `proshop`, database `proshop_pos`). Data persists in the `postgres_data` volume across restarts. Stop it with `docker compose down`; add `-v` to also delete the data.

**2. Backend** — runs on <http://localhost:3001>

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npm run start:dev
```

**3. Frontend** — runs on <http://localhost:3000> (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```
