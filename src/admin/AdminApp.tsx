import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import { useHead } from '../app/head.ts';
import { Link, matchPath, useRouter } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type Session } from '../data/repo.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { BrandMark, DemoBanner } from '../components/Layout.tsx';
import { Button, ErrorState, Notice, Skeleton, TextField } from '../components/ui.tsx';
import { ROLE_LABEL, isAdmin, isStaff } from '../shared/workflow.ts';
import { MODULES } from '../modules/manifest.ts';
import type { Role } from '../shared/types.ts';
import type { EntityName } from '../data/repo.ts';

const Dashboard = lazy(() => import('./Dashboard.tsx'));
const EntityList = lazy(() => import('./EntityList.tsx'));
const EntityEditor = lazy(() => import('./EntityEditor.tsx'));
const Questions = lazy(() => import('./Questions.tsx').then((m) => ({ default: m.QuestionsInbox })));
const QuestionDetail = lazy(() => import('./Questions.tsx').then((m) => ({ default: m.QuestionDetail })));
const MenusEditor = lazy(() => import('./Site.tsx').then((m) => ({ default: m.MenusEditor })));
const HomeEditor = lazy(() => import('./Site.tsx').then((m) => ({ default: m.HomeEditor })));
const ModulesScreen = lazy(() => import('./Site.tsx').then((m) => ({ default: m.ModulesScreen })));
const UsersScreen = lazy(() => import('./People.tsx').then((m) => ({ default: m.UsersScreen })));
const AuditScreen = lazy(() => import('./People.tsx').then((m) => ({ default: m.AuditScreen })));
const MediaScreen = lazy(() => import('./MediaAdmin.tsx'));
const ImportExport = lazy(() => import('./ImportExport.tsx'));

interface AdminCtx { session: Session; roles: Role[]; modules: Record<string, boolean>; reloadModules: () => void }
const Ctx = createContext<AdminCtx | null>(null);
export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin outside AdminApp');
  return c;
}

const ENTITY_ROUTES: [string, EntityName][] = [
  ['content', 'content'], ['series', 'series'], ['topics', 'topics'], ['pages', 'pages'],
  ['institutions', 'institutions'], ['events', 'events'], ['public-questions', 'publicQuestions'],
];

interface NavItem { to: string; label: string; icon: IconName; module?: string; adminOnly?: boolean }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'כללי', items: [{ to: '/admin', label: 'לוח בקרה', icon: 'home' }] },
  { group: 'תוכן', items: [
    { to: '/admin/content', label: 'תכנים', icon: 'library', module: 'library' },
    { to: '/admin/series', label: 'סדרות', icon: 'layers', module: 'library' },
    { to: '/admin/topics', label: 'נושאים', icon: 'list', module: 'library' },
    { to: '/admin/pages', label: 'עמודים', icon: 'file', module: 'pages' },
    { to: '/admin/institutions', label: 'מוסדות', icon: 'building', module: 'institutions' },
    { to: '/admin/events', label: 'אירועים', icon: 'history', module: 'institutions' },
  ] },
  { group: 'שו״ת', items: [
    { to: '/admin/questions', label: 'תיבת שאלות', icon: 'ask', module: 'responsa' },
    { to: '/admin/public-questions', label: 'שו״ת מפורסם', icon: 'read', module: 'responsa' },
  ] },
  { group: 'אתר', items: [
    { to: '/admin/home', label: 'דף הבית', icon: 'home', module: 'home-builder' },
    { to: '/admin/menus', label: 'תפריטים', icon: 'menu', module: 'pages' },
    { to: '/admin/media', label: 'מדיה והעלאות', icon: 'upload', module: 'media' },
    { to: '/admin/import', label: 'ייבוא וייצוא', icon: 'download' },
    { to: '/admin/modules', label: 'מודולים', icon: 'settings', adminOnly: true },
  ] },
  { group: 'ניהול', items: [
    { to: '/admin/users', label: 'משתמשים ותפקידים', icon: 'user', adminOnly: true },
    { to: '/admin/audit', label: 'יומן פעולות', icon: 'history', adminOnly: true },
  ] },
];

