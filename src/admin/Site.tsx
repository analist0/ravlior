import { useEffect, useState } from 'react';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, Checkbox, ErrorState, IconButton, Notice, Skeleton, TextField } from '../components/ui.tsx';
import { MODULES, validateToggle } from '../modules/manifest.ts';
import type { HomeSection, Menu, MenuItem, ModuleState } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';
import { isAdmin } from '../shared/workflow.ts';
import { useDragReorder } from './reorder.tsx';

const HOME_LABEL: Record<HomeSection['kind'], string> = {
  actions: 'ארבע פעולות ראשיות', continue: 'המשך האזנה (מקומי למשתמש)', featured: 'שיעור נבחר', latest: 'חדשים', topics: 'נושאים', series: 'סדרות', books: 'ספרים', answers: 'תשובות אחרונות',
};

function MenuBlock({ menu, onChange, onSave }: { menu: Menu; onChange: (items: MenuItem[]) => void; onSave: () => void }) {
  const drag = useDragReorder(menu.items.length, (from, to) => {
    const n = [...menu.items];
    const [row] = n.splice(from, 1);
    n.splice(to, 0, row!);
    onChange(n);
  });
  return (
    <section className="panel" style={{ marginBottom: 'var(--s-4)' }}>
      <h2>{menu.location === 'header' ? 'תפריט עליון' : 'תפריט תחתון'}</h2>
      <p className="soft">גררו לשינוי סדר, או השתמשו בחצים.</p>
      <ol className="reorder-list">
        {menu.items.map((it, i) => (
          <li key={i} style={{ flexWrap: 'wrap' }} {...drag.bind(i)}>
            <div style={{ flex: '1 1 140px' }}><TextField label="תווית" value={it.label} onChange={(e) => onChange(menu.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></div>
            <div style={{ flex: '1 1 160px' }}><TextField label="קישור" dir="ltr" value={it.href} onChange={(e) => onChange(menu.items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} /></div>
            <IconButton icon="up" label={`העלאה: ${it.label}`} disabled={i === 0} onClick={() => { const n = [...menu.items]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; onChange(n); }} />
            <IconButton icon="down" label={`הורדה: ${it.label}`} disabled={i === menu.items.length - 1} onClick={() => { const n = [...menu.items]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; onChange(n); }} />
            <IconButton icon="trash" label={`מחיקה: ${it.label}`} onClick={() => onChange(menu.items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ol>
      <div className="row" style={{ marginTop: 'var(--s-3)' }}>
        <Button variant="secondary" icon="plus" onClick={() => onChange([...menu.items, { label: '', href: '/' }])}>פריט חדש</Button>
        <Button onClick={onSave}>שמירה</Button>
      </div>
    </section>
  );
}

export function MenusEditor() {
  const repo = useRepo();
  const toast = useToast();
  const r = useAsync(() => repo.getMenus(), [repo]);
  const [menus, setMenus] = useState<Menu[]>([]);
  useEffect(() => { if (r.data) setMenus(r.data); }, [r.data]);
  const save = async (m: Menu) => {
    const bad = m.items.find((i) => !i.label.trim() || !/^(\/|https:\/\/)/.test(i.href));
    if (bad) { toast('לכל פריט נדרשים תווית וקישור שמתחיל ב-/ או https://', { tone: 'error' }); return; }
    try { await repo.admin.saveMenu(m); toast('התפריט נשמר'); r.reload(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };
  if (r.loading) return <Skeleton h={200} />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  return (
    <div>
      <h1>תפריטים</h1>
      {menus.map((m) => (
        <MenuBlock key={m.id} menu={m} onChange={(items) => setMenus(menus.map((x) => (x.id === m.id ? { ...x, items } : x)))} onSave={() => void save(m)} />
      ))}
    </div>
  );
}

export function HomeEditor() {
  const repo = useRepo();
  const toast = useToast();
  const r = useAsync(() => repo.getHomeSections(), [repo]);
  const [s, setS] = useState<HomeSection[]>([]);
  useEffect(() => { if (r.data) setS(r.data); }, [r.data]);
  const drag = useDragReorder(s.length, (from, to) => {
    const n = [...s];
    const [row] = n.splice(from, 1);
    n.splice(to, 0, row!);
    setS(n);
  });
  const save = async () => {
    try { setS(await repo.admin.saveHomeSections(s)); toast('דף הבית נשמר. השינוי מוצג באתר מיד (רענון).'); } catch (e) { toast(errorMessage(e), { tone: 'error' }); r.reload(); }
  };
  if (r.loading) return <Skeleton h={200} />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  return (
    <div>
      <h1>בניית דף הבית</h1>
      <p className="muted">בחרו אילו מקטעים יוצגו ובאיזה סדר. השינוי נקרא מהמסד בכל טעינה — ללא בנייה מחדש.</p>
      <ol className="reorder-list">
        {s.map((x, i) => (
          <li key={x.id} style={{ flexWrap: 'wrap' }} {...drag.bind(i)}>
            <Checkbox label="" aria-label={`הצגת ${HOME_LABEL[x.kind]}`} checked={x.enabled} onChange={(e) => setS(s.map((y) => (y.id === x.id ? { ...y, enabled: e.target.checked } : y)))} />
            <Badge>{HOME_LABEL[x.kind]}</Badge>
            <div style={{ flex: '1 1 160px' }}><TextField label="כותרת המקטע" value={x.title} onChange={(e) => setS(s.map((y) => (y.id === x.id ? { ...y, title: e.target.value } : y)))} /></div>
            {(x.kind === 'latest' || x.kind === 'books' || x.kind === 'answers') && (
              <div style={{ width: 110 }}><TextField label="כמות" type="number" value={String(x.config.limit ?? 8)} onChange={(e) => setS(s.map((y) => (y.id === x.id ? { ...y, config: { ...y.config, limit: Math.max(1, Math.min(24, Number(e.target.value) || 8)) } } : y)))} /></div>
            )}
            <IconButton icon="up" label={`העלאה: ${x.title}`} disabled={i === 0} onClick={() => { const n = [...s]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setS(n); }} />
            <IconButton icon="down" label={`הורדה: ${x.title}`} disabled={i === s.length - 1} onClick={() => { const n = [...s]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; setS(n); }} />
          </li>
        ))}
      </ol>
      <p className="soft">„שיעור נבחר”: מוצג הפריט הראשון המסומן „להציג כשיעור נבחר” בעריכת התוכן.</p>
      <Button onClick={() => void save()} style={{ marginTop: 'var(--s-3)' }}>שמירה</Button>
    </div>
  );
}

export function ModulesScreen() {
  const repo = useRepo();
  const { roles, reloadModules } = useAdmin();
  const toast = useToast();
  const r = useAsync(() => repo.getModules(), [repo]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!isAdmin(roles)) return <Notice tone="warn" icon="lock">ניהול מודולים למנהלים בלבד.</Notice>;
  if (r.loading) return <Skeleton h={200} />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  const state: Record<string, boolean> = Object.fromEntries((r.data ?? []).map((m) => [m.id, m.enabled]));
  const settingsOf = (id: string): ModuleState['settings'] => r.data?.find((m) => m.id === id)?.settings ?? {};
  const toggle = async (id: string, enabled: boolean) => {
    const err = validateToggle(id, enabled, state);
    if (err) { toast(err, { tone: 'error' }); return; }
    setBusy(id);
    try { await repo.admin.setModule(id, enabled, settingsOf(id)); toast(enabled ? 'המודול הופעל' : 'המודול כובה'); r.reload(); reloadModules(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); } finally { setBusy(null); }
  };
  const saveSetting = async (id: string, key: string, value: unknown) => {
    try { await repo.admin.setModule(id, state[id] ?? false, { ...settingsOf(id), [key]: value }); toast('ההגדרה נשמרה'); r.reload(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };
  return (
    <div>
      <h1>מודולים</h1>
      <Notice>מודולים נרשמים בקוד בלבד (src/modules). כאן מפעילים ומכבים אותם ומגדירים אותם. אין טעינת קוד מהמסד.</Notice>
      <div className="stack" style={{ marginTop: 'var(--s-4)' }}>
        {MODULES.map((m) => (
          <section key={m.id} className="panel">
            <div className="spread">
              <div>
                <h2 style={{ margin: 0 }}>{m.name} <span className="kbd soft">{m.id}@{m.version}</span></h2>
                <p className="soft" style={{ margin: 0 }}>{m.description}</p>
              </div>
              <div className="row">
                {m.core && <Badge>ליבה</Badge>}
                <Badge tone={state[m.id] ? 'ok' : undefined}>{state[m.id] ? 'פעיל' : 'כבוי'}</Badge>
                {!m.core && <Button size="sm" variant="secondary" busy={busy === m.id} onClick={() => void toggle(m.id, !state[m.id])}>{state[m.id] ? 'כיבוי' : 'הפעלה'}</Button>}
              </div>
            </div>
            {m.dependsOn.length > 0 && <p className="soft">תלוי ב: {m.dependsOn.join(', ')}</p>}
            {m.settings.length > 0 && (
              <div className="form-grid two" style={{ marginTop: 'var(--s-3)' }}>
                {m.settings.map((s) => s.type === 'boolean' ? (
                  <Checkbox key={s.key} label={s.label} checked={(settingsOf(m.id)[s.key] ?? s.default) === true} onChange={(e) => void saveSetting(m.id, s.key, e.target.checked)} />
                ) : (
                  <TextField key={s.key} label={s.label} type={s.type === 'number' ? 'number' : 'text'} defaultValue={String(settingsOf(m.id)[s.key] ?? s.default)}
                    onBlur={(e) => void saveSetting(m.id, s.key, s.type === 'number' ? Number(e.target.value) : e.target.value)} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
