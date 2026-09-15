# proshop-pos

Full-featured point-of-sale system for sports retail — variant-based inventory, checkout, returns, customer loyalty, reporting, and purchasing.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js (App Router), JavaScript, Tailwind CSS |
| Backend | NestJS (REST API), TypeScript |
| Database | PostgreSQL via Prisma, run in Docker |
| Barcode scanning | USB/HID scanner read as keyboard input |

## Project structure

```text
proshop-pos/
├── backend/    NestJS API
└── frontend/   Next.js app
```

## Running locally

**Prerequisites:** Node.js 20.9+ and npm.

**1. Backend** — runs on <http://localhost:3001>

```bash
cd backend
cp .env.example .env
npm install
npm run start:dev
```

**2. Frontend** — runs on <http://localhost:3000> (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```
