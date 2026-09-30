import { useState } from 'react';
import { Link, useRouter, useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type EntityName, type EntityRecord } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, EmptyState, ErrorState, Pagination, SelectField, Skeleton, TYPE_LABEL } from '../components/ui.tsx';
import { CONTENT_STATUS_LABEL, canEdit, contentTransitionAllowed, isAdmin } from '../shared/workflow.ts';
import { CONTENT_STATUSES, CONTENT_TYPES, type ContentStatus, type ContentType } from '../shared/types.ts';
import { ENTITIES } from './entities.ts';
import { useAdmin } from './AdminApp.tsx';

export function StatusBadge({ status }: { status: ContentStatus }) {
  const tone = status === 'published' ? 'ok' : status === 'in_review' ? 'gold' : status === 'approved' ? 'accent' : status === 'archived' ? undefined : 'warn';
  return <Badge tone={tone}>{CONTENT_STATUS_LABEL[status]}</Badge>;
}

export default function EntityList({ entity }: { entity: EntityName }) {
  const repo = useRepo();
  const cfg = ENTITIES[entity];
  const { roles } = useAdmin();
  const { navigate } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, update] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') as ContentStatus) || '';
  const type = (params.get('type') as ContentType) || '';
  const view = params.get('view') === 'trash' ? 'trash' : 'active';
  const page = Number(params.get('page') ?? 1) || 1;
  const [text, setText] = useState(q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const r = useAsync(() => repo.admin.list(entity, { q, status, type, view, page, pageSize: 25 }), [entity, q, status, type, view, page]);
  const items = r.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const bulk = async (action: 'publish' | 'review' | 'archive' | 'delete' | 'restore') => {
    const chosen = items.filter((i) => selected.has(i.id));
    const target: Record<string, ContentStatus> = { publish: 'published', review: 'in_review', archive: 'archived' };
    const eligible = action in target ? chosen.filter((i) => 'status' in i && contentTransitionAllowed(i.status as ContentStatus, target[action]!, roles)) : chosen;
    const skipped = chosen.length - eligible.length;
    const labels = { publish: 'פרסום', review: 'שליחה לבדיקה', archive: 'העברה לארכיון', delete: 'העברה לסל המחזור', restore: 'שחזור' };
    const ok = await confirm({
      title: `${labels[action]} של ${eligible.length} פריטים`,
      body: (
        <>
          <ul style={{ maxHeight: 200, overflow: 'auto' }}>{eligible.slice(0, 30).map((i) => <li key={i.id}>{cfg.titleOf(i)}</li>)}</ul>
          {eligible.length > 30 && <p>ועוד {eligible.length - 30}…</p>}
          {skipped > 0 && <p style={{ color: 'var(--danger)' }}>{skipped} פריטים ידולגו: המעבר אינו מותר מהסטטוס הנוכחי או לתפקיד שלך.</p>}
        </>
      ),
      confirmLabel: labels[action], danger: action === 'delete',
    });
    if (!ok || !eligible.length) return;
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const i of eligible) {
      try {
        if (action === 'delete') await repo.admin.softDelete(entity, i.id, i.version);
        else if (action === 'restore') await repo.admin.restore(entity, i.id, i.version);
        else await repo.admin.transition(entity, i.id, target[action]!, i.version);
        done++;
      } catch (e) {
        failures.push(`${cfg.titleOf(i)}: ${errorMessage(e)}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    r.reload();
    toast(failures.length ? `${done} עודכנו, ${failures.length} נכשלו` : `${done} פריטים עודכנו`, {
      tone: failures.length ? 'error' : 'info',
      action: failures.length ? { label: 'פרטים', run: () => void confirm({ title: 'פריטים שנכשלו', body: <ul>{failures.map((f) => <li key={f}>{f}</li>)}</ul> }) } : undefined,
    });
  };

  return (
    <div>
      <div className="spread">
        <h1>{cfg.label}{view === 'trash' && ' — סל מחזור'}</h1>
        {canEdit(roles) && view === 'active' && entity !== 'publicQuestions' && <Button icon="plus" onClick={() => navigate(`/admin/${cfg.route}/new`)}>{cfg.singular} חדש</Button>}
      </div>
      <form className="admin-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="aq">חיפוש (ניהול)</label>
          <input id="aq" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== q && update({ q: text, page: null })} />
        </div>
        {'status' in (items[0] ?? { status: '' }) && (
          <div className="field">
            <SelectField label="סטטוס" value={status} onChange={(e) => update({ status: e.target.value, page: null })}>
              <option value="">הכול</option>
              {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
            </SelectField>
          </div>
        )}
        {entity === 'content' && (
          <div className="field">
            <SelectField label="סוג" value={type} onChange={(e) => update({ type: e.target.value, page: null })}>
              <option value="">הכול</option>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </SelectField>
          </div>
        )}
        <div className="segmented" role="group" aria-label="תצוגה">
          <button type="button" aria-pressed={view === 'active'} onClick={() => update({ view: null, page: null })} style={{ padding: '0 12px' }}>פעילים</button>
          <button type="button" aria-pressed={view === 'trash'} onClick={() => update({ view: 'trash', page: null })} style={{ padding: '0 12px' }}>סל מחזור</button>
        </div>
      </form>

      {selected.size > 0 && (
        <div className="sticky-actions" role="region" aria-label="פעולות על פריטים שנבחרו" style={{ position: 'sticky', top: 56, bottom: 'auto', marginBottom: 'var(--s-3)' }}>
          <strong>{selected.size} נבחרו</strong>
          {view === 'active' ? (
            <>
              <Button size="sm" variant="secondary" busy={busy} onClick={() => void bulk('review')}>לבדיקה</Button>
              <Button size="sm" variant="secondary" busy={busy} onClick={() => void bulk('publish')}>פרסום</Button>
              {isAdmin(roles) && <Button size="sm" variant="secondary" busy={busy} onClick={() => void bulk('archive')}>לארכיון</Button>}
              {canEdit(roles) && <Button size="sm" variant="danger" busy={busy} onClick={() => void bulk('delete')}>לסל המחזור</Button>}
            </>
          ) : canEdit(roles) && <Button size="sm" variant="secondary" busy={busy} onClick={() => void bulk('restore')}>שחזור</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ביטול בחירה</Button>
        </div>
      )}

      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && !r.data && <Skeleton h={300} />}
      {r.data && items.length === 0 && <EmptyState title={view === 'trash' ? 'סל המחזור ריק' : 'אין רשומות'} />}
      {items.length > 0 && (
        <div className="table-wrap" aria-busy={r.loading}>
          <table className="data">
            <caption className="sr-only">{cfg.label} — {r.data?.total} רשומות</caption>
            <thead>
              <tr>
                <th scope="col"><input type="checkbox" aria-label="בחירת הכול" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))} /></th>
                <th scope="col">{entity === 'topics' || entity === 'institutions' ? 'שם' : 'כותרת'}</th>
                {entity === 'content' && <th scope="col">סוג</th>}
                <th scope="col">סטטוס</th>
                <th scope="col">גרסה</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i: EntityRecord) => (
                <tr key={i.id} aria-selected={selected.has(i.id)}>
                  <td><input type="checkbox" aria-label={`בחירה: ${cfg.titleOf(i)}`} checked={selected.has(i.id)} onChange={() => { const n = new Set(selected); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); setSelected(n); }} /></td>
                  <td className="title-cell"><Link to={`/admin/${cfg.route}/${i.id}`}>{cfg.titleOf(i) || '(ללא כותרת)'}</Link></td>
                  {entity === 'content' && 'type' in i && <td>{TYPE_LABEL[i.type as ContentType]}</td>}
                  <td>{'status' in i && <StatusBadge status={i.status as ContentStatus} />}</td>
                  <td className="kbd">v{i.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.data && (
        <Pagination page={page} total={r.data.total} pageSize={25} hrefFor={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); return `/admin/${cfg.route}?${n}`; }} />
      )}
    </div>
  );
}
