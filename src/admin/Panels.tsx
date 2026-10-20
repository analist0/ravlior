import { useState } from 'react';
import { useDragReorder } from './reorder.tsx';
import { errorMessage, useAsync, useRepo, type EntityName } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Badge, Button, Checkbox, IconButton, Notice, SelectField, TextArea, TextField, TYPE_LABEL, formatHebDate, splitTitle } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { useConfirm } from '../components/Dialog.tsx';
import { BLOCK_LABEL, BLOCK_TYPES, emptyBlock, sanitizeBlocks } from '../shared/blocks.ts';
import { canonicalizeUrl, detectProvider, youtubeId } from '../shared/media.ts';
import { blocksToWriting, bookOffers, revisionDiff, writingToBlocks } from '../shared/sections.ts';
import type { Block, BookDetails, ContentItem, MediaSource } from '../shared/types.ts';

function MediaPicker({ onPick }: { onPick: (src: string) => void }) {
  const repo = useRepo();
  const [open, setOpen] = useState(false);
  const r = useAsync(() => (open ? repo.admin.listMedia({ pageSize: 40 }) : Promise.resolve(null)), [open]);
  const images = (r.data?.items ?? []).filter((m) => /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(m.url) || m.kind === 'image');
  return (
    <div className="full">
      <Button size="sm" variant="secondary" icon="eye" onClick={() => setOpen((v) => !v)}>{open ? 'סגירת מאגר המדיה' : 'בחירה מהמאגר'}</Button>
      {open && (
        <ul className="reorder-list" style={{ marginTop: 6 }}>
          {images.length === 0 && <li className="soft">אין תמונות במאגר. אפשר להדביק קישור https.</li>}
          {images.slice(0, 12).map((m) => (
            <li key={m.id}>
              <span className="grow ltr" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.url}</span>
              <Button size="sm" variant="secondary" onClick={() => { onPick(m.url); setOpen(false); }}>בחירה</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

/** Accessible reorder controls (buttons, not drag-only). */
function ReorderButtons({ i, n, onMove, label }: { i: number; n: number; onMove: (to: number) => void; label: string }) {
  return (
    <span className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
      <IconButton icon="up" label={`העלאה: ${label}`} disabled={i === 0} onClick={() => onMove(i - 1)} />
      <IconButton icon="down" label={`הורדה: ${label}`} disabled={i === n - 1} onClick={() => onMove(i + 1)} />
    </span>
  );
}

function ContentPicker({ onPick, exclude = [] }: { onPick: (c: ContentItem) => void; exclude?: string[] }) {
  const repo = useRepo();
  const [q, setQ] = useState('');
  const r = useAsync(() => (q.trim().length > 1 ? repo.admin.list('content', { q, pageSize: 8 }) : Promise.resolve(null)), [q]);
  return (
    <div className="field">
      <label>חיפוש פריט להוספה</label>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="הקלידו לפחות שתי אותיות" />
      {r.data && (
        <ul className="reorder-list" style={{ marginTop: 6 }}>
          {(r.data.items as ContentItem[]).filter((c) => !exclude.includes(c.id)).map((c) => (
            <li key={c.id}>
              <Badge>{TYPE_LABEL[c.type]}</Badge><span className="grow">{splitTitle(c.title)[0]}</span>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => { onPick(c); setQ(''); }}>הוספה</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BlockEditor({ value, onChange }: { value: Block[]; onChange: (b: Block[]) => void }) {
  const [adding, setAdding] = useState<Block['type']>('paragraph');
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const drag = useDragReorder(value.length, (from, to) => onChange(move(value, from, to)));
  const { issues } = sanitizeBlocks(value);
  const set = (i: number, b: Block) => onChange(value.map((x, j) => (j === i ? b : x)));
  return (
    <div className="stack">
      <div className="spread">
        <p className="soft" style={{ margin: 0 }}>עברית מימין לשמאל. מצב כתיבה מאחד כותרות ופסקאות לטיוטה אחת. ציטוטים ומדיה נשארים בלוקים.</p>
        {!writing
          ? <Button size="sm" variant="secondary" onClick={() => { setDraft(blocksToWriting(value).text); setWriting(true); }}>מצב כתיבה</Button>
          : <Button size="sm" onClick={() => { onChange(writingToBlocks(draft, blocksToWriting(value).rest)); setWriting(false); }}>חזרה לבלוקים</Button>}
      </div>
      {writing && (
        <TextArea label="טיוטה בעברית" dir="rtl" lang="he" className="textarea write-box" value={draft} onChange={(e) => setDraft(e.target.value)}
          hint="שורה ריקה מפרידה פסקאות. ## כותרת, ### כותרת משנה. אין HTML." />
      )}
      {value.length === 0 && !writing && <p className="soft">אין בלוקים עדיין.</p>}
      {!writing && value.map((b, i) => {
        const issue = issues.find((x) => x.index === i);
        return (
          <div key={i} className="block-item" aria-label={`בלוק ${i + 1}: ${BLOCK_LABEL[b.type]}`} role="group" {...drag.bind(i)}>
            <header>
              <strong>{i + 1}. {BLOCK_LABEL[b.type]}</strong>
              <span className="row" style={{ gap: 0 }}>
                <ReorderButtons i={i} n={value.length} label={BLOCK_LABEL[b.type]} onMove={(to) => onChange(move(value, i, to))} />
                <IconButton icon="trash" label={`מחיקת בלוק ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} />
              </span>
            </header>
            {b.type === 'heading' && (
              <div className="form-grid two">
                <TextField label="טקסט" value={b.text} onChange={(e) => set(i, { ...b, text: e.target.value })} />
                <SelectField label="רמה" value={b.level} onChange={(e) => set(i, { ...b, level: Number(e.target.value) === 3 ? 3 : 2 })}><option value={2}>כותרת ראשית</option><option value={3}>כותרת משנה</option></SelectField>
              </div>
            )}
            {b.type === 'paragraph' && <TextArea label="טקסט" value={b.text} onChange={(e) => set(i, { ...b, text: e.target.value })} hint="שורה ריקה = פסקה חדשה. HTML אינו מתפרש." />}
            {b.type === 'quote' && (
              <div className="form-grid">
                <TextArea label="ציטוט" value={b.text} onChange={(e) => set(i, { ...b, text: e.target.value })} />
                <TextField label="מקור (חובה)" value={b.source} onChange={(e) => set(i, { ...b, source: e.target.value })} hint="למשל: שם המקור — https://…" />
              </div>
            )}
            {b.type === 'image' && (
              <div className="form-grid two">
                <TextField label="כתובת תמונה (https או קובץ שהועלה)" dir="ltr" value={b.src} onChange={(e) => set(i, { ...b, src: e.target.value })} />
                <TextField label="טקסט חלופי (חובה)" value={b.alt} onChange={(e) => set(i, { ...b, alt: e.target.value })} />
                <TextField label="קרדיט צילום" value={b.credit ?? ''} onChange={(e) => set(i, { ...b, credit: e.target.value })} hint="רק לתמונה שיש אישור לפרסמה" />
                <MediaPicker onPick={(src) => set(i, { ...b, src })} />
              </div>
            )}
            {b.type === 'pdf' && (
              <div className="form-grid two">
                <TextField label="קישור PDF" dir="ltr" value={b.src} onChange={(e) => set(i, { ...b, src: e.target.value })} />
                <TextField label="שם הקובץ לתצוגה" value={b.title} onChange={(e) => set(i, { ...b, title: e.target.value })} />
              </div>
            )}
            {b.type === 'cta' && (
              <div className="form-grid two">
                <TextField label="תווית" value={b.label} onChange={(e) => set(i, { ...b, label: e.target.value })} />
                <TextField label="קישור (/נתיב פנימי או https)" dir="ltr" value={b.href} onChange={(e) => set(i, { ...b, href: e.target.value })} />
              </div>
            )}
            {b.type === 'media' && (
              <>
                {b.contentId && <p className="soft">פריט נבחר: <span className="kbd">{b.contentId}</span></p>}
                <ContentPicker onPick={(c) => set(i, { type: 'media', contentId: c.id })} />
              </>
            )}
            {b.type === 'related' && (
              <>
                <p className="soft">{b.contentIds.length} פריטים נבחרו</p>
                <ContentPicker exclude={b.contentIds} onPick={(c) => set(i, { ...b, contentIds: [...b.contentIds, c.id] })} />
                {b.contentIds.length > 0 && <Button size="sm" variant="ghost" onClick={() => set(i, { ...b, contentIds: [] })}>ניקוי הבחירה</Button>}
              </>
            )}
            {issue && <span className="error" style={{ color: 'var(--danger)', fontSize: 'var(--step--1)' }} role="alert">{issue.message}</span>}
          </div>
        );
      })}
      <div className="row">
        <select className="select" style={{ width: 'auto' }} value={adding} onChange={(e) => setAdding(e.target.value as Block['type'])} aria-label="סוג בלוק להוספה">
          {BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_LABEL[t]}</option>)}
        </select>
        <Button variant="secondary" icon="plus" onClick={() => onChange([...value, emptyBlock(adding)])}>הוספת בלוק</Button>
      </div>
    </div>
  );
}

export function SourcesEditor({ item, onSaved }: { item: ContentItem; onSaved: () => void }) {
  const repo = useRepo();
  const toast = useToast();
  const [sources, setSources] = useState<MediaSource[]>(item.sources);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    setError(null);
    let u: URL;
    try { u = new URL(url.trim()); } catch { setError('קישור לא תקין'); return; }
    if (u.protocol !== 'https:') { setError('רק קישורי https'); return; }
    const canon = canonicalizeUrl(u.toString());
    if (sources.some((s) => s.canonicalUrl === canon)) { setError('המקור כבר קיים בפריט'); return; }
    const yt = youtubeId(u.toString());
    const provider = detectProvider(u.toString());
    setSources([...sources, {
      id: crypto.randomUUID(), contentId: item.id, provider, providerId: yt, url: u.toString(), canonicalUrl: canon,
      deliveryMode: yt ? 'embed' : 'link', kind: provider === 'pdf' ? 'pdf' : yt ? 'media' : 'source_page', mime: provider === 'pdf' ? 'application/pdf' : null,
      filesize: null, durationSeconds: null, checksum: null, rightsStatus: yt ? 'embed_only' : 'unverified', rightsEvidence: null,
      embedStatus: 'unchecked', lastCheckedAt: null, error: null, isPrimary: !sources.some((s) => s.isPrimary), storageBucket: null, storagePath: null,
    }]);
    setUrl('');
  };
  const patch = (i: number, p: Partial<MediaSource>) => setSources(sources.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const save = async () => {
    setBusy(true); setError(null);
    try { await repo.admin.saveSources(item.id, sources); toast('המקורות נשמרו'); onSaved(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <section className="panel" aria-labelledby="h-src">
      <h2 id="h-src">מקורות מדיה</h2>
      <p className="soft">סדר עדיפות בנגן: הטמעה רשמית → קישור ישיר מורשה → קובץ שלנו → קישור למקור.</p>
      <ul className="reorder-list">
        {sources.map((s, i) => (
          <li key={s.id} style={{ display: 'grid', gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <Badge tone="accent">{s.provider}</Badge>{s.providerId && <span className="kbd">{s.providerId}</span>}
              {s.isPrimary && <Badge tone="gold">ראשי</Badge>}
              <span className="grow" />
              <IconButton icon="trash" label="הסרת מקור" onClick={() => setSources(sources.filter((_, j) => j !== i))} />
            </div>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="kbd" style={{ overflowWrap: 'anywhere' }}>{decodeURI(s.url)}</a>
            <div className="form-grid two">
              <SelectField label="סוג" value={s.kind} onChange={(e) => patch(i, { kind: e.target.value as MediaSource['kind'] })}>
                <option value="media">מדיה</option><option value="source_page">דף מקור</option><option value="pdf">PDF</option><option value="archive">ארכיון</option>
              </SelectField>
              <SelectField label="אספקה" value={s.deliveryMode} onChange={(e) => patch(i, { deliveryMode: e.target.value as MediaSource['deliveryMode'] })}>
                <option value="embed">הטמעה רשמית</option><option value="direct">קובץ ישיר מורשה</option><option value="storage">קובץ באחסון שלנו</option><option value="link">קישור בלבד</option>
              </SelectField>
              <SelectField label="זכויות" value={s.rightsStatus} onChange={(e) => patch(i, { rightsStatus: e.target.value as MediaSource['rightsStatus'] })}>
                <option value="unverified">לא אומת</option><option value="embed_only">הטמעה בלבד</option><option value="licensed">בהרשאה</option><option value="owned">בבעלות</option><option value="blocked">חסום</option>
              </SelectField>
              <TextField label="MIME (לקובץ ישיר)" dir="ltr" value={s.mime ?? ''} onChange={(e) => patch(i, { mime: e.target.value || null })} placeholder="audio/mpeg" />
              <TextField label="ראיה לזכויות" value={s.rightsEvidence ?? ''} onChange={(e) => patch(i, { rightsEvidence: e.target.value || null })} />
              <Checkbox label="מקור ראשי" checked={s.isPrimary} onChange={(e) => setSources(sources.map((x, j) => ({ ...x, isPrimary: j === i ? e.target.checked : e.target.checked ? false : x.isPrimary })))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 'var(--s-3)', alignItems: 'end' }}>
        <div className="grow"><TextField label="הוספת קישור מקור" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></div>
        <Button variant="secondary" icon="plus" onClick={add}>הוספה</Button>
      </div>
      {error && <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <Button busy={busy} onClick={() => void save()} style={{ marginTop: 'var(--s-3)' }}>שמירת המקורות</Button>
    </section>
  );
}

export function TopicsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const repo = useRepo();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  return (
    <fieldset className="panel" style={{ margin: 0 }}>
      <legend className="field-label">נושאים</legend>
      <div className="row" style={{ gap: 6 }}>
        {topics.data?.map((t) => (
          <button type="button" key={t.id} className="chip" aria-pressed={value.includes(t.id)} onClick={() => onChange(value.includes(t.id) ? value.filter((x) => x !== t.id) : [...value, t.id])}>{t.name}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function BookDetailsEditor({ value, onChange }: { value: BookDetails | null; onChange: (v: BookDetails) => void }) {
  const v: BookDetails = value ?? { authorText: null, editorText: null, publisher: null, authoredByRabbi: false, coverPath: null, pdfAccess: 'none', locatedStatus: '' };
  const set = (p: Partial<BookDetails>) => onChange({ ...v, ...p });
  const offers = bookOffers(v);
  const tocText = (v.toc ?? []).map((t) => t.title).join('\n');
  return (
    <section className="panel" aria-labelledby="h-book">
      <h2 id="h-book">פרטי ספר / עלון</h2>
      <div className="form-grid two">
        <TextField label="מחבר / תוכן" value={v.authorText ?? ''} onChange={(e) => set({ authorText: e.target.value || null })} />
        <TextField label="עורך" value={v.editorText ?? ''} onChange={(e) => set({ editorText: e.target.value || null })} />
        <TextField label="הוצאה" value={v.publisher ?? ''} onChange={(e) => set({ publisher: e.target.value || null })} />
        <SelectField label="גישה לקובץ" value={v.pdfAccess} onChange={(e) => set({ pdfAccess: e.target.value as BookDetails['pdfAccess'] })}>
          <option value="none">אין קובץ</option><option value="public">ציבורי (יש הרשאה)</option><option value="restricted">בהרשאה בלבד</option>
        </SelectField>
        <TextField label="נתיב עטיפה (רק עטיפה אמיתית)" dir="ltr" value={v.coverPath ?? ''} onChange={(e) => set({ coverPath: e.target.value || null })} />
        <Checkbox label="הרב הוא המחבר" checked={v.authoredByRabbi} onChange={(e) => set({ authoredByRabbi: e.target.checked })} />
        <TextField label="קישור רכישה" dir="ltr" value={v.purchaseUrl ?? ''} hint="רק https אמיתי. ריק = הכפתור לא יוצג." onChange={(e) => set({ purchaseUrl: e.target.value || null })} />
        <TextField label="קישור תרומה" dir="ltr" value={v.donationUrl ?? ''} hint="רק https אמיתי. ריק = הכפתור לא יוצג." onChange={(e) => set({ donationUrl: e.target.value || null })} />
      </div>
      {(v.purchaseUrl && !offers.purchase) || (v.donationUrl && !offers.donation) ? <p className="error" role="alert">קישור רכישה או תרומה חייב להתחיל ב-https://</p> : null}
      <TextArea label="תוכן עניינים (שורה לפרק)" value={tocText} onChange={(e) => set({ toc: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).map((title) => ({ title })) })} hint="רק כותרות אמיתיות. ריק = אין תוכן עניינים באתר." />
      <TextArea label="מצב איתור" value={v.locatedStatus} onChange={(e) => set({ locatedStatus: e.target.value })} hint="למשל: אותר דיווח בלבד; לא אותר PDF" />
      <h3 style={{ fontSize: 'var(--step-0)' }}>קטע לקריאה לדוגמה</h3>
      <p className="soft">מוצג רק אם יש כאן בלוקים. אין למלא ציטוט שלא אושר.</p>
      <BlockEditor value={v.sample ?? []} onChange={(sample) => set({ sample })} />
    </section>
  );
}

export function SeriesItemsEditor({ seriesId, initial }: { seriesId: string; initial: string[] }) {
  const repo = useRepo();
  const toast = useToast();
  const [ids, setIds] = useState(initial);
  const [busy, setBusy] = useState(false);
  const items = useAsync(async () => {
    const out: ContentItem[] = [];
    for (const id of ids) {
      const c = (await repo.admin.get('content', id)) as ContentItem | null;
      if (c) out.push(c);
    }
    return out;
  }, [ids.join(',')]);
  const titleOf = (id: string) => splitTitle(items.data?.find((c) => c.id === id)?.title ?? '…')[0];
  const drag = useDragReorder(ids.length, (from, to) => setIds(move(ids, from, to)));
  const save = async () => {
    setBusy(true);
    try { await repo.admin.setSeriesItems(seriesId, ids); toast('סדר הפרקים נשמר'); } catch (e) { toast(errorMessage(e), { tone: 'error' }); } finally { setBusy(false); }
  };
  return (
    <section className="panel" aria-labelledby="h-si">
      <h2 id="h-si">פרקים בסדרה ({ids.length})</h2>
      <ol className="reorder-list">
        {ids.map((id, i) => (
          <li key={id} {...drag.bind(i)}>
            <span className="kbd">{i + 1}</span>
            <span className="grow">{titleOf(id)}</span>
            <ReorderButtons i={i} n={ids.length} label={titleOf(id)} onMove={(to) => setIds(move(ids, i, to))} />
            <IconButton icon="close" label={`הסרה מהסדרה: ${titleOf(id)}`} onClick={() => setIds(ids.filter((x) => x !== id))} />
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 'var(--s-3)' }}><ContentPicker exclude={ids} onPick={(c) => setIds([...ids, c.id])} /></div>
      <Button busy={busy} onClick={() => void save()} style={{ marginTop: 'var(--s-3)' }}>שמירת סדר הפרקים</Button>
    </section>
  );
}

export function RevisionsPanel({ entity, id, current, onRestore }: { entity: EntityName; id: string; current?: Record<string, unknown>; onRestore: (snapshot: Record<string, unknown>) => void }) {
  const repo = useRepo();
  const confirm = useConfirm();
  const [diffOf, setDiffOf] = useState<string | null>(null);
  const r = useAsync(() => repo.admin.revisions(entity, id), [entity, id]);
  const list = r.data?.slice(0, 15) ?? [];
  return (
    <section className="panel" aria-labelledby="h-rev">
      <h2 id="h-rev"><Icon name="history" /> היסטוריית גרסאות</h2>
      {list.length === 0 && <p className="soft">אין גרסאות קודמות.</p>}
      <ul className="reorder-list">
        {list.map((v, i) => {
          const newer = i === 0 ? current : list[i - 1]?.snapshot;
          const rows = newer ? revisionDiff(v.snapshot, newer) : [];
          const key = `${v.version}-${v.createdAt}`;
          return (
            <li key={key} style={{ flexWrap: 'wrap' }}>
              <span className="kbd">v{v.version}</span>
              <span className="grow soft">{formatHebDate(v.createdAt)} · {v.createdBy ?? 'מערכת'}</span>
              <Button size="sm" variant="ghost" onClick={() => setDiffOf(diffOf === key ? null : key)}>השוואה</Button>
              <Button size="sm" variant="ghost" onClick={() => void confirm({ title: `טעינת גרסה ${v.version} לטופס`, body: 'השדות בטופס יוחלפו בערכי הגרסה הקודמת. השינוי יישמר רק לאחר לחיצה על „שמירה”.', confirmLabel: 'טעינה לטופס' }).then((ok) => ok && onRestore(v.snapshot))}>שחזור לטופס</Button>
              {diffOf === key && (
                <div className="table-wrap" style={{ flexBasis: '100%' }}>
                  {rows.length === 0 ? <p className="soft">אין הבדל בשדות שנשמרו.</p> : (
                    <table className="data diff-table">
                      <caption className="sr-only">הבדלים מול הגרסה הבאה</caption>
                      <thead><tr><th>שדה</th><th>בגרסה זו</th><th>אחר כך</th></tr></thead>
                      <tbody>
                        {rows.slice(0, 12).map((row) => (
                          <tr key={row.key}><th scope="row">{row.key}</th><td className="diff-before">{row.before || '—'}</td><td className="diff-after">{row.after || '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function UrlsField({ label, value, onChange, error }: { label: string; value: string[]; onChange: (v: string[]) => void; error?: string }) {
  return (
    <TextArea label={label} dir="ltr" value={value.join('\n')} error={error} onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} style={{ minHeight: 90 }} />
  );
}

export function StatusHelp() {
  return <Notice>תהליך: טיוטה → בבדיקה → מאושר → פורסם → ארכיון. עורך שולח לבדיקה; בודק/הרב/מנהל מאשרים ומפרסמים. המסד אוכף את המעברים.</Notice>;
}
