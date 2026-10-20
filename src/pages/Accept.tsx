import { useState } from 'react';
import { useHead } from '../app/head.ts';
import { useRouter, useSearchParams } from '../app/router.tsx';
import { IS_DEMO } from '../app/config.ts';
import { errorMessage, useRepo } from '../data/repo.ts';
import { Button, Notice, TextField } from '../components/ui.tsx';

export default function AcceptPage() {
  const repo = useRepo();
  const { navigate } = useRouter();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useHead({ title: 'הצטרפות לצוות', path: '/accept', noindex: true });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await repo.acceptInvite(token, password, displayName);
      navigate('/admin');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container section" style={{ maxWidth: 480 }}>
      <h1>הצטרפות לצוות</h1>
      {IS_DEMO && <Notice tone="warn">במצב הדגמה אין הזמנות אמיתיות. בחרו תפקיד במסך הניהול.</Notice>}
      {!token && <Notice tone="warn">חסר אסימון הזמנה בקישור.</Notice>}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="שם לתצוגה" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextField label="סיסמה" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
        {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <Button type="submit" disabled={busy || !token || IS_DEMO}>{busy ? 'שומר…' : 'יצירת חשבון'}</Button>
      </form>
    </div>
  );
}
