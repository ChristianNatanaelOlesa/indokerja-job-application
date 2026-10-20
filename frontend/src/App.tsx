import { FormEvent, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
type Role = 'JOB_SEEKER' | 'COMPANY';
type Job = { id: string; title: string; description: string; location: string; salaryMin?: number | null; salaryMax?: number | null; jobType: string; createdAt: string; company?: { name: string; companyName?: string | null }; _count?: { applications: number } };
type User = { id: string; name: string; email: string; role: Role; companyName?: string | null };
type Application = { id: string; status: string; coverLetter?: string | null; createdAt: string; job: Job; seeker?: { name: string; email: string }; history?: { id: string; fromStatus?: string | null; toStatus: string; changedAt: string; note?: string | null }[] };
const money = (n?: number | null) => n == null ? null : 'Rp' + n.toLocaleString('id-ID');
const salary = (j: Job) => j.salaryMin != null || j.salaryMax != null ? `${money(j.salaryMin) || 'Negotiable'} – ${money(j.salaryMax) || 'Negotiable'}` : 'Gaji dibicarakan';
const label = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const statusClass = (s: string) => s.toLowerCase();
async function request(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Request failed');
  return body;
}
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ik_token') || '');
  const [user, setUser] = useState<User | null>(() => { try { return JSON.parse(localStorage.getItem('ik_user') || 'null'); } catch { return null; } });
  const [page, setPage] = useState('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [companyJobs, setCompanyJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Application[]>([]);
  const [candidateJob, setCandidateJob] = useState<Job | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<'login'|'register'>('login');
  const [authRole, setAuthRole] = useState<Role>('JOB_SEEKER');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [jobForm, setJobForm] = useState({ title: '', description: '', location: 'Jakarta', salaryMin: '8000000', salaryMax: '12000000', jobType: 'FULL_TIME' });
  const [coverLetter, setCoverLetter] = useState('');
  const [statusDraft, setStatusDraft] = useState<Record<string, string>>({});

  async function loadJobs(q = search) {
    try { setJobs(await request(`/jobs${q ? `?search=${encodeURIComponent(q)}` : ''}`, '')); } catch (e) { setError((e as Error).message); }
  }
  async function loadPrivate() {
    if (!token || !user) return;
    try {
      if (user.role === 'JOB_SEEKER') setApplications(await request('/applications/me', token));
      else setCompanyJobs(await request('/company/jobs', token));
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void loadJobs(''); }, []);
  useEffect(() => { void loadPrivate(); }, [token, user]);
  function setSession(data: { token: string; user: User }) {
    localStorage.setItem('ik_token', data.token); localStorage.setItem('ik_user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user); setPage(data.user.role === 'COMPANY' ? 'dashboard' : 'jobs');
  }
  async function submitAuth(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const path = authMode === 'login' ? '/auth/login' : '/auth/register';
      const body = authMode === 'login' ? { email: authForm.email, password: authForm.password } : { ...authForm, role: authRole };
      setSession(await request(path, '', { method: 'POST', body: JSON.stringify(body) }));
      setNotice(authMode === 'login' ? 'Berhasil masuk.' : 'Akun berhasil dibuat.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function logout() { localStorage.removeItem('ik_token'); localStorage.removeItem('ik_user'); setToken(''); setUser(null); setPage('jobs'); setSelected(null); setNotice('Kamu sudah keluar.'); }
  async function applyJob() {
    if (!selected) return;
    setBusy(true); setError('');
    try { await request(`/jobs/${selected.id}/applications`, token, { method: 'POST', body: JSON.stringify({ coverLetter }) }); setNotice('Lamaran berhasil dikirim!'); setSelected(null); setCoverLetter(''); setPage('applications'); await loadPrivate(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function createJob(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await request('/jobs', token, { method: 'POST', body: JSON.stringify({ ...jobForm, salaryMin: jobForm.salaryMin ? Number(jobForm.salaryMin) : null, salaryMax: jobForm.salaryMax ? Number(jobForm.salaryMax) : null }) });
      setNotice('Lowongan berhasil dibuat.'); setJobForm({ title: '', description: '', location: 'Jakarta', salaryMin: '8000000', salaryMax: '12000000', jobType: 'FULL_TIME' }); setPage('dashboard'); await loadPrivate(); await loadJobs('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function viewCandidates(job: Job) {
    setBusy(true); setError('');
    try { const data = await request(`/company/jobs/${job.id}/applications`, token); setCandidateJob(data.job); setCandidates(data.applications); setPage('candidates'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function updateStatus(application: Application) {
    const status = statusDraft[application.id] || application.status;
    if (status === application.status) return;
    setError('');
    try {
      await request(`/company/applications/${application.id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice('Status kandidat diperbarui dan riwayat tersimpan.');
      if (candidateJob) await viewCandidates(candidateJob);
    } catch (e) { setError((e as Error).message); }
  }
  const isCompany = user?.role === 'COMPANY';
  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => { setSelected(null); setPage(isCompany ? 'dashboard' : 'jobs'); }}><span className="brand-mark">ik</span><span>IndoKerja<span className="brand-dot">.id</span></span></button>
      <nav>{!isCompany && <button className={page === 'jobs' ? 'nav active' : 'nav'} onClick={() => { setSelected(null); setPage('jobs'); }}>Cari Kerja</button>}
        {user && !isCompany && <button className={page === 'applications' ? 'nav active' : 'nav'} onClick={() => setPage('applications')}>Lamaran Saya</button>}
        {isCompany && <><button className={page === 'dashboard' ? 'nav active' : 'nav'} onClick={() => setPage('dashboard')}>Dashboard</button><button className={page === 'create' ? 'nav active' : 'nav'} onClick={() => setPage('create')}>+ Buat Lowongan</button></>}
      </nav>
      <div className="account">{user ? <><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><span className="account-name">{user.name}</span><button className="button ghost small" onClick={logout}>Keluar</button></> : <button className="button primary small" onClick={() => { setPage('auth'); setAuthMode('login'); }}>Masuk / Daftar</button>}</div>
    </header>
    <main>
      {notice && <div className="notice"><span>✓ {notice}</span><button onClick={() => setNotice('')}>×</button></div>}
      {error && <div className="error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
      {page === 'auth' && <section className="auth-layout"><div className="auth-intro"><div className="eyebrow">LANGKAH BERIKUTNYA DIMULAI DI SINI</div><h1>Temukan pekerjaan yang bikin kamu <span>berkembang.</span></h1><p>Hubungkan kemampuanmu dengan kesempatan yang tepat.</p><div className="mini-stat"><b>01</b><span>Jelajahi peluang baru<br/>dengan lebih mudah.</span></div></div>
        <form className="panel auth-card" onSubmit={submitAuth}><div className="tabs"><button type="button" className={authMode === 'login' ? 'tab selected' : 'tab'} onClick={() => setAuthMode('login')}>Masuk</button><button type="button" className={authMode === 'register' ? 'tab selected' : 'tab'} onClick={() => setAuthMode('register')}>Buat akun</button></div><h2>{authMode === 'login' ? 'Selamat datang kembali' : 'Mulai perjalananmu'}</h2><p className="muted">Masukkan informasi akun kamu di bawah.</p>
          {authMode === 'register' && <><label>Nama lengkap<input required minLength={2} value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Nama kamu"/></label><label>Daftar sebagai<select value={authRole} onChange={e => setAuthRole(e.target.value as Role)}><option value="JOB_SEEKER">Job Seeker</option><option value="COMPANY">Company / HR</option></select></label>{authRole === 'COMPANY' && <label>Nama perusahaan<input required value={authForm.companyName} onChange={e => setAuthForm({ ...authForm, companyName: e.target.value })} placeholder="Nama perusahaan"/></label>}</>}
          <label>Email<input type="email" required value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="nama@email.com"/></label><label>Password<input type="password" required minLength={authMode === 'register' ? 8 : 1} value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder={authMode === 'register' ? 'Minimal 8 karakter' : 'Password kamu'}/></label>
          <button className="button primary full" disabled={busy}>{busy ? 'Memproses...' : authMode === 'login' ? 'Masuk ke akun →' : 'Buat akun →'}</button><p className="tiny muted">Dengan melanjutkan, kamu setuju menggunakan platform secara bertanggung jawab.</p></form></section>}
      {page === 'jobs' && !selected && <><section className="hero"><div className="eyebrow">KARIER YANG LEBIH BAIK DIMULAI DI SINI</div><h1>Pekerjaan tepat.<br/><span>Masa depan cerah.</span></h1><p>Temukan peluang yang sesuai dengan keahlian dan tujuan kariermu.</p><form className="searchbar" onSubmit={e => { e.preventDefault(); void loadJobs(search); }}><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Jabatan, perusahaan, atau lokasi..."/><button className="button primary">Cari lowongan</button></form><div className="hero-meta"><span>✦ Peluang karier pilihan</span><span>•</span><span>Lowongan diperbarui secara berkala</span></div></section>
        <section className="jobs-section"><div className="section-heading"><div><div className="eyebrow">JELAJAHI PELUANG</div><h2>Lowongan terbaru</h2><p className="muted">Temukan pekerjaan yang cocok untuk langkah berikutnya.</p></div><span className="count-pill">{jobs.length} lowongan</span></div>
          {jobs.length ? <div className="job-grid">{jobs.map(job => <article className="job-card" key={job.id}><div className="job-top"><div className="company-logo">{(job.company?.companyName || job.company?.name || 'IK').slice(0,2).toUpperCase()}</div><span className="job-type">{label(job.jobType)}</span></div><h3>{job.title}</h3><p className="company-name">{job.company?.companyName || job.company?.name || 'Perusahaan'}</p><div className="job-facts"><span>⌖ {job.location}</span><span>◷ {label(job.jobType)}</span></div><div className="salary">{salary(job)}</div><div className="card-bottom"><span className="posted">Diposting {new Date(job.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</span><button className="button outline small" onClick={() => { setSelected(job); setPage('detail'); }}>Lihat detail →</button></div></article>)}</div> : <div className="empty panel"><div className="empty-icon">⌕</div><h3>Belum ada lowongan ditemukan</h3><p>Coba kata kunci lain atau kembali lagi nanti.</p><button className="button outline" onClick={() => { setSearch(''); void loadJobs(''); }}>Lihat semua lowongan</button></div>}</section></>}
      {page === 'detail' && selected && <section className="detail-wrap"><button className="back-link" onClick={() => setPage('jobs')}>← Kembali ke lowongan</button><article className="panel detail-card"><div className="detail-brand"><div className="company-logo large">{(selected.company?.companyName || selected.company?.name || 'IK').slice(0,2).toUpperCase()}</div><div><span className="job-type">{label(selected.jobType)}</span><h1>{selected.title}</h1><p className="company-name">{selected.company?.companyName || selected.company?.name}</p></div></div><div className="detail-facts"><div><span>Lokasi</span><b>⌖ {selected.location}</b></div><div><span>Kisaran gaji</span><b>{salary(selected)}</b></div><div><span>Tipe pekerjaan</span><b>{label(selected.jobType)}</b></div></div><hr/><h2>Tentang pekerjaan</h2><p className="description">{selected.description}</p>{user?.role === 'JOB_SEEKER' ? <div className="apply-box"><label>Pesan untuk recruiter <span className="muted">(opsional)</span><textarea rows={4} maxLength={3000} value={coverLetter} onChange={e => setCoverLetter(e.target.value)} placeholder="Ceritakan secara singkat kenapa kamu cocok untuk posisi ini..."/></label><button className="button primary" disabled={busy} onClick={applyJob}>Kirim lamaran →</button></div> : !user ? <button className="button primary" onClick={() => { setPage('auth'); setAuthMode('login'); }}>Masuk untuk melamar →</button> : <p className="muted">Akun Company tidak dapat melamar pekerjaan.</p>}</article></section>}
      {page === 'applications' && <section className="dashboard"><div className="section-heading"><div><div className="eyebrow">PERJALANAN KARIARMU</div><h1>Lamaran saya</h1><p className="muted">Pantau perkembangan setiap lamaran yang kamu kirim.</p></div><span className="count-pill">{applications.length} lamaran</span></div>{applications.length ? <div className="application-list">{applications.map(a => <article className="panel application-card" key={a.id}><div className="application-main"><div className="company-logo">{(a.job.company?.companyName || 'IK').slice(0,2).toUpperCase()}</div><div><h3>{a.job.title}</h3><p className="company-name">{a.job.company?.companyName || a.job.company?.name}</p><p className="muted small-text">Dikirim {new Date(a.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p></div></div><span className={`status ${statusClass(a.status)}`}>{label(a.status)}</span><details><summary>Lihat riwayat status</summary><div className="history">{a.history?.map(h => <div className="history-row" key={h.id}><span className="history-dot"/><div><b>{label(h.toStatus)}</b><p>{h.note || 'Status lamaran diperbarui'}</p><small>{new Date(h.changedAt).toLocaleString('id-ID')}</small></div></div>)}</div></details></article>)}</div> : <div className="empty panel"><div className="empty-icon">↗</div><h3>Belum ada lamaran</h3><p>Lowongan yang kamu lamar akan muncul di sini.</p><button className="button primary" onClick={() => setPage('jobs')}>Jelajahi lowongan</button></div>}</section>}
      {page === 'dashboard' && isCompany && <section className="dashboard"><div className="dashboard-welcome"><div><div className="eyebrow">RUANG KERJA PERUSAHAAN</div><h1>Halo, {user?.companyName || user?.name} 👋</h1><p>Kelola lowongan dan temukan kandidat yang tepat.</p></div><button className="button primary" onClick={() => setPage('create')}>+ Buat lowongan</button></div><div className="stats"><div className="panel stat-card"><span>Total lowongan</span><b>{companyJobs.length}</b><small>Lowongan milik perusahaan</small></div><div className="panel stat-card"><span>Total pelamar</span><b>{companyJobs.reduce((n,j) => n + (j._count?.applications || 0), 0)}</b><small>Kandidat yang sudah melamar</small></div><div className="panel stat-card"><span>Status akun</span><b className="green-text">Aktif</b><small>Akun perusahaan kamu</small></div></div><div className="section-heading"><div><h2>Lowongan yang kamu kelola</h2><p className="muted">Lihat kandidat untuk setiap posisi.</p></div></div>{companyJobs.length ? <div className="company-job-list">{companyJobs.map(j => <article className="panel company-job" key={j.id}><div className="company-job-info"><div className="company-logo">{(user?.companyName || 'IK').slice(0,2).toUpperCase()}</div><div><h3>{j.title}</h3><p className="muted">{j.location} · {label(j.jobType)}</p></div></div><div className="candidate-count"><b>{j._count?.applications || 0}</b><span>pelamar</span></div><button className="button outline small" onClick={() => void viewCandidates(j)}>Lihat kandidat →</button></article>)}</div> : <div className="empty panel"><h3>Belum ada lowongan aktif</h3><p>Buat lowongan pertama perusahaan kamu.</p><button className="button primary" onClick={() => setPage('create')}>Buat lowongan</button></div>}</section>}
      {page === 'create' && isCompany && <section className="form-page"><button className="back-link" onClick={() => setPage('dashboard')}>← Kembali ke dashboard</button><form className="panel create-form" onSubmit={createJob}><div className="eyebrow">TALENTA BERIKUTNYA DIMULAI DI SINI</div><h1>Buat lowongan baru</h1><p className="muted">Jelaskan posisi dan kualifikasi agar kandidat memahami kesempatan ini.</p><label>Judul pekerjaan<input required minLength={3} maxLength={120} value={jobForm.title} onChange={e => setJobForm({...jobForm,title:e.target.value})} placeholder="Contoh: Full Stack Developer"/></label><label>Deskripsi pekerjaan<textarea required minLength={20} maxLength={10000} rows={7} value={jobForm.description} onChange={e => setJobForm({...jobForm,description:e.target.value})} placeholder="Tanggung jawab, kualifikasi, dan skill yang dibutuhkan..."/></label><div className="form-grid"><label>Lokasi<input required value={jobForm.location} onChange={e => setJobForm({...jobForm,location:e.target.value})} placeholder="Jakarta / Remote"/></label><label>Tipe pekerjaan<select value={jobForm.jobType} onChange={e => setJobForm({...jobForm,jobType:e.target.value})}><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACT">Contract</option><option value="INTERNSHIP">Internship</option><option value="FREELANCE">Freelance</option></select></label><label>Gaji minimum (Rp)<input type="number" min="0" value={jobForm.salaryMin} onChange={e => setJobForm({...jobForm,salaryMin:e.target.value})}/></label><label>Gaji maksimum (Rp)<input type="number" min="0" value={jobForm.salaryMax} onChange={e => setJobForm({...jobForm,salaryMax:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="button ghost" onClick={() => setPage('dashboard')}>Batal</button><button className="button primary" disabled={busy}>{busy ? 'Menyimpan...' : 'Publikasikan lowongan →'}</button></div></form></section>}
      {page === 'candidates' && isCompany && <section className="dashboard"><button className="back-link" onClick={() => setPage('dashboard')}>← Kembali ke dashboard</button><div className="section-heading"><div><div className="eyebrow">MANAJEMEN TALENTA</div><h1>Kandidat</h1><p className="muted">{candidateJob?.title || 'Daftar kandidat untuk lowongan ini'}</p></div><span className="count-pill">{candidates.length} kandidat</span></div>{candidates.length ? <div className="application-list">{candidates.map(a => <article className="panel candidate-card" key={a.id}><div className="application-main"><div className="avatar large-avatar">{a.seeker?.name?.charAt(0).toUpperCase()}</div><div><h3>{a.seeker?.name}</h3><p className="company-name">{a.seeker?.email}</p><p className="muted small-text">Melamar {new Date(a.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p></div></div>{a.coverLetter && <details className="cover-letter"><summary>Lihat pesan kandidat</summary><p>{a.coverLetter}</p></details>}<div className="status-editor"><span className={`status ${statusClass(a.status)}`}>{label(a.status)}</span><select value={statusDraft[a.id] || a.status} onChange={e => setStatusDraft({...statusDraft,[a.id]:e.target.value})}><option value="APPLIED">Applied</option><option value="REVIEWING">Reviewing</option><option value="SHORTLISTED">Shortlisted</option><option value="REJECTED">Rejected</option><option value="ACCEPTED">Accepted</option></select><button className="button primary small" disabled={(statusDraft[a.id] || a.status) === a.status} onClick={() => void updateStatus(a)}>Simpan status</button></div><details><summary>Riwayat status</summary><div className="history">{a.history?.map(h => <div className="history-row" key={h.id}><span className="history-dot"/><div><b>{label(h.toStatus)}</b><p>{h.note || 'Perubahan status'}</p><small>{new Date(h.changedAt).toLocaleString('id-ID')}</small></div></div>)}</div></details></article>)}</div> : <div className="empty panel"><h3>Belum ada kandidat</h3><p>Kandidat akan muncul saat seseorang melamar posisi ini.</p></div>}</section>}
    </main><footer><button className="brand footer-brand" onClick={() => setPage('jobs')}><span className="brand-mark">ik</span><span>IndoKerja<span className="brand-dot">.id</span></span></button><span>Temukan kesempatan. Bangun masa depan.</span><span>© {new Date().getFullYear()} IndoKerja.id</span></footer>
  </div>;
}
