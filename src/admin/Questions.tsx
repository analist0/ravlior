import { useEffect, useState } from 'react';
import { Link, useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Breadcrumbs, Button, EmptyState, ErrorState, Notice, Pagination, SelectField, Skeleton, TextArea, TextField, formatHebDate } from '../components/ui.tsx';
import { QUESTION_STATUS_LABEL, VersionConflictError, nextQuestionStatuses } from '../shared/workflow.ts';
import { QUESTION_STATUSES, type QuestionStatus } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';
import { Uploader } from './MediaAdmin.tsx';

export function QuestionsInbox() {
  const repo = useRepo();
  const [params, update] = useSearchParams();
  const status = (params.get('status') as QuestionStatus) || '';
  const page = Number(params.get('page') ?? 1) || 1;
  const r = useAsync(() => repo.admin.listQuestions({ status, page }), [status, page]);
  return (
    <div>
      <h1>תיבת שאלות</h1>
      <Notice icon="lock">שאלות פרטיות. אין להעתיק תוכן מזהה החוצה. פרסום רק בהסכמת השואל ואחרי אישור הרב.</Notice>
      <div className="admin-toolbar" style={{ marginTop: 'var(--s-4)' }}>
        <div className="field">
          <SelectField label="סטטוס" value={status} onChange={(e) => update({ status: e.target.value, page: null })}>
            <option value="">הכול</option>
            {QUESTION_STATUSES.map((s) => <option key={s} value={s}>{QUESTION_STATUS_LABEL[s]}</option>)}
          </SelectField>
        </div>
      </div>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data?.items.length === 0 && <EmptyState icon="ask" title="אין שאלות בסטטוס זה" />}
      {!!r.data?.items.length && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>מספר</th><th>שאלה</th><th>סטטוס</th><th>פרסום</th><th>התקבלה</th></tr></thead>
            <tbody>
              {r.data.items.map((q) => (
                <tr key={q.id}>
                  <td className="kbd"><Link to={`/admin/questions/${q.id}`}>{q.trackingCode}</Link></td>
                  <td className="title-cell"><Link to={`/admin/questions/${q.id}`}>{q.questionText.slice(0, 90)}{q.questionText.length > 90 ? '…' : ''}</Link></td>
                  <td><Badge tone="accent">{QUESTION_STATUS_LABEL[q.status]}</Badge></td>
                  <td>{q.publishConsent ? <Badge tone="ok">הסכים</Badge> : <Badge>פרטי</Badge>}</td>
                  <td>{formatHebDate(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.data && <Pagination page={page} total={r.data.total} pageSize={25} hrefFor={(p) => `/admin/questions?${new URLSearchParams({ ...(status ? { status } : {}), page: String(p) })}`} />}
    </div>
  );
}

export function QuestionDetail({ id }: { id: string }) {
  const repo = useRepo();
  const { roles } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const r = useAsync(() => repo.admin.getQuestion(id), [id]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pub, setPub] = useState({ questionText: '', attribution: 'הרב ליאור כהן', topicId: '' as string });
  const q = r.data;
  useEffect(() => { if (q) { setAnswer(q.answerText ?? ''); setPub((p) => ({ ...p, questionText: p.questionText || q.questionText, topicId: q.topicId ?? '' })); } }, [q?.id, q?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setError(null);
    try { await fn(); toast(ok); r.reload(); } catch (e) { setError(e instanceof VersionConflictError ? `${e.message}` : errorMessage(e)); } finally { setBusy(false); }
  };
  if (r.loading) return <Skeleton h={300} />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  if (!q) return <ErrorState error="השאלה לא נמצאה" />;
  const next = nextQuestionStatuses(q.status, roles, q.publishConsent).filter((s) => s !== 'published');
  const canAnswer = ['assigned', 'answered'].includes(q.status) && roles.some((x) => ['owner', 'admin', 'editor', 'rabbi'].includes(x));
  const canPublish = q.status === 'approved' && q.publishConsent && roles.some((x) => ['owner', 'admin', 'rabbi'].includes(x));

  return (
    <div>
      <Breadcrumbs items={[{ label: 'ניהול', to: '/admin' }, { label: 'תיבת שאלות', to: '/admin/questions' }, { label: q.trackingCode }]} />
      <div className="spread"><h1 className="kbd" style={{ fontFamily: 'inherit' }}>שאלה {q.trackingCode}</h1><Badge tone="accent">{QUESTION_STATUS_LABEL[q.status]}</Badge></div>
      {error && <div role="alert"><Notice tone="warn" icon="alert">{error}</Notice></div>}
      <div className="editor-grid" style={{ marginTop: 'var(--s-4)' }}>
        <div className="stack">
          <section className="panel">
            <h2>השאלה</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{q.questionText}</p>
            <dl className="meta-list">
              <dt>שואל</dt><dd>{q.isAnonymous ? 'בעילום שם' : q.askerName ?? '—'}</dd>
              <dt>דוא״ל</dt><dd className="ltr">{q.contactEmail ?? '—'}</dd>
              <dt>נושא</dt><dd>{topics.data?.find((t) => t.id === q.topicId)?.name ?? '—'}</dd>
              <dt>הסכמה לפרסום</dt><dd>{q.publishConsent ? 'כן' : 'לא — פרטי בלבד'}</dd>
              <dt>התקבלה</dt><dd>{formatHebDate(q.createdAt)}</dd>
            </dl>
          </section>
          <section className="panel" aria-labelledby="h-ans">
            <h2 id="h-ans">תשובה</h2>
            <TextArea label="נוסח התשובה" value={answer} onChange={(e) => setAnswer(e.target.value)} readOnly={!canAnswer} hint={canAnswer ? 'התשובה תימסר לשואל רק לאחר אישור הרב.' : 'עריכת תשובה אפשרית בסטטוס „הועברה למענה”.'} style={{ minHeight: 200 }} />
            {canAnswer && (
              <div className="row" style={{ marginTop: 'var(--s-3)' }}>
                <Button variant="secondary" busy={busy} onClick={() => void run(() => repo.admin.updateQuestion(q.id, { answerText: answer }, q.version), 'הטיוטה נשמרה')}>שמירת טיוטת תשובה</Button>
                {q.status === 'assigned' && <Button busy={busy} onClick={() => void run(async () => { const u = await repo.admin.updateQuestion(q.id, { answerText: answer }, q.version); await repo.admin.transitionQuestion(q.id, 'answered', u.version); }, 'נשלח לאישור הרב')}>שליחה לאישור הרב</Button>}
              </div>
            )}
            {roles.some((x) => ['owner', 'admin', 'rabbi'].includes(x)) && canAnswer && (
              <div style={{ marginTop: 'var(--s-4)' }}>
                <span className="field-label">תשובה קולית (פרטית)</span>
                <Uploader bucket="private-submissions" accept="audio/*" onDone={(res) => void run(() => repo.admin.updateQuestion(q.id, { answerAudioPath: res.path }, q.version), 'ההקלטה צורפה')} />
                {q.answerAudioPath && <p className="soft">מצורפת הקלטה: <span className="kbd">{q.answerAudioPath}</span></p>}
              </div>
            )}
          </section>
          {canPublish && (
            <section className="panel" aria-labelledby="h-pub">
              <h2 id="h-pub">פרסום באתר (עותק ערוך)</h2>
              <Notice>העותק הציבורי נפרד מהשאלה הפרטית. יש להסיר פרטים מזהים.</Notice>
              <div className="form-grid" style={{ marginTop: 'var(--s-3)' }}>
                <TextArea label="השאלה כפי שתפורסם" value={pub.questionText} onChange={(e) => setPub({ ...pub, questionText: e.target.value })} />
                <TextField label="ייחוס" value={pub.attribution} onChange={(e) => setPub({ ...pub, attribution: e.target.value })} />
                <SelectField label="נושא" value={pub.topicId} onChange={(e) => setPub({ ...pub, topicId: e.target.value })}>
                  <option value="">—</option>{topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <Button busy={busy} onClick={() => void confirm({ title: 'פרסום השאלה והתשובה', body: 'השאלה הערוכה והתשובה המאושרת יפורסמו באתר הציבורי.', confirmLabel: 'פרסום' }).then(async (ok) => { if (ok) await run(() => repo.admin.publishQuestion(q.id, q.version, {
                  questionText: pub.questionText, answerBlocks: (q.answerText ?? '').split(/\n{2,}/).filter(Boolean).map((text) => ({ type: 'paragraph' as const, text })), topicId: pub.topicId || null, attribution: pub.attribution,
                }), 'פורסם'); })}>פרסום</Button>
              </div>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="panel">
            <h2>תהליך</h2>
            <ol style={{ paddingInlineStart: 'var(--s-5)', fontSize: 'var(--step--1)' }}>
              {(['submitted', 'triaged', 'assigned', 'answered', 'approved', 'private_delivered', 'closed'] as QuestionStatus[]).map((s) => (
                <li key={s} style={{ fontWeight: s === q.status ? 700 : 400 }}>{QUESTION_STATUS_LABEL[s]}</li>
              ))}
            </ol>
            <div className="stack">
              {next.map((s) => (
                <Button key={s} variant="secondary" busy={busy} style={{ width: '100%' }} onClick={() => void run(() => repo.admin.transitionQuestion(q.id, s, q.version), `עודכן: ${QUESTION_STATUS_LABEL[s]}`)}>
                  {s === 'approved' ? 'אישור התשובה (הרב)' : s === 'private_delivered' ? 'מסירה פרטית לשואל' : `העברה ל„${QUESTION_STATUS_LABEL[s]}”`}
                </Button>
              ))}
              {next.length === 0 && <p className="soft">אין מעברים זמינים לתפקיד שלך.</p>}
              {q.status === 'answered' && !roles.includes('rabbi') && <Notice>ממתין לאישור הרב. רק תפקיד „הרב” מאשר תשובה בשמו.</Notice>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
