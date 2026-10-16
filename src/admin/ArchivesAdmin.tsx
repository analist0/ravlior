import { useState } from 'react';
import { useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type ArchiveInput } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Button, EmptyState, ErrorState, Notice, Pagination, SelectField, Skeleton, TextArea, TextField } from '../components/ui.tsx';
import { ARCHIVE_VERIFICATIONS, ARCHIVE_VERIFICATION_LABEL, validateArchive } from '../shared/archives.ts';
import type { SourceArchive, Verification } from '../shared/types.ts';
import { canEdit } from '../shared/workflow.ts';
import { useAdmin } from './AdminApp.tsx';

const EMPTY: ArchiveInput = { name: '', material: '', url: '', verification: 'archive', note: null };

export default function ArchivesScreen() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const editable = canEdit(roles);
  const [params, update] = useSearchParams();
  const q = params.get('q') ?? '';
  const verification = params.get('verification') ?? '';
  const sort = params.get('sort') === 'verification' ? 'verification' : 'name';
  const page = Number(params.get('page') ?? 1) || 1;
  const [text, setText] = useState(q);
  const [draft, setDraft] = useState<ArchiveInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const r = useAsync(() => repo.admin.listArchivesAdmin({ q, verification, sort, page, pageSize: 25 }), [q, verification, sort, page]);

  const startNew = () => { setEditingId(null); setDraft(EMPTY); setErrors({}); setOpen(true); };
  const startEdit = (a: SourceArchive) => {
    setEditingId(a.id);
    setDraft({ name: a.name, material: a.material ?? '', url: a.url, verification: a.verification, note: a.note });
    setErrors({});
    setOpen(true);
  };
  const save = async () => {
    const next = { ...draft, name: draft.name.trim(), url: draft.url.trim(), material: draft.material.trim(), note: draft.note?.trim() || null };
    const v = validateArchive(next);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      if (editingId) {
        await repo.admin.updateArchive(editingId, next);
        toast('הארכיון נשמר');
      } else {
        await repo.admin.createArchive(next);
        toast('הארכיון נוסף');
      }
      setOpen(false);
      setDraft(EMPTY);
      setEditingId(null);
      r.reload();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a: SourceArchive) => {
    const ok = await confirm({
      title: 'מחיקת ארכיון',
      body: `„${a.name}” יימחק לצמיתות. לטבלה זו אין סל מחזור, ולא ניתן לשחזר את הרשומה.`,
      confirmLabel: 'מחיקה לצמיתות',
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.admin.deleteArchive(a.id);
      toast('הארכיון נמחק');
      if (editingId === a.id) setOpen(false);
      r.reload();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <div>
      <div className="spread">
        <h1>ארכיוני מקור</h1>
        {editable && <Button icon="plus" onClick={startNew}>ארכיון חדש</Button>}
      </div>
      <Notice>קטלוג המקורות שמהם נאסף האתר (ערוצים, אתרים, ארכיונים). זה אינו קובץ המדיה של שיעור — אותו עורכים בתוך הפריט או במסך המדיה. מחיקה כאן היא סופית.</Notice>
      <form className="admin-toolbar" role="search" style={{ marginTop: 'var(--s-4)' }} onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="arch-q">חיפוש</label>
          <input id="arch-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== q && update({ q: text, page: null })} />
        </div>
        <div className="field">
          <SelectField label="אימות" value={verification} onChange={(e) => update({ verification: e.target.value, page: null })}>
            <option value="">הכול</option>
            {ARCHIVE_VERIFICATIONS.map((v) => <option key={v} value={v}>{ARCHIVE_VERIFICATION_LABEL[v]}</option>)}
          </SelectField>
        </div>
        <div className="field">
          <SelectField label="מיון" value={sort} onChange={(e) => update({ sort: e.target.value === 'name' ? null : e.target.value, page: null })}>
            <option value="name">שם (א׳–ת׳)</option>
            <option value="verification">מצב אימות</option>
          </SelectField>
        </div>
      </form>

      {open && (
        <section className="panel" style={{ marginBottom: 'var(--s-4)' }} aria-labelledby="arch-form-title">
          <h2 id="arch-form-title">{editingId ? 'עריכת ארכיון' : 'ארכיון חדש'}</h2>
          <div className="form-grid two">
            <TextField label="שם" required value={draft.name} error={errors.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <TextField label="קישור" required dir="ltr" value={draft.url} error={errors.url} hint="https בלבד" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <SelectField label="מצב אימות" value={draft.verification} error={errors.verification} onChange={(e) => setDraft({ ...draft, verification: e.target.value as Verification })}>
              {ARCHIVE_VERIFICATIONS.map((v) => <option key={v} value={v}>{ARCHIVE_VERIFICATION_LABEL[v]}</option>)}
            </SelectField>
            <TextField label="מה יש שם" value={draft.material} error={errors.material} onChange={(e) => setDraft({ ...draft, material: e.target.value })} />
            <div className="full"><TextArea label="הערה" value={draft.note ?? ''} error={errors.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 'var(--s-3)' }}>
            <Button busy={busy} onClick={() => void save()}>{editingId ? 'שמירה' : 'הוספה'}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setErrors({}); }}>ביטול</Button>
          </div>
        </section>
      )}

      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && !r.data && <Skeleton h={240} />}
      {r.data && r.data.items.length === 0 && (
        <EmptyState title={q || verification ? 'אין תוצאות לחיפוש או לסינון' : 'אין ארכיונים'}>
          {(q || verification) && <Button variant="secondary" onClick={() => { setText(''); update({ q: null, verification: null, page: null }); }}>ניקוי סינון</Button>}
        </EmptyState>
      )}
      {!!r.data?.items.length && (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">ארכיוני מקור — {r.data.total} רשומות</caption>
            <thead>
              <tr>
                <th scope="col">שם</th>
                <th scope="col">אימות</th>
                <th scope="col">קישור</th>
                {editable && <th scope="col">פעולות</th>}
              </tr>
            </thead>
            <tbody>
              {r.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="title-cell">{a.name}</td>
                  <td>{ARCHIVE_VERIFICATION_LABEL[a.verification] ?? a.verification}</td>
                  <td className="ltr"><a href={a.url} target="_blank" rel="noopener noreferrer">{a.url}</a></td>
                  {editable && (
                    <td>
                      <div className="row">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(a)}>עריכה</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(a)}>מחיקה</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.data && <Pagination page={page} total={r.data.total} pageSize={25} hrefFor={(p) => {
        const n = new URLSearchParams(params);
        n.set('page', String(p));
        return `/admin/archives?${n}`;
      }} />}
    </div>
  );
}
