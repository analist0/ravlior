import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Button, ErrorState, Notice, Skeleton } from '../components/ui.tsx';
import { useConfirm } from '../components/Dialog.tsx';
import { partitionEvents, todayIso } from '../shared/sections.ts';
import { TopicBars } from '../qa/pieces.tsx';
import { CONTENT_STATUS_LABEL, isAdmin } from '../shared/workflow.ts';
import type { ContentStatus, EventRecord } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';

function Today({ stats, rabbi }: { stats: { questions: number | null; answered: number | null; contacts: number | null; scheduled: number; counts: readonly (readonly [ContentStatus, number])[] }; rabbi: boolean }) {
  const review = stats.counts.find(([s]) => s === 'in_review')?.[1] ?? 0;
  const actions = [
    stats.answered != null && stats.answered > 0 ? { to: '/admin/questions?status=answered', n: stats.answered, title: 'תשובות שמחכות לאישור', text: 'רק אחרי אישור הן יכולות להימסר.' } : null,
    stats.questions != null && stats.questions > 0 ? { to: '/admin/questions?status=submitted', n: stats.questions, title: 'שאלות חדשות למיון', text: 'עוד לא נכנסו לטיפול.' } : null,
    review > 0 ? { to: '/admin/content?status=in_review', n: review, title: 'תכנים לבדיקה', text: 'ממתינים לעין לפני פרסום.' } : null,
    stats.contacts != null && stats.contacts > 0 ? { to: '/admin/contact?status=new', n: stats.contacts, title: 'פניות חדשות לאתר', text: 'זו לא תיבת השאלות ההלכתיות.' } : null,
    stats.scheduled > 0 ? { to: '/admin/content', n: stats.scheduled, title: 'פרסום מתוזמן', text: 'ייפתח מעצמו בזמן שנקבע.' } : null,
  ].filter((a): a is { to: string; n: number; title: string; text: string } => !!a);
  return (
    <section className="today-desk" aria-labelledby="h-today">
      <p className="eyebrow">{rabbi ? 'לרב' : 'ליום העבודה'}</p>
      <h2 id="h-today">מה על השולחן</h2>
      {actions.length === 0
        ? <p className="soft" style={{ margin: 0 }}>אין כרגע משימה פתוחה. אפשר לעיין במצב הארכיון למטה.</p>
        : (
          <div className="today-actions">
            {actions.map((a) => (
              <Link key={a.to} to={a.to} className="today-action">
                <strong>{a.n}</strong>
                <span>{a.title}</span>
                <span className="soft">{a.text}</span>
              </Link>
            ))}
          </div>
        )}
    </section>
  );
}

export default function Dashboard() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const confirm = useConfirm();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const stats = useAsync(async () => {
    const statuses: ContentStatus[] = ['draft', 'in_review', 'approved', 'published', 'archived'];
    const counts = await Promise.all(statuses.map((s) => repo.admin.list('content', { status: s, pageSize: 1 }).then((r) => [s, r.total] as const)));
    const questions = roles.some((r) => r !== 'viewer') ? await repo.admin.listQuestions({ status: 'submitted' }).then((r) => r.total, () => null) : null;
    const answered = roles.includes('rabbi') ? await repo.admin.listQuestions({ status: 'answered' }).then((r) => r.total, () => null) : null;
    const qa = roles.some((r) => r !== 'viewer') ? await repo.admin.questionStats().catch(() => null) : null;
    const books = await repo.admin.list('content', { type: 'book', pageSize: 1 }).then((r) => r.total);
    const leaflets = await repo.admin.list('content', { type: 'leaflet', pageSize: 1 }).then((r) => r.total);
    const institutions = await repo.admin.list('institutions', { pageSize: 1 }).then((r) => r.total);
    const scheduled = await repo.admin.list('content', { scheduled: true, pageSize: 1 }).then((r) => r.total);
    const eventPage = await repo.admin.list('events', { pageSize: 100 });
    const buckets = partitionEvents(eventPage.items as EventRecord[], todayIso());
    const canInbox = roles.some((r) => r === 'owner' || r === 'admin' || r === 'editor' || r === 'reviewer');
    const contacts = canInbox ? await repo.admin.listContacts({ status: 'new', pageSize: 1 }).then((r) => r.total, () => null) : null;
    return { counts, questions, answered, books, leaflets, institutions, scheduled, upcoming: buckets.upcoming.length, undated: buckets.undated.length, past: buckets.past.length, contacts, qa };
  }, [repo]);
  return (
    <div>
      <h1>לוח בקרה</h1>
      {repo.mode === 'demo' && (
        <Notice tone="warn" icon="alert">
          מצב הדגמה — אין חיבור למסד נתונים. כל שינוי נשמר בדפדפן זה בלבד. לחיבור אמיתי ראו README → Loading Postgres.
          {isAdmin(roles) && <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => void confirm({ title: 'איפוס נתוני ההדגמה', body: 'כל השינויים המקומיים יימחקו והנתונים יחזרו לזרע המקורי.', confirmLabel: 'איפוס', danger: true }).then(async (ok) => { if (ok) { await repo.demoReset?.(); location.reload(); } })}>איפוס נתוני ההדגמה</Button></div>}
        </Notice>
      )}
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {stats.loading && <Skeleton h={120} />}
      {stats.data && (
        <>
          <Today stats={stats.data} rabbi={roles.includes('rabbi')} />
          <h2 style={{ fontSize: 'var(--step-1)', marginTop: 'var(--s-6)' }}>מצב הארכיון</h2>
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
            {stats.data.qa && <Link to="/admin/questions?sort=oldest" className="stat" style={{ textDecoration: 'none', color: 'var(--text)' }}><strong>{stats.data.qa.overdue}</strong>שאלות באיחור</Link>}
            {stats.data.qa && <div className="stat"><strong>{stats.data.qa.pendingRabbi}</strong>ממתינות לרב</div>}
            {stats.data.qa && <div className="stat"><strong>{stats.data.qa.avgResponseDays ?? '—'}</strong>ימים ממוצע עד מענה</div>}
            {stats.data.qa && <div style={{ gridColumn: '1 / -1' }}><h3 style={{ fontSize: 'var(--step-0)' }}>שאלות לפי נושא</h3><TopicBars rows={stats.data.qa.byTopic.map((row) => ({ label: topics.data?.find((t) => t.id === row.topicId)?.name ?? 'ללא נושא', count: row.count }))} /></div>}
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
