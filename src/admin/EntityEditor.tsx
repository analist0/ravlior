import { useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type EntityName, type EntityRecord } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { useConfirm } from '../components/Dialog.tsx';
import { Icon } from '../components/Icon.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Breadcrumbs, Button, Checkbox, ErrorState, Notice, SelectField, Skeleton, TextArea, TextField } from '../components/ui.tsx';
import { CONTENT_STATUS_LABEL, VersionConflictError, canEdit, isAdmin, nextContentStatuses } from '../shared/workflow.ts';
import { sanitizeBlocks } from '../shared/blocks.ts';
import type { Block, ContentItem, ContentStatus, Series } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';
import { ENTITIES, validateRecord, type FieldDef } from './entities.ts';
import { StatusBadge } from './EntityList.tsx';
import { BlockEditor, BookDetailsEditor, RevisionsPanel, SeriesItemsEditor, SourcesEditor, StatusHelp, TopicsPicker, UrlsField } from './Panels.tsx';

const WIDTHS: [number, string][] = [[360, 'טלפון'], [768, 'טאבלט'], [1200, 'מחשב']];

function RefSelect({ f, value, onChange }: { f: FieldDef; value: string | null; onChange: (v: string | null) => void }) {
  const repo = useRepo();
  const opts = useAsync(async () => (f.type === 'ref-institution' ? (await repo.listInstitutions()).map((i) => [i.id, i.name]) : (await repo.listTopics()).map((t) => [t.id, t.name])), [f.type]);
  return (
    <SelectField label={f.label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {opts.data?.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </SelectField>
  );
}

export default function EntityEditor({ entity, id }: { entity: EntityName; id: string | null }) {
  const repo = useRepo();
  const cfg = ENTITIES[entity];
  const { roles } = useAdmin();
  const { navigate } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const rec = useAsync(() => (id ? repo.admin.get(entity, id) : Promise.resolve(null)), [entity, id]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (id && rec.data) setDraft({ ...(rec.data as unknown as Record<string, unknown>) });
    if (!id) setDraft({ ...cfg.defaults });
    setDirty(false);
  }, [rec.data, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (k: string, v: unknown) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const current = rec.data as (EntityRecord & { status?: ContentStatus; deletedAt?: string | null; version: number }) | null | undefined;
  const readOnly = !canEdit(roles) && !roles.some((r) => r === 'reviewer' || r === 'rabbi');
  const blocksKey = cfg.fields.find((f) => f.type === 'blocks')?.key;
  const blockIssues = useMemo(() => (blocksKey ? sanitizeBlocks(draft[blocksKey] ?? []).issues : []), [draft, blocksKey]);

  const save = async () => {
    const v = validateRecord(entity, draft);
    setErrors(v);
    if (Object.keys(v).length || blockIssues.length) { setSaveError({ message: 'יש שדות שדורשים תיקון.', conflict: false }); return; }
    setBusy(true); setSaveError(null);
    try {
      if (!id) {
        const created = await repo.admin.create(entity, draft as Partial<EntityRecord>);
        toast(`${cfg.singular} נוצר כטיוטה`);
        setDirty(false);
        navigate(`/admin/${cfg.route}/${created.id}`, { replace: true });
      } else {
        await repo.admin.update(entity, id, draft as Partial<EntityRecord>, current!.version);
        toast('נשמר');
        setDirty(false);
        rec.reload();
      }
    } catch (e) {
      setSaveError({ message: errorMessage(e), conflict: e instanceof VersionConflictError });
    } finally {
      setBusy(false);
    }
  };

  const transition = async (to: ContentStatus) => {
    if (dirty && !(await confirm({ title: 'יש שינויים שלא נשמרו', body: 'שינוי הסטטוס לא ישמור את השינויים בטופס. להמשיך?', confirmLabel: 'המשך בלי לשמור' }))) return;
    setBusy(true); setSaveError(null);
    try {
      await repo.admin.transition(entity, id!, to, current!.version);
      toast(`הסטטוס עודכן: ${CONTENT_STATUS_LABEL[to]}`);
      rec.reload();
    } catch (e) {
      setSaveError({ message: errorMessage(e), conflict: e instanceof VersionConflictError });
    } finally { setBusy(false); }
  };

  const lifecycle = async (action: 'trash' | 'restore' | 'destroy' | 'duplicate') => {
    if (!current) return;
    if (action === 'destroy' && !(await confirm({ title: 'מחיקה קבועה', body: 'הרשומה תימחק לצמיתות, כולל מקורות ושיוכים. לא ניתן לבטל. קבצים באחסון יש למחוק בנפרד ממסך המדיה.', confirmLabel: 'מחיקה לצמיתות', danger: true }))) return;
    if (action === 'trash' && !(await confirm({ title: 'העברה לסל המחזור', body: 'הרשומה תוסתר מהאתר הציבורי ותישמר בסל המחזור עד מחיקה קבועה.', confirmLabel: 'העברה לסל', danger: true }))) return;
    setBusy(true);
    try {
      if (action === 'trash') { await repo.admin.softDelete(entity, current.id, current.version); toast('הועבר לסל המחזור', { action: { label: 'ביטול', run: () => void repo.admin.restore(entity, current.id, current.version + 1).then(rec.reload) } }); }
      if (action === 'restore') { await repo.admin.restore(entity, current.id, current.version); toast('שוחזר'); }
      if (action === 'destroy') { await repo.admin.destroy(entity, current.id); toast('נמחק לצמיתות'); navigate(`/admin/${cfg.route}`); return; }
      if (action === 'duplicate') {
        const { id: _i, slug: _s, version: _v, status: _st, deletedAt: _d, sources: _src, seriesIds: _si, publishedAt: _p, ...rest } = draft as Record<string, unknown>;
        void _i; void _s; void _v; void _st; void _d; void _src; void _si; void _p;
        const copy = await repo.admin.create(entity, { ...rest, title: rest.title ? `${String(rest.title)} (עותק)` : rest.title, name: rest.name ? `${String(rest.name)} (עותק)` : rest.name } as Partial<EntityRecord>);
        toast('נוצר עותק כטיוטה');
        navigate(`/admin/${cfg.route}/${copy.id}`);
        return;
      }
      rec.reload();
    } catch (e) { toast(errorMessage(e), { tone: 'error' }); } finally { setBusy(false); }
  };

  if (id && rec.loading) return <Skeleton h={400} />;
  if (rec.error) return <ErrorState error={rec.error} onRetry={rec.reload} />;
  if (id && !rec.data) return <ErrorState error="הרשומה לא נמצאה (ייתכן שנמחקה)." />;

  const publicPath = current ? cfg.publicPath?.(current) : null;
  const statuses = current?.status ? nextContentStatuses(current.status, roles) : [];
  const renderField = (f: FieldDef) => {
    const val = draft[f.key];
    const common = { key: f.key };
    switch (f.type) {
      case 'text': return <div className={f.full ? 'full' : ''} {...common}><TextField label={f.label} dir={f.dir} value={(val as string) ?? ''} required={f.required} hint={f.hint} error={errors[f.key]} readOnly={readOnly} onChange={(e) => set(f.key, e.target.value || (f.required ? '' : null))} /></div>;
      case 'textarea': return <div className="full" {...common}><TextArea label={f.label} value={(val as string) ?? ''} required={f.required} hint={f.hint} error={errors[f.key]} readOnly={readOnly} onChange={(e) => set(f.key, e.target.value || (f.required ? '' : null))} /></div>;
      case 'number': return <div {...common}><TextField label={f.label} type="number" inputMode="numeric" value={String(val ?? 0)} readOnly={readOnly} onChange={(e) => set(f.key, Number(e.target.value))} /></div>;
      case 'date': return <div {...common}><TextField label={f.label} type="date" dir="ltr" value={(val as string) ?? ''} hint={f.hint} readOnly={readOnly} onChange={(e) => set(f.key, e.target.value || null)} /></div>;
      case 'checkbox': return <div {...common}><Checkbox label={f.label} checked={!!val} disabled={readOnly} onChange={(e) => set(f.key, e.target.checked)} /></div>;
      case 'select': return <div {...common}><SelectField label={f.label} value={(val as string) ?? ''} hint={f.hint} error={errors[f.key]} disabled={readOnly} onChange={(e) => set(f.key, e.target.value)}>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></div>;
      case 'urls': return <div className="full" {...common}><UrlsField label={f.label} value={(val as string[]) ?? []} error={errors[f.key]} onChange={(v) => set(f.key, v)} /></div>;
      case 'ref-institution': case 'ref-topic': return <div {...common}><RefSelect f={f} value={(val as string) ?? null} onChange={(v) => set(f.key, v)} /></div>;
      case 'blocks': return (
        <div className="full" {...common}>
          <span className="field-label">{f.label}</span>
          <BlockEditor value={(val as Block[]) ?? []} onChange={(b) => set(f.key, b)} />
        </div>
      );
    }
  };
  const title = id ? cfg.titleOf(draft as unknown as EntityRecord) || '(ללא כותרת)' : `${cfg.singular} חדש`;
  const content = entity === 'content' ? (draft as unknown as ContentItem) : null;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'ניהול', to: '/admin' }, { label: cfg.label, to: `/admin/${cfg.route}` }, { label: title }]} />
      <div className="spread">
        <h1 style={{ marginBottom: 0 }}>{title}</h1>
        <div className="row">
          {current?.status && <StatusBadge status={current.status} />}
          {current && <Badge>v{current.version}</Badge>}
          {current?.deletedAt && <Badge tone="danger">בסל המחזור</Badge>}
          {dirty && <Badge tone="warn">שינויים לא שמורים</Badge>}
        </div>
      </div>
      {readOnly && <Notice icon="lock">צפייה בלבד — לתפקיד שלך אין הרשאת עריכה.</Notice>}
      <div className="editor-grid" style={{ marginTop: 'var(--s-4)' }}>
        <div className="stack">
          <form className="panel form-grid two" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={`עריכת ${cfg.singular}`}>
            {cfg.fields.map(renderField)}
          </form>
          {entity === 'content' && content && (
            <>
              <TopicsPicker value={content.topicIds ?? []} onChange={(v) => set('topicIds', v)} />
              {(content.type === 'book' || content.type === 'leaflet') && <BookDetailsEditor value={content.bookDetails} onChange={(v) => set('bookDetails', v)} />}
              {id && current && <SourcesEditor item={current as ContentItem} onSaved={rec.reload} />}
            </>
          )}
          {entity === 'series' && id && current && <SeriesItemsEditor seriesId={id} initial={(current as Series).items} />}
          {blocksKey && (
            <section className="panel" aria-labelledby="h-prev">
              <div className="spread">
                <h2 id="h-prev" style={{ margin: 0 }}>תצוגה מקדימה</h2>
                <div className="segmented" role="group" aria-label="רוחב תצוגה">
                  <button type="button" aria-pressed={preview === null} onClick={() => setPreview(null)} style={{ padding: '0 10px' }}>סגור</button>
                  {WIDTHS.map(([w, l]) => <button key={w} type="button" aria-pressed={preview === w} onClick={() => setPreview(w)} style={{ padding: '0 10px' }}>{l}</button>)}
                </div>
              </div>
              {preview && (
                <div className="preview-frame" style={{ width: `min(100%, ${preview}px)`, marginTop: 'var(--s-3)' }}>
                  <h1 style={{ fontSize: 'var(--step-3)' }}>{title}</h1>
                  <BlockRenderer blocks={(draft[blocksKey] as Block[]) ?? []} />
                </div>
              )}
            </section>
          )}
          <div className="sticky-actions">
            {!readOnly && <Button busy={busy} icon="check" onClick={() => void save()}>{id ? 'שמירה' : 'יצירה כטיוטה'}</Button>}
            {publicPath && current?.status === 'published' && <Link className="btn btn-secondary" to={publicPath}><Icon name="eye" /> צפייה באתר</Link>}
            {publicPath && current?.status !== 'published' && entity === 'content' && <Link className="btn btn-secondary" to={publicPath}><Icon name="eye" /> תצוגת צוות</Link>}
          </div>
          {saveError && (
            <div role="alert">
              <Notice tone="warn" icon="alert">
                {saveError.message}
                <div className="row" style={{ marginTop: 'var(--s-2)' }}>
                  {saveError.conflict ? (
                    <Button size="sm" variant="secondary" onClick={() => { rec.reload(); setSaveError(null); }}>טעינת הגרסה העדכנית (השינויים שלך יוחלפו)</Button>
                  ) : <Button size="sm" variant="secondary" onClick={() => void save()}>לנסות שוב</Button>}
                </div>
              </Notice>
            </div>
          )}
        </div>
        <aside className="stack" aria-label="פעולות">
          {current?.status && !current.deletedAt && (
            <section className="panel" aria-labelledby="h-wf">
              <h2 id="h-wf">תהליך עבודה</h2>
              <p>סטטוס נוכחי: <StatusBadge status={current.status} /></p>
              {statuses.length ? (
                <div className="stack">
                  {statuses.map((s) => (
                    <Button key={s} variant={s === 'published' ? 'primary' : 'secondary'} busy={busy} onClick={() => void transition(s)} style={{ width: '100%' }}>
                      {s === 'draft' && current.status === 'published' ? 'ביטול פרסום (לטיוטה)' : `העברה ל„${CONTENT_STATUS_LABEL[s]}”`}
                    </Button>
                  ))}
                </div>
              ) : <p className="soft">אין מעברים זמינים לתפקיד שלך מסטטוס זה.</p>}
              {entity === 'publicQuestions' && !(current as { approvedByRabbi?: boolean }).approvedByRabbi && <Notice tone="warn">פרסום יתאפשר רק לאחר אישור הרב.</Notice>}
              <div style={{ marginTop: 'var(--s-3)' }}><StatusHelp /></div>
            </section>
          )}
          {current && (
            <section className="panel" aria-labelledby="h-life">
              <h2 id="h-life">ניהול רשומה</h2>
              <div className="stack">
                {canEdit(roles) && !current.deletedAt && entity !== 'publicQuestions' && <Button variant="secondary" icon="copy" busy={busy} onClick={() => void lifecycle('duplicate')} style={{ width: '100%' }}>שכפול כטיוטה</Button>}
                {canEdit(roles) && !current.deletedAt && <Button variant="secondary" icon="trash" busy={busy} onClick={() => void lifecycle('trash')} style={{ width: '100%' }}>העברה לסל המחזור</Button>}
                {canEdit(roles) && current.deletedAt && <Button variant="secondary" icon="restore" busy={busy} onClick={() => void lifecycle('restore')} style={{ width: '100%' }}>שחזור</Button>}
                {isAdmin(roles) && current.deletedAt && <Button variant="danger" icon="trash" busy={busy} onClick={() => void lifecycle('destroy')} style={{ width: '100%' }}>מחיקה קבועה</Button>}
              </div>
            </section>
          )}
          {id && <RevisionsPanel entity={entity} id={id} onRestore={(snap) => { const { version: _v, status: _s, ...rest } = snap; void _v; void _s; setDraft((d) => ({ ...d, ...rest })); setDirty(true); }} />}
          {content?.provenance && content.provenance.length > 0 && (
            <section className="panel">
              <h2>מקור הרשומה</h2>
              <ul style={{ paddingInlineStart: 'var(--s-5)', fontSize: 'var(--step--1)' }}>
                {content.provenance.map((p, i) => <li key={i}>סעיף {p.section}{p.row ? `, שורה ${p.row}` : ''}{p.note ? ` — ${p.note}` : ''}</li>)}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
