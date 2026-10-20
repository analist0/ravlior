import { useEffect, useRef, useState } from 'react';
import { Link } from '../app/router.tsx';
import { IS_DEMO } from '../app/config.ts';
import { errorMessage, useRepo } from '../data/repo.ts';
import { validateUpdate, type UpdateChannel } from '../shared/updates.ts';
import { Button } from './ui.tsx';

export function UpdatesForm() {
  const repo = useRepo();
  const started = useRef(Date.now());
  const [channel, setChannel] = useState<UpdateChannel>('email');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateUpdate({ channel, contact, consent, website, startedAt: started.current });
    if (!v.ok) { setError(Object.values(v.errors)[0] ?? 'הטופס אינו תקין'); return; }
    setError('');
    setBusy(true);
    try {
      await repo.subscribeUpdates({ channel, contact, consent, website, startedAt: started.current });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="updates" role="status">
        <strong>הפרטים נשמרו.</strong> לא נשלח דוא״ל ולא הודעת וואטסאפ — באתר אין שירות שליחה.
        {IS_DEMO ? ' במצב הדגמה השמירה היא בדפדפן זה בלבד.' : ''}
      </p>
    );
  }

  return (
    <form className="updates" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <h2>עדכונים</h2>
      <p>אם תרצו, נשמור כתובת כדי לעדכן כשיהיה על מה. כרגע האתר לא שולח דוא״ל ולא הודעות.</p>
      <div className="updates-switch segmented" role="group" aria-label="ערוץ עדכון">
        <button type="button" aria-pressed={channel === 'email'} onClick={() => setChannel('email')}>דוא״ל</button>
        <button type="button" aria-pressed={channel === 'whatsapp'} onClick={() => setChannel('whatsapp')}>וואטסאפ</button>
      </div>
      <label className="field">
        <span className="field-label">{channel === 'email' ? 'דוא״ל' : 'נייד'}</span>
        <input
          className="input"
          type={channel === 'email' ? 'email' : 'tel'}
          dir="ltr"
          inputMode={channel === 'email' ? 'email' : 'tel'}
          autoComplete={channel === 'email' ? 'email' : 'tel'}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>אני מסכים/ה לשמירת הפרטים לצורך עדכונים עתידיים. <Link to="/p/privacy">מדיניות הפרטיות</Link></span>
      </label>
      <div className="hp" aria-hidden="true">
        <label htmlFor="updates-website">אתר</label>
        <input id="updates-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div><Button type="submit" busy={busy}>{busy ? 'שומר…' : 'שמירת הפרטים'}</Button></div>
    </form>
  );
}

interface InstallEvent extends Event { prompt: () => Promise<void> }

export function PwaHint() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    const onIn = () => setInstalled(true);
    const off = () => setOffline(true);
    const on = () => setOffline(false);
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onIn);
    addEventListener('offline', off);
    addEventListener('online', on);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onIn);
      removeEventListener('offline', off);
      removeEventListener('online', on);
    };
  }, []);
  return (
    <div className="pwa-hint">
      {offline && <p role="status">אין חיבור לרשת. עמודים שנפתחו ייטענו מהעותק השמור כשהוא קיים.</p>}
      {install && !installed && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void install.prompt()}>התקנת האתר למסך הבית</button>
      )}
    </div>
  );
}
