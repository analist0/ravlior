import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Button, ErrorState, Notice, Skeleton } from '../components/ui.tsx';
import { useConfirm } from '../components/Dialog.tsx';
import { CONTENT_STATUS_LABEL, isAdmin } from '../shared/workflow.ts';
import type { ContentStatus } from '../shared/types.ts';
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
    return { counts, questions, answered };
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
          </div>
        </>
      )}
    </div>
  );
}
