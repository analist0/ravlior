import { useEffect, useState } from 'react';
import { Link, useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Breadcrumbs, Button, EmptyState, ErrorState, Notice, Pagination, SelectField, Skeleton, TextArea, TextField, formatHebDate } from '../components/ui.tsx';
import { audioFileLabel, isOverdue } from '../shared/responsa.ts';
import { QUESTION_STATUS_LABEL, VersionConflictError, nextQuestionStatuses, questionTransitionNeedsReason } from '../shared/workflow.ts';
import { QUESTION_STATUSES, type QuestionStatus } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';
import { Uploader } from './MediaAdmin.tsx';

export function QuestionsInbox() {
  const repo = useRepo();
  const [params, update] = useSearchParams();
  const status = (params.get('status') as QuestionStatus) || '';
  const q = params.get('q') ?? '';
  const sortParam = params.get('sort');
  const sort = sortParam === 'status' || sortParam === 'code' || sortParam === 'oldest' || sortParam === 'priority' ? sortParam : 'newest';
  const page = Number(params.get('page') ?? 1) || 1;
  const [text, setText] = useState(q);
  const r = useAsync(() => repo.admin.listQuestions({ status, page, q, sort }), [status, page, q, sort]);
  const stats = useAsync(() => repo.admin.questionStats(), [repo]);
  return (
    <div>
      <h1>תיבת שאלות</h1>
      <Notice icon="lock">שאלות פרטיות. אין להעתיק תוכן מזהה החוצה. פרסום רק בהסכמת השואל ואחרי אישור הרב.</Notice>
      {stats.data && (
        <div className="admin-cards" style={{ marginTop: 'var(--s-4)' }}>
          <div className="stat"><strong>{stats.data.open}</strong>פתוחות</div>
          <div className="stat"><strong>{stats.data.pendingRabbi}</strong>ממתינות לרב</div>
          <div className="stat"><strong>{stats.data.overdue}</strong>באיחור</div>
          <div className="stat"><strong>{stats.data.avgResponseDays ?? '—'}</strong>ימים ממוצע עד מענה</div>
        </div>
      )}
      <form className="admin-toolbar" role="search" style={{ marginTop: 'var(--s-4)' }} onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="qq">חיפוש</label>
          <input id="qq" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== q && update({ q: text, page: null })} placeholder="טקסט או מספר מעקב" />
        </div>
        <div className="field">
          <SelectField label="סטטוס" value={status} onChange={(e) => update({ status: e.target.value, page: null })}>
            <option value="">הכול</option>
            {QUESTION_STATUSES.map((s) => <option key={s} value={s}>{QUESTION_STATUS_LABEL[s]}</option>)}
          </SelectField>
        </div>
        <div className="field">
          <SelectField label="מיון" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}>
            <option value="newest">חדשות תחילה</option>
            <option value="oldest">ישנות שלא טופלו</option>
            <option value="priority">עדיפות</option>
            <option value="status">סטטוס</option>
            <option value="code">מספר מעקב</option>
          </SelectField>
        </div>
      </form>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data?.items.length === 0 && <EmptyState icon="ask" title={q || status ? 'אין שאלות התואמות לסינון' : 'אין שאלות'} />}
      {!!r.data?.items.length && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>מספר</th><th>שאלה</th><th>סטטוס</th><th>פרסום</th><th>התקבלה</th><th>יעד</th></tr></thead>
            <tbody>
              {r.data.items.map((q) => (
                <tr key={q.id}>
                  <td className="kbd"><Link to={`/admin/questions/${q.id}`}>{q.trackingCode}</Link></td>
                  <td className="title-cell"><Link to={`/admin/questions/${q.id}`}>{q.questionText.slice(0, 90)}{q.questionText.length > 90 ? '…' : ''}</Link></td>
                  <td><Badge tone="accent">{QUESTION_STATUS_LABEL[q.status]}</Badge></td>
                  <td>{q.publishConsent ? <Badge tone="ok">הסכים</Badge> : <Badge>פרטי</Badge>}</td>
                  <td>{formatHebDate(q.createdAt)}</td>
                  <td>{isOverdue(q.dueAt, q.status) ? <Badge tone="danger">באיחור</Badge> : q.dueAt ? formatHebDate(q.dueAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.data && <Pagination page={page} total={r.data.total} pageSize={25} hrefFor={(p) => {
        const n = new URLSearchParams(params);
        n.set('page', String(p));
        return `/admin/questions?${n}`;
      }} />}
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
  const staff = useAsync(() => repo.admin.listStaff(), [repo]);
  const templates = useAsync(() => repo.admin.listTemplates(), [repo]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  const published = useAsync(() => (r.data?.publicQuestionId ? repo.admin.get('publicQuestions', r.data.publicQuestionId) : Promise.resolve(null)), [r.data?.publicQuestionId]);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState('');
  const [kind, setKind] = useState('written');
  const [priority, setPriority] = useState('1');
  const [dueAt, setDueAt] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pub, setPub] = useState({ questionText: '', attribution: 'הרב ליאור כהן', topicId: '' as string, categoryId: '' });
  const q = r.data;
  useEffect(() => {
    if (!q) return;
    setAnswer(q.answerText ?? '');
    setSources(q.answerSources ?? '');
    setKind(q.answerKind ?? 'written');
    setPriority(String(q.priority ?? 1));
    setDueAt(q.dueAt ? q.dueAt.slice(0, 10) : '');
    setAssignee(q.assignedTo ?? '');
    setPub((p) => ({ ...p, questionText: p.questionText || q.questionText, topicId: q.topicId ?? '' }));
  }, [q?.id, q?.version]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {note && <Notice>{note}</Notice>}
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
              <dt>מטפל</dt><dd>{staff.data?.find((s) => s.id === q.assignedTo)?.displayName ?? '—'}</dd>
              {q.voiceQuestionPath && <><dt>הקלטת השואל</dt><dd>{audioFileLabel(q.voiceQuestionPath)}</dd></>}
            </dl>
            <div className="form-grid" style={{ marginTop: 'var(--s-3)' }}>
              <SelectField label="עדיפות" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="0">נמוכה</option>
                <option value="1">רגילה</option>
                <option value="2">גבוהה</option>
                <option value="3">דחופה</option>
              </SelectField>
              <TextField label="יעד למענה" type="date" dir="ltr" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              <SelectField label="שיוך לאיש צוות" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">ללא</option>
                {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
              </SelectField>
              <Button variant="secondary" busy={busy} onClick={() => void run(() => repo.admin.updateQuestion(q.id, { priority: Number(priority), dueAt: dueAt ? new Date(dueAt).toISOString() : null, assignedTo: assignee || null }, q.version), 'השיוך נשמר')}>שמירת שיוך</Button>
              {isOverdue(q.dueAt, q.status) && <Badge tone="danger">באיחור</Badge>}
            </div>
          </section>
          <section className="panel" aria-labelledby="h-ans">
            <h2 id="h-ans">תשובה</h2>
            <TextArea label="נוסח התשובה" value={answer} onChange={(e) => setAnswer(e.target.value)} readOnly={!canAnswer} hint={canAnswer ? 'התשובה תימסר לשואל רק לאחר אישור הרב. שינוי אחרי אישור מחזיר את השאלה לאישור מחדש.' : 'עריכת תשובה אפשרית בסטטוס „הועברה למענה”.'} style={{ minHeight: 200 }} />
            {canAnswer && templates.data && templates.data.length > 0 && (
              <SelectField label="תבנית תשובה" value="" onChange={(e) => { const t = templates.data?.find((x) => x.id === e.target.value); if (t) setAnswer(t.body); }}>
                <option value="">בחירת תבנית (לא תוכן של הרב)</option>
                {templates.data.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </SelectField>
            )}
            <TextArea label="מראי מקומות" value={sources} onChange={(e) => setSources(e.target.value)} readOnly={!canAnswer} />
            <SelectField label="סוג התשובה" value={kind} disabled={!canAnswer} onChange={(e) => setKind(e.target.value)}>
              <option value="written">כתובה</option>
              <option value="oral">בעל פה</option>
              <option value="both">כתובה ובעל פה</option>
            </SelectField>
            {canAnswer && (
              <div className="row" style={{ marginTop: 'var(--s-3)' }}>
                <Button variant="secondary" busy={busy} onClick={() => void run(() => repo.admin.updateQuestion(q.id, { answerText: answer, answerSources: sources, answerKind: kind as 'written' | 'oral' | 'both' }, q.version), 'הטיוטה נשמרה')}>שמירת טיוטת תשובה</Button>
                {q.status === 'assigned' && <Button busy={busy} onClick={() => void run(async () => { const u = await repo.admin.updateQuestion(q.id, { answerText: answer }, q.version); await repo.admin.transitionQuestion(q.id, 'answered', u.version); }, 'נשלח לאישור הרב')}>שליחה לאישור הרב</Button>}
              </div>
            )}
            {roles.some((x) => ['owner', 'admin', 'rabbi'].includes(x)) && canAnswer && (
              <div style={{ marginTop: 'var(--s-4)' }}>
                <span className="field-label">תשובה קולית (פרטית)</span>
                <Uploader bucket="private-submissions" accept="audio/*" onDone={(res) => void run(() => repo.admin.updateQuestion(q.id, { answerAudioPath: res.path }, q.version), 'ההקלטה צורפה')} />
                {q.answerAudioPath && <p className="soft">מצורפת: {audioFileLabel(q.answerAudioPath)}</p>}
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
                <SelectField label="מדף הלכה" value={pub.categoryId} onChange={(e) => setPub({ ...pub, categoryId: e.target.value })}>
                  <option value="">—</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
                <Notice>התשובה הציבורית נבנית בשרת מהנוסח שאושר. שינוי ניסוח השאלה הציבורית דורש אישור מחדש של הרב.</Notice>
                <Button busy={busy} onClick={() => void confirm({ title: 'פרסום השאלה והתשובה', body: 'השאלה הערוכה והתשובה המאושרת יפורסמו באתר הציבורי. אם ניסוח השאלה שונה — היא תחכה לאישור הרב.', confirmLabel: 'פרסום' }).then(async (ok) => {
                  if (!ok) return;
                  setBusy(true); setError(null); setNote(null);
                  try {
                    const result = await repo.admin.publishQuestion(q.id, q.version, { questionText: pub.questionText, topicId: pub.topicId || null, attribution: pub.attribution, categoryId: pub.categoryId || null, answerKind: kind });
                    if (result.needsReapproval) setNote('הנוסח הציבורי שונה מהשאלה שאושרה. השו״ת נשמר וממתין לאישור הרב לפני פרסום.');
                    else toast('פורסם');
                    r.reload();
                  } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
                })}>פרסום</Button>
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
              <TextField label="סיבה ליומן" value={reason} onChange={(e) => setReason(e.target.value)} hint="חובה בהחזרה מאישור או בהסרת פרסום." />
              {next.map((s) => (
                <Button key={s} variant="secondary" busy={busy} style={{ width: '100%' }} onClick={() => {
                  if (questionTransitionNeedsReason(q.status, s) && !reason.trim()) { setError('נדרשת סיבה ליומן עבור המעבר הזה.'); return; }
                  void run(() => repo.admin.transitionQuestion(q.id, s, q.version, reason || undefined), `עודכן: ${QUESTION_STATUS_LABEL[s]}`);
                }}>
                  {s === 'approved' ? 'אישור התשובה (הרב)' : s === 'private_delivered' ? 'מסירה פרטית לשואל' : `העברה ל„${QUESTION_STATUS_LABEL[s]}”`}
                </Button>
              ))}
              {published.data && 'status' in published.data && published.data.status === 'published' && (
                <Button variant="danger" busy={busy} style={{ width: '100%' }} onClick={() => {
                  if (!reason.trim()) { setError('נדרשת סיבה ליומן כדי להסיר פרסום.'); return; }
                  void run(() => repo.admin.unpublishPublic(published.data!.id, published.data!.version, 'draft', reason), 'הפרסום הוסר');
                }}>הסרת פרסום לטיוטה</Button>
              )}
              {next.length === 0 && <p className="soft">אין מעברים זמינים לתפקיד שלך.</p>}
              {q.status === 'answered' && !roles.includes('rabbi') && <Notice>ממתין לאישור הרב. רק תפקיד „הרב” מאשר תשובה בשמו.</Notice>}
            </div>
          </section>
          {canAnswer && (
            <section className="panel">
              <h2>שמירת תבנית</h2>
              <TextField label="שם התבנית" value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} />
              <Button variant="secondary" style={{ marginTop: 'var(--s-3)', width: '100%' }} busy={busy} onClick={() => void run(async () => { await repo.admin.saveTemplate({ title: tplTitle, body: answer }); setTplTitle(''); templates.reload(); }, 'התבנית נשמרה')}>שמירת הנוסח כתבנית</Button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
