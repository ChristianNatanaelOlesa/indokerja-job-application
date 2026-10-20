# REST API

Base URL: `http://localhost:4000/api`. Protected endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| POST | `/auth/register` | Public | Register account |
| POST | `/auth/login` | Public | Login |
| GET | `/jobs?search=` | Public | List/search active jobs |
| GET | `/jobs/:id` | Public | Job detail |
| POST | `/jobs` | Company | Create job |
| GET | `/company/jobs` | Company | List own jobs |
| POST | `/jobs/:id/applications` | Job Seeker | Apply for a job |
| GET | `/applications/me` | Job Seeker | Own applications and history |
| GET | `/company/jobs/:jobId/applications` | Company | Candidates for owned job |
| PATCH | `/company/applications/:id/status` | Company | Update status and record history |

## Register body
```json
{
  "name": "Company Admin",
  "email": "hr@example.com",
  "password": "password123",
  "role": "COMPANY",
  "companyName": "Example Corp"
}
```
For job seekers, use `"role": "JOB_SEEKER"` and omit `companyName`.

## Create job body
```json
{
  "title": "Full Stack Developer",
  "description": "Build and maintain web applications with TypeScript and SQL.",
  "location": "Jakarta",
  "salaryMin": 8000000,
  "salaryMax": 12000000,
  "jobType": "FULL_TIME"
}
```
Allowed `jobType`: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE`.

## Apply body
```json
{ "coverLetter": "I am interested in this position..." }
```

## Update status body
```json
{ "status": "REVIEWING", "note": "CV reviewed by HR" }
```
Allowed statuses: `APPLIED`, `REVIEWING`, `SHORTLISTED`, `REJECTED`, `ACCEPTED`.

Common errors use HTTP 400 (validation), 401 (unauthenticated), 403 (wrong role), 404 (not found), 409 (duplicate email/application), and 500 (unexpected server error).