function Login({ onDone }: { onDone: (s: Session) => void }) {
  const repo = useRepo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { onDone(await repo.signIn(email, password)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="container">
      <div className="login-card">
        <div className="row" style={{ marginBottom: 'var(--s-5)' }}><BrandMark /><h1 style={{ margin: 0, fontSize: 'var(--step-2)' }}>כניסת צוות</h1></div>
        {repo.mode === 'demo' ? (
          <>
            <Notice tone="warn" icon="alert">מצב הדגמה: אין חיבור ל-Supabase Auth. בחרו תפקיד כדי לסייר בממשק. השינויים נשמרים בדפדפן זה בלבד.</Notice>
            <div className="admin-cards" style={{ marginTop: 'var(--s-4)' }}>
              {(['owner', 'admin', 'editor', 'reviewer', 'rabbi', 'viewer'] as Role[]).map((r) => (
                <Button key={r} variant="secondary" onClick={() => void repo.demoSignIn!(r).then(onDone)}>{ROLE_LABEL[r]}</Button>
              ))}
            </div>
          </>
        ) : (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {error && <div role="alert"><Notice tone="warn" icon="alert">{error}</Notice></div>}
            <TextField label="דוא״ל" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField label="סיסמה" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" busy={busy} icon="lock">כניסה</Button>
            <p className="soft">חשבונות צוות נוצרים בהזמנה בלבד. הרשאות נקבעות בטבלת התפקידים במסד הנתונים, לא בדפדפן.</p>
          </form>
        )}
        <p style={{ marginTop: 'var(--s-5)' }}><Link to="/">חזרה לאתר</Link></p>
      </div>
    </div>
  );
}

function AdminRoutes() {
  const { loc } = useRouter();
  const p = loc.pathname.replace(/\/$/, '') || '/admin';
  if (p === '/admin') return <Dashboard />;
  for (const [seg, entity] of ENTITY_ROUTES) {
    if (p === `/admin/${seg}`) return <EntityList key={entity} entity={entity} />;
    const m = matchPath(`/admin/${seg}/:id`, p);
    if (m) return <EntityEditor key={`${entity}-${m.id}`} entity={entity} id={m.id === 'new' ? null : m.id!} />;
  }
  const q = matchPath('/admin/questions/:id', p);
  if (q) return <QuestionDetail id={q.id!} />;
  switch (p) {
    case '/admin/questions': return <Questions />;
    case '/admin/menus': return <MenusEditor />;
    case '/admin/home': return <HomeEditor />;
    case '/admin/modules': return <ModulesScreen />;
    case '/admin/users': return <UsersScreen />;
    case '/admin/audit': return <AuditScreen />;
    case '/admin/media': return <MediaScreen />;
    case '/admin/import': return <ImportExport />;
  }
  return <ErrorState error="המסך לא נמצא" />;
}

function Layout({ children, ctx, onSignOut }: { children: ReactNode; ctx: AdminCtx; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const { loc } = useRouter();
  useEffect(() => setOpen(false), [loc.pathname]);
  const nav = (
    <nav className="admin-nav" aria-label="ניווט ניהול">
      {NAV.map((g) => {
        const items = g.items.filter((i) => (!i.module || ctx.modules[i.module] !== false) && (!i.adminOnly || isAdmin(ctx.roles)));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <div className="group">{g.group}</div>
            {items.map((i) => (
              <Link key={i.to} to={i.to} aria-current={loc.pathname === i.to || (i.to !== '/admin' && loc.pathname.startsWith(i.to + '/')) ? 'page' : undefined}>
                <Icon name={i.icon} /> {i.label}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
  return (
    <div className="admin" dir="rtl">
      <aside className={`admin-side ${open ? 'open' : ''}`} aria-label="תפריט ניהול">
        <div className="spread">
          <Link to="/" className="brand"><BrandMark /><span className="brand-name" style={{ fontSize: 'var(--step-0)' }}>ניהול אור המאיר</span></Link>
          {open && <button className="icon-btn" aria-label="סגירת התפריט" onClick={() => setOpen(false)}><Icon name="close" /></button>}
        </div>
        {nav}
      </aside>
      {open && <div className="dialog-overlay" style={{ zIndex: 55 }} onClick={() => setOpen(false)} aria-hidden="true" />}
      <div style={{ minWidth: 0 }}>
        <DemoBanner />
        <div className="admin-top">
          <button className="icon-btn admin-menu-btn" aria-label="תפריט ניהול" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span className="soft" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctx.session.email} · {ctx.roles.map((r) => ROLE_LABEL[r]).join(', ') || 'ללא תפקיד'}</span>
          <span className="grow" />
          <Link to="/" className="btn btn-ghost btn-sm"><Icon name="eye" /> לאתר</Link>
          <Button variant="ghost" size="sm" icon="logout" onClick={onSignOut}>יציאה</Button>
        </div>
        <main className="admin-main" id="main">
          <Suspense fallback={<div role="status"><Skeleton h={32} w="40%" /><div style={{ height: 12 }} /><Skeleton h={300} /></div>}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const repo = useRepo();
  const { navigate } = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const mods = useAsync(() => repo.getModules(), [repo]);
  useHead({ title: 'ניהול', noindex: true });
  useEffect(() => {
    void repo.getSession().then(setSession);
    return repo.onAuthChange(setSession);
  }, [repo]);

  if (session === undefined) return <div className="container section"><Skeleton h={200} /></div>;
  if (!session) return <Login onDone={setSession} />;
  if (!isStaff(session.roles))
    return (
      <div className="container section">
        <ErrorState error="החשבון מחובר אך אין לו תפקיד צוות. בעל האתר צריך להעניק תפקיד במסך המשתמשים." />
        <p style={{ textAlign: 'center' }}><Button variant="secondary" onClick={() => void repo.signOut().then(() => setSession(null))}>יציאה</Button></p>
      </div>
    );
  const ctx: AdminCtx = {
    session, roles: session.roles, reloadModules: mods.reload,
    modules: Object.fromEntries((mods.data ?? MODULES.map((m) => ({ id: m.id, enabled: m.enabledByDefault }))).map((m) => [m.id, m.enabled])),
  };
  return (
    <Ctx.Provider value={ctx}>
      <Layout ctx={ctx} onSignOut={() => void repo.signOut().then(() => { setSession(null); navigate('/admin'); })}>
        <AdminRoutes />
      </Layout>
    </Ctx.Provider>
  );
}
