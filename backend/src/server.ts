import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role, JobType, ApplicationStatus, Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in .env');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

type AuthUser = { id: string; role: Role; email: string };
type AuthedRequest = Request & { user?: AuthUser };

function asyncHandler(fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as AuthedRequest, res, next)).catch(next);
}
function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET!) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
function role(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission' });
    next();
  };
}
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100),
  role: z.nativeEnum(Role),
  companyName: z.string().trim().max(120).optional()
}).superRefine((v, ctx) => {
  if (v.role === Role.COMPANY && !v.companyName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyName'], message: 'Company name is required for company accounts' });
  }
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const jobSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(10000),
  location: z.string().trim().min(2).max(120),
  salaryMin: z.number().int().nonnegative().nullable().optional(),
  salaryMax: z.number().int().nonnegative().nullable().optional(),
  jobType: z.nativeEnum(JobType)
}).superRefine((v, ctx) => {
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['salaryMax'], message: 'Maximum salary must be >= minimum salary' });
});
const applySchema = z.object({ coverLetter: z.string().trim().max(3000).optional() });
const statusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  note: z.string().trim().max(500).optional()
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ message: 'Email already registered' });
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: { name: data.name, email, passwordHash, role: data.role, companyName: data.role === Role.COMPANY ? data.companyName : null },
    select: { id: true, name: true, email: true, role: true, companyName: true }
  });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET!, { expiresIn: '12h' });
  res.status(201).json({ token, user });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET!, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName } });
}));

app.get('/api/jobs', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const jobs = await prisma.job.findMany({
    where: { isActive: true, ...(search ? { OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { company: { companyName: { contains: search, mode: 'insensitive' } } }
    ] } : {}) },
    include: { company: { select: { id: true, name: true, companyName: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(jobs);
}));

app.get('/api/jobs/:id', asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({
    where: {
  id: String(req.params.id),
  isActive: true,
},
    include: { company: { select: { id: true, name: true, companyName: true } } }
  });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}));

app.post('/api/jobs', auth, role(Role.COMPANY), asyncHandler(async (req, res) => {
  const data = jobSchema.parse(req.body);
  const job = await prisma.job.create({ data: { ...data, companyId: req.user!.id } });
  res.status(201).json(job);
}));

app.get('/api/company/jobs', auth, role(Role.COMPANY), asyncHandler(async (req, res) => {
  const jobs = await prisma.job.findMany({
    where: { companyId: req.user!.id },
    include: { _count: { select: { applications: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(jobs);
}));

app.post('/api/jobs/:id/applications', auth, role(Role.JOB_SEEKER), asyncHandler(async (req, res) => {
  const data = applySchema.parse(req.body);
  const job = await prisma.job.findFirst({
  where: {
    id: String(req.params.id),
    isActive: true,
  },
});
  if (!job) return res.status(404).json({ message: 'Job not found or no longer active' });
  try {
    const application = await prisma.application.create({
      data: {
        jobId: job.id, seekerId: req.user!.id, coverLetter: data.coverLetter || null,
        history: { create: { fromStatus: null, toStatus: ApplicationStatus.APPLIED, note: 'Application submitted' } }
      },
      include: { job: { include: { company: { select: { companyName: true, name: true } } } }, history: true }
    });
    res.status(201).json(application);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return res.status(409).json({ message: 'You have already applied for this job' });
    throw error;
  }
}));

app.get('/api/applications/me', auth, role(Role.JOB_SEEKER), asyncHandler(async (req, res) => {
  const applications = await prisma.application.findMany({
    where: { seekerId: req.user!.id },
    include: {
      job: { include: { company: { select: { name: true, companyName: true } } } },
      history: { orderBy: { changedAt: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(applications);
}));

app.get('/api/company/jobs/:jobId/applications', auth, role(Role.COMPANY), asyncHandler(async (req, res) => {
  const job = await prisma.job.findFirst({
  where: {
    id: String(req.params.jobId),
    companyId: req.user!.id,
  },
});
  if (!job) return res.status(404).json({ message: 'Job not found or access denied' });
  const applications = await prisma.application.findMany({
    where: { jobId: job.id },
    include: {
      seeker: { select: { id: true, name: true, email: true } },
      history: { orderBy: { changedAt: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ job, applications });
}));

app.patch('/api/company/applications/:id/status', auth, role(Role.COMPANY), asyncHandler(async (req, res) => {
  const data = statusSchema.parse(req.body);
  const application = await prisma.application.findFirst({
    where: {
  id: String(req.params.id),
  job: { companyId: req.user!.id },
}
  });
  if (!application) return res.status(404).json({ message: 'Application not found or access denied' });
  if (application.status === data.status) return res.status(400).json({ message: 'Application already has that status' });
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.application.update({ where: { id: application.id }, data: { status: data.status } });
    await tx.applicationHistory.create({
      data: { applicationId: application.id, fromStatus: application.status, toStatus: data.status, note: data.note || null }
    });
    return row;
  });
  res.json(updated);
}));

app.use((_req, res) => res.status(404).json({ message: 'Endpoint not found' }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ message: 'Validation failed', errors: err.issues });
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => console.log(`IndoKerja API running on http://localhost:${PORT}`));
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
