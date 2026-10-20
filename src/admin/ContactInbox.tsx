import { useState } from 'react';
import { useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, ErrorState, Notice, Pagination, SelectField, Skeleton, formatHebDate } from '../components/ui.tsx';
import { CONTACT_STATUSES, type ContactStatus } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';

const LABEL: Record<ContactStatus, string> = { new: 'חדשה', read: 'נקראה', archived: 'בארכיון' };

export default function ContactInbox() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const toast = useToast();
  const [params, update] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const status = (params.get('status') as ContactStatus) || '';
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [open, setOpen] = useState<string | null>(null);
  const allowed = roles.some((r) => r === 'owner' || r === 'admin' || r === 'editor' || r === 'reviewer');
  const r = useAsync(() => repo.admin.listContacts({ status, q, page, pageSize: 20 }), [status, q, page]);
  if (!allowed) return <Notice tone="warn" icon="lock">תיבת הפניות פתוחה לעורכים, בודקים ומנהלים. היא נפרדת מתיבת השאלות ההלכתיות.</Notice>;
  const setStatus = async (id: string, next: ContactStatus) => {
    try { await repo.admin.setContactStatus(id, next); toast('הפנייה עודכנה'); r.reload(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };
  return (
    <div>
      <h1>פניות לאתר</h1>
      <p className="soft">הודעות מטופס יצירת הקשר. אין כאן שאלות הלכתיות ואין כאן פרטי קשר של הרב — רק מה שגולשים שלחו.</p>
      <form className="admin-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="cq">חיפוש</label>
          <input id="cq" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="field">
          <SelectField label="מצב" value={status} onChange={(e) => update({ status: e.target.value || null, page: null })}>
            <option value="">הכול</option>
            {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </SelectField>
        </div>
      </form>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && !r.data && <Skeleton h={200} />}
      {r.data && r.data.items.length === 0 && <Notice>אין פניות תואמות.</Notice>}
      <div className="stack">
        {r.data?.items.map((m) => (
          <article key={m.id} className="panel">
            <div className="spread">
              <div>
                <strong>{m.subject}</strong>
                <div className="soft">{m.name || 'ללא שם'} · <span className="ltr">{m.email}</span> · {formatHebDate(m.createdAt)}</div>
              </div>
              <Badge tone={m.status === 'new' ? 'warn' : m.status === 'read' ? 'ok' : undefined}>{LABEL[m.status]}</Badge>
            </div>
            {open === m.id ? <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p> : <p className="muted">{m.body.slice(0, 160)}{m.body.length > 160 ? '…' : ''}</p>}
            <div className="row">
              <Button size="sm" variant="ghost" onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? 'הסתרה' : 'קריאה'}</Button>
              {m.status !== 'read' && <Button size="sm" variant="secondary" onClick={() => void setStatus(m.id, 'read')}>סומן כנקרא</Button>}
              {m.status !== 'new' && <Button size="sm" variant="secondary" onClick={() => void setStatus(m.id, 'new')}>החזרה לחדשות</Button>}
              {m.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => void setStatus(m.id, 'archived')}>לארכיון</Button>}
            </div>
          </article>
        ))}
      </div>
      {r.data && <Pagination page={page} total={r.data.total} pageSize={20} hrefFor={(p) => {
        const n = new URLSearchParams(params);
        n.set('page', String(p));
        return `/admin/contact?${n}`;
      }} />}
    </div>
  );
}
