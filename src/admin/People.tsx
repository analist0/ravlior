import { Fragment, useState } from 'react';
import { useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Button, ErrorState, Notice, Pagination, SelectField, Skeleton, TextField, formatHebDate } from '../components/ui.tsx';
import { ROLE_LABEL, isAdmin } from '../shared/workflow.ts';
import { ROLES, type Role } from '../shared/types.ts';

const ROLE_HELP: Record<Role, string> = {
  owner: 'מעניק כל תפקיד, כולל בעלים. מנהל את האתר ומפרסם.',
  admin: 'מנהל תוכן ומשתמשים. אינו יכול להעניק תפקיד בעלים.',
  editor: 'עורך טיוטות ושולח אותן לבדיקה. אינו מפרסם לבד.',
  reviewer: 'בודק תוכן, מאשר ומפרסם אחרי העריכה.',
  rabbi: 'מאשר תשובות שניתנות בשמו. אינו מנהל משתמשים.',
  viewer: 'צפייה בלבד. אינו עורך, ואינו רואה פניות או שאלות פרטיות.',
};

const AUDIT_ENTITIES: [string, string][] = [
  ['content', 'תכנים (הדגמה)'],
  ['content_items', 'תכנים'],
  ['pages', 'עמודים'],
  ['institutions', 'מוסדות'],
  ['events', 'אירועים'],
  ['series', 'סדרות'],
  ['topics', 'נושאים'],
  ['menus', 'תפריטים'],
  ['homepage_sections', 'מקטעי דף הבית'],
  ['contact_messages', 'פניות'],
  ['user_roles', 'תפקידים'],
  ['publicQuestions', 'שו״ת (הדגמה)'],
  ['public_questions', 'שו״ת'],
];
import { useAdmin } from './AdminApp.tsx';
import { filterStaff } from './staff-filter.ts';

export function UsersScreen() {
  const repo = useRepo();
  const { roles, session } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const r = useAsync(() => repo.admin.listUsers(), [repo]);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  if (!isAdmin(roles)) return <Notice tone="warn" icon="lock">ניהול משתמשים למנהלים בלבד.</Notice>;
  const toggle = async (userId: string, role: Role, grant: boolean) => {
    if ((role === 'owner' || role === 'admin') && !(await confirm({ title: grant ? `הענקת תפקיד ${ROLE_LABEL[role]}` : `הסרת תפקיד ${ROLE_LABEL[role]}`, body: 'תפקיד זה מעניק הרשאות ניהול רחבות.', confirmLabel: 'אישור', danger: true }))) return;
    try { await repo.admin.setRole(userId, role, grant); toast('התפקיד עודכן'); r.reload(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };
  return (
    <div>
      <h1>משתמשים ותפקידים</h1>
      <Notice>הרשאות נאכפות במסד (טבלת user_roles ומדיניות RLS). רק בעלים מעניק תפקידי בעלים ומנהל. תפקיד „הרב” מאשר תשובות בשמו.</Notice>
      <div className="admin-cards" style={{ marginTop: 'var(--s-4)' }}>
        {ROLES.map((x) => (
          <article key={x} className="role-card">
            <strong>{ROLE_LABEL[x]}</strong>
            <p className="soft" style={{ margin: '6px 0 0' }}>{ROLE_HELP[x]}</p>
          </article>
        ))}
      </div>
      <form className="admin-toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <TextField label="חיפוש משתמש" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="דוא״ל או שם" />
        </div>
        <div className="field">
          <SelectField label="תפקיד" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">הכול</option>
            {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
          </SelectField>
        </div>
      </form>
      <form className="row" style={{ alignItems: 'end', margin: 'var(--s-4) 0' }} onSubmit={(e) => { e.preventDefault(); void repo.admin.inviteUser(email).then((inv) => { setEmail(''); r.reload(); if (inv.token) setInvite(`${location.origin}/accept?token=${encodeURIComponent(inv.token)}`); else toast('המשתמש נוסף (הדגמה)'); }, (err) => toast(errorMessage(err), { tone: 'error' })); }}>
        <div className="grow"><TextField label="הזמנת משתמש בדוא״ל" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <Button type="submit" icon="plus">הזמנה</Button>
      </form>
      {invite && <Notice>הקישור מוצג פעם אחת. העבירו אותו לנמען בערוץ מאובטח — אין שליחת דוא״ל מהשרת. <span className="ltr">{invite}</span></Notice>}
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data && filterStaff(r.data, { q, role }).length === 0 && <Notice>אין משתמשים התואמים לחיפוש.</Notice>}
      {r.data && filterStaff(r.data, { q, role }).length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>משתמש</th>{ROLES.map((x) => <th key={x}>{ROLE_LABEL[x]}</th>)}</tr></thead>
            <tbody>
              {filterStaff(r.data, { q, role }).map((u) => (
                <tr key={u.userId}>
                  <td className="ltr">{u.email}{u.userId === session.userId ? ' (את/ה)' : ''}</td>
                  {ROLES.map((role) => (
                    <td key={role}>
                      <input type="checkbox" aria-label={`${ROLE_LABEL[role]} עבור ${u.email}`} checked={u.roles.includes(role)}
                        disabled={(role === 'owner' || role === 'admin') && !roles.includes('owner')}
                        onChange={(e) => void toggle(u.userId, role, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditScreen() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const [params, update] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const q = params.get('q') ?? '';
  const entity = params.get('entity') ?? '';
  const [text, setText] = useState(q);
  const [open, setOpen] = useState<string | null>(null);
  const r = useAsync(() => repo.admin.audit(page, { q, entity }), [page, q, entity]);
  if (!isAdmin(roles)) return <Notice tone="warn" icon="lock">יומן הפעולות זמין למנהלים בלבד.</Notice>;
  return (
    <div>
      <h1>יומן פעולות</h1>
      <p className="soft">היומן מוגן: נכתב רק על ידי המסד, ואינו שומר קודים סודיים או תוכן שאלות פרטיות.</p>
      <form className="admin-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="audit-q">חיפוש ביומן</label>
          <input id="audit-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="פעולה, ישות או משתמש" onBlur={() => text !== q && update({ q: text, page: null })} />
        </div>
        <div className="field">
          <SelectField label="ישות" value={entity} onChange={(e) => update({ entity: e.target.value || null, page: null })}>
            <option value="">הכול</option>
            {AUDIT_ENTITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
        </div>
      </form>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data && (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>ישות</th><th>פרטים</th></tr></thead>
              <tbody>
                {r.data.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td>{formatHebDate(a.createdAt)} <span className="kbd">{new Date(a.createdAt).toLocaleTimeString('he-IL')}</span></td>
                      <td className="ltr">{a.actor ?? 'מערכת'}</td>
                      <td>{a.action}</td>
                      <td className="kbd">{a.entity}</td>
                      <td>
                        {Object.keys(a.meta).length ? (
                          <Button size="sm" variant="ghost" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'הסתרה' : 'פרטים'}</Button>
                        ) : <span className="soft">—</span>}
                      </td>
                    </tr>
                    {open === a.id && (
                      <tr>
                        <td colSpan={5}><pre className="kbd" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify({ entityId: a.entityId, meta: a.meta }, null, 2)}</pre></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {r.data.items.length === 0 && <Notice>אין רשומות התואמות לחיפוש.</Notice>}
          <Pagination page={page} total={r.data.total} pageSize={r.data.pageSize} hrefFor={(p) => {
            const n = new URLSearchParams(params);
            n.set('page', String(p));
            return `/admin/audit?${n}`;
          }} />
        </>
      )}
    </div>
  );
}
