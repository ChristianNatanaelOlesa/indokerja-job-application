# IndoKerja.id — Job Application Management

Full-stack assessment starter implementation:
- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Database: PostgreSQL + Prisma
- Authentication: JWT + bcrypt

## Requirements
Node.js 20+, PostgreSQL 14+.

## 1. Configure backend
```bash
cd backend
cp .env.example .env
# Edit DATABASE_URL and JWT_SECRET in .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```
Backend runs at http://localhost:4000. API docs: see `API.md`.

## 2. Configure frontend
In another terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL shown in terminal (normally http://localhost:5173).

## Demo flow
1. Register one account with role `COMPANY`, then create a job.
2. Register a second account with role `JOB_SEEKER`, apply for that job.
3. Log in as company and update application status; history is recorded.
4. Job Seeker can view application status in My Applications.

## Notes
This is an assessment-ready implementation baseline, not a deployed service. Before production, add rate limiting, email verification, refresh-token/session management, audit logging, automated tests, and deployment secrets. Never commit `.env`.
