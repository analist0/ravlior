import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Button, ErrorState, Notice, Skeleton } from '../components/ui.tsx';
import { useConfirm } from '../components/Dialog.tsx';
import { partitionEvents, todayIso } from '../shared/sections.ts';
import { CONTENT_STATUS_LABEL, isAdmin } from '../shared/workflow.ts';
import type { ContentStatus, EventRecord } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';

export default function Dashboard() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const confirm = useConfirm();
  const stats = useAsync(async () => {
    const statuses: ContentStatus[] = ['draft', 'in_review', 'approved', 'published', 'archived'];
    const counts = await Promise.all(statuses.map((s) => repo.admin.list('content', { status: s, pageSize: 1 }).then((r) => [s, r.total] as const)));
    const questions = roles.some((r) => r !== 'viewer') ? await repo.admin.listQuestions({ status: 'submitted' }).then((r) => r.total, () => null) : null;
    const answered = roles.includes('rabbi') ? await repo.admin.listQuestions({ status: 'answered' }).then((r) => r.total, () => null) : null;
    const books = await repo.admin.list('content', { type: 'book', pageSize: 1 }).then((r) => r.total);
    const leaflets = await repo.admin.list('content', { type: 'leaflet', pageSize: 1 }).then((r) => r.total);
    const institutions = await repo.admin.list('institutions', { pageSize: 1 }).then((r) => r.total);
    const scheduled = await repo.admin.list('content', { scheduled: true, pageSize: 1 }).then((r) => r.total);
    const eventPage = await repo.admin.list('events', { pageSize: 100 });
    const buckets = partitionEvents(eventPage.items as EventRecord[], todayIso());
    const canInbox = roles.some((r) => r === 'owner' || r === 'admin' || r === 'editor' || r === 'reviewer');
    const contacts = canInbox ? await repo.admin.listContacts({ status: 'new', pageSize: 1 }).then((r) => r.total, () => null) : null;
    return { counts, questions, answered, books, leaflets, institutions, scheduled, upcoming: buckets.upcoming.length, undated: buckets.undated.length, past: buckets.past.length, contacts };
  }, [repo]);
  return (
    <div>
      <h1>לוח בקרה</h1>
      {repo.mode === 'demo' && (
        <Notice tone="warn" icon="alert">
          מצב הדגמה — אין חיבור למסד נתונים. כל שינוי נשמר בדפדפן זה בלבד. לחיבור אמיתי ראו README → „חיבור Supabase”.
          {isAdmin(roles) && <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => void confirm({ title: 'איפוס נתוני ההדגמה', body: 'כל השינויים המקומיים יימחקו והנתונים יחזרו לזרע המקורי.', confirmLabel: 'איפוס', danger: true }).then(async (ok) => { if (ok) { await repo.demoReset?.(); location.reload(); } })}>איפוס נתוני ההדגמה</Button></div>}
        </Notice>
      )}
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {stats.loading && <Skeleton h={120} />}
      {stats.data && (
        <>
          <h2 style={{ fontSize: 'var(--step-1)', marginTop: 'var(--s-6)' }}>תכנים לפי סטטוס</h2>
          <div className="admin-cards">
            {stats.data.counts.map(([s, n]) => (
              <Link key={s} to={`/admin/content?status=${s}`} className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                <strong>{n}</strong>{CONTENT_STATUS_LABEL[s]}
              </Link>
            ))}
          </div>
          <h2 style={{ fontSize: 'var(--step-1)', marginTop: 'var(--s-6)' }}>משימות</h2>
          <div className="admin-cards">
            {stats.data.questions !== null && <Link to="/admin/questions?status=submitted" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.questions}</strong>שאלות חדשות למיון</Link>}
            {stats.data.answered !== null && <Link to="/admin/questions?status=answered" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.answered}</strong>תשובות הממתינות לאישורך</Link>}
            <Link to="/admin/content?status=in_review" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong><Icon name="eye" /></strong>תכנים לבדיקה</Link>
            <Link to="/admin/content/new" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong><Icon name="plus" /></strong>תוכן חדש</Link>
            {stats.data.contacts !== null && <Link to="/admin/contact?status=new" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.contacts}</strong>פניות חדשות לאתר</Link>}
            {stats.data.scheduled > 0 && <Link to="/admin/content" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.scheduled}</strong>תכנים מתוזמנים לפרסום</Link>}
          </div>
          <h2 style={{ fontSize: 'var(--step-1)', marginTop: 'var(--s-6)' }}>ספרים, מוסדות ואירועים</h2>
          <div className="admin-cards">
            <Link to="/admin/content?type=book" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.books}</strong>ספרים</Link>
            <Link to="/admin/content?type=leaflet" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.leaflets}</strong>קונטרסים</Link>
            <Link to="/admin/institutions" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.institutions}</strong>מוסדות</Link>
            <Link to="/admin/events" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.upcoming}</strong>אירועים עם תאריך מהיום ואילך</Link>
            <Link to="/events" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.undated}</strong>אירועים בלי תאריך שמור</Link>
            <Link to="/events" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.past}</strong>אירועים שעברו</Link>
          </div>
        </>
      )}
    </div>
  );
}
