import { useState } from 'react';
import { useSearchParams } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Button, ErrorState, Notice, Pagination, Skeleton, TextField, formatHebDate } from '../components/ui.tsx';
import { ROLE_LABEL, isAdmin } from '../shared/workflow.ts';
import { ROLES, type Role } from '../shared/types.ts';
import { useAdmin } from './AdminApp.tsx';

export function UsersScreen() {
  const repo = useRepo();
  const { roles, session } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const r = useAsync(() => repo.admin.listUsers(), [repo]);
  const [email, setEmail] = useState('');
  if (!isAdmin(roles)) return <Notice tone="warn" icon="lock">ניהול משתמשים למנהלים בלבד.</Notice>;
  const toggle = async (userId: string, role: Role, grant: boolean) => {
    if ((role === 'owner' || role === 'admin') && !(await confirm({ title: grant ? `הענקת תפקיד ${ROLE_LABEL[role]}` : `הסרת תפקיד ${ROLE_LABEL[role]}`, body: 'תפקיד זה מעניק הרשאות ניהול רחבות.', confirmLabel: 'אישור', danger: true }))) return;
    try { await repo.admin.setRole(userId, role, grant); toast('התפקיד עודכן'); r.reload(); } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };
  return (
    <div>
      <h1>משתמשים ותפקידים</h1>
      <Notice>הרשאות נאכפות במסד (טבלת user_roles ומדיניות RLS). רק בעלים מעניק תפקידי בעלים/מנהל. תפקיד „הרב” מאשר תשובות בשמו.</Notice>
      <form className="row" style={{ alignItems: 'end', margin: 'var(--s-4) 0' }} onSubmit={(e) => { e.preventDefault(); void repo.admin.inviteUser(email).then(() => { toast('ההזמנה נשלחה'); setEmail(''); r.reload(); }, (err) => toast(errorMessage(err), { tone: 'error' })); }}>
        <div className="grow"><TextField label="הזמנת משתמש בדוא״ל" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <Button type="submit" icon="plus">הזמנה</Button>
      </form>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>משתמש</th>{ROLES.map((x) => <th key={x}>{ROLE_LABEL[x]}</th>)}</tr></thead>
            <tbody>
              {r.data.map((u) => (
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
  const [params] = useSearchParams();
  const page = Number(params.get('page') ?? 1) || 1;
  const r = useAsync(() => repo.admin.audit(page), [page]);
  if (!isAdmin(roles)) return <Notice tone="warn" icon="lock">יומן הפעולות זמין למנהלים בלבד.</Notice>;
  return (
    <div>
      <h1>יומן פעולות</h1>
      <p className="soft">היומן מוגן: נכתב רק על ידי המסד, ואינו שומר קודים סודיים או תוכן שאלות פרטיות.</p>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <Skeleton h={200} />}
      {r.data && (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>ישות</th><th>פרטים</th></tr></thead>
              <tbody>
                {r.data.items.map((a) => (
                  <tr key={a.id}>
                    <td>{formatHebDate(a.createdAt)} <span className="kbd">{new Date(a.createdAt).toLocaleTimeString('he-IL')}</span></td>
                    <td className="ltr">{a.actor ?? 'מערכת'}</td>
                    <td>{a.action}</td>
                    <td className="kbd">{a.entity}</td>
                    <td className="kbd">{Object.keys(a.meta).length ? JSON.stringify(a.meta) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={r.data.total} pageSize={r.data.pageSize} hrefFor={(p) => `/admin/audit?page=${p}`} />
        </>
      )}
    </div>
  );
}
