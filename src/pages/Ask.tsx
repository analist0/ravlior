import { useEffect, useRef, useState } from 'react';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type TrackResult } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, Button, Checkbox, ErrorState, Notice, SelectField, TextArea, TextField, formatHebDate } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { QUESTION_STATUS_LABEL } from '../shared/workflow.ts';
import { parseTrackingFragment, trackingLink, validateQuestion, type FieldErrors } from '../shared/questions.ts';

export function AskPage() {
  const repo = useRepo();
  const toast = useToast();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const modules = useAsync(() => repo.getModules(), [repo]);
  const started = useRef(Date.now());
  const [form, setForm] = useState({ questionText: '', topicId: '', isAnonymous: true, askerName: '', contactEmail: '', publishConsent: false, website: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; token: string } | null>(null);
  useHead({ title: 'שאלה לרב', description: 'שליחת שאלה לרב ליאור כהן — ללא הרשמה, אפשר בעילום שם. השאלה אינה מתפרסמת ללא הסכמה ואישור.', path: '/ask' });
  const accepting = (modules.data?.find((m) => m.id === 'responsa')?.settings.acceptQuestions ?? true) !== false;

  const submit = async () => {
    const payload = { ...form, topicId: form.topicId || null, askerName: form.askerName || null, contactEmail: form.contactEmail || null, startedAt: started.current };
    const v = validateQuestion(payload);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    setBusy(true);
    try {
      const res = await repo.submitQuestion(payload);
      setDone({ code: res.trackingCode, token: res.token });
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const link = trackingLink(location.origin, done.code, done.token);
    return (
      <div className="container section prose">
        <Icon name="check" className="" />
        <h1>השאלה התקבלה</h1>
        <p>מספר המעקב: <strong className="ltr" style={{ fontSize: 'var(--step-2)' }}>{done.code}</strong></p>
        <Notice tone="warn" icon="lock">
          שמרו את קישור המעקב הפרטי. הוא מוצג <strong>פעם אחת בלבד</strong> ואיננו שומרים את הקוד הסודי — בלעדיו לא ניתן לצפות בתשובה.
        </Notice>
        <div className="field" style={{ marginTop: 'var(--s-4)' }}>
          <label htmlFor="trk">קישור מעקב פרטי</label>
          <input id="trk" className="input ltr" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%' }} />
        </div>
        <div className="row" style={{ marginTop: 'var(--s-4)' }}>
          <Button icon="copy" onClick={() => void navigator.clipboard.writeText(link).then(() => toast('הקישור הועתק'), () => toast('העתקה נכשלה — סמנו והעתיקו ידנית', { tone: 'error' }))}>העתקת הקישור</Button>
          <a className="btn btn-secondary" href={link}>מעבר למעקב</a>
        </div>
        <p className="soft" style={{ marginTop: 'var(--s-5)' }}>השאלה תיקרא בידי הצוות. תשובה בשם הרב נמסרת רק לאחר אישורו. השאלה לא תתפרסם באופן אוטומטי.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שאלה לרב' }]} />
      <div className="prose">
        <h1>שאלה לרב</h1>
        <p className="muted">אין צורך בהרשמה. אפשר לשאול בעילום שם. תקבלו מספר מעקב וקישור פרטי לצפייה בתשובה.</p>
        {!accepting && <Notice tone="warn">קבלת שאלות חדשות מושהית כרגע.</Notice>}
        <form className="form-grid" style={{ marginTop: 'var(--s-5)' }} noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {errors.form && <div role="alert"><Notice tone="warn" icon="alert">{errors.form}</Notice></div>}
          <SelectField label="נושא (לא חובה)" value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
            <option value="">פנייה כללית / ללא נושא</option>
            {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
          <TextArea label="השאלה" required value={form.questionText} maxLength={4000} error={errors.questionText}
            onChange={(e) => setForm({ ...form, questionText: e.target.value })} hint={`${form.questionText.length}/4000 · נא לא לכלול פרטים מזהים אם אינם נחוצים`} />
          <Checkbox label="לשאול בעילום שם" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
          {!form.isAnonymous && <TextField label="שם (לא יפורסם)" value={form.askerName} maxLength={80} error={errors.askerName} onChange={(e) => setForm({ ...form, askerName: e.target.value })} autoComplete="name" />}
          <TextField label="דוא״ל לעדכון (לא חובה)" type="email" dir="ltr" value={form.contactEmail} error={errors.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} autoComplete="email" hint="משמש רק ליצירת קשר בנוגע לשאלה. אפשר להשאיר ריק ולעקוב בקישור." />
          <Checkbox
            checked={form.publishConsent}
            onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })}
            label="אני מסכים/ה שהשאלה והתשובה יפורסמו באתר, בעריכה ובלי פרטים מזהים"
            hint="הסכמה נפרדת ורשות בלבד. גם בהסכמה — פרסום רק לאחר אישור הרב."
          />
          <div className="hp" aria-hidden="true">
            <label htmlFor="website">אתר</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="row">
            <Button type="submit" busy={busy} disabled={!accepting} icon="ask">{busy ? 'שולח…' : 'שליחת השאלה'}</Button>
            <Link to="/track">כבר שאלתי — למעקב</Link>
          </div>
          <p className="soft">בשליחה אתם מאשרים את <Link to="/p/privacy">מדיניות הפרטיות</Link>. בינה מלאכותית אינה עונה ואינה פוסקת בשם הרב.</p>
        </form>
      </div>
    </div>
  );
}

function VoiceAnswer({ code, token }: { code: string; token: string }) {
  const repo = useRepo();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (url) return <audio controls autoPlay={false} preload="none" src={url} style={{ width: '100%' }} aria-label="תשובה קולית" onError={() => { setUrl(null); setErr('הקישור הזמני פג. לחצו שוב.'); }} />;
  return (
    <p>
      <Button variant="secondary" icon="listen" onClick={() => void repo.answerAudioUrl(code, token).then(setUrl, (e) => setErr(errorMessage(e)))}>האזנה לתשובה הקולית</Button>
      {err && <span role="alert" style={{ color: 'var(--danger)', marginInlineStart: 8 }}>{err}</span>}
    </p>
  );
}

export function TrackPage() {
  const repo = useRepo();
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<TrackResult | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useHead({ title: 'מעקב אחר שאלה', noindex: true });

  const check = async (c: string, t: string) => {
    setBusy(true); setError(null);
    try { setResult(await repo.trackQuestion(c.trim(), t.trim())); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  useEffect(() => {
    // Secret arrives in the URL fragment; strip it from the address bar/history immediately.
    const f = parseTrackingFragment(location.hash);
    if (f) {
      history.replaceState(null, '', '/track');
      setCode(f.code); setToken(f.token);
      void check(f.code, f.token);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container prose">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מעקב אחר שאלה' }]} />
      <h1>מעקב אחר שאלה</h1>
      <p className="muted">פתחו את קישור המעקב הפרטי שקיבלתם, או הזינו את מספר המעקב והקוד הסודי.</p>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void check(code, token); }}>
        <TextField label="מספר מעקב" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" required />
        <TextField label="קוד סודי" dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
        <div><Button type="submit" busy={busy} icon="search">בדיקה</Button></div>
      </form>
      <div style={{ marginTop: 'var(--s-6)' }} aria-live="polite">
        {error && <ErrorState error={error} />}
        {result === null && <Notice tone="warn" icon="alert">לא נמצאה שאלה התואמת למספר ולקוד. בדקו שהעתקתם את הקישור במלואו.</Notice>}
        {result && (
          <section className="side-card">
            <div className="spread"><strong className="ltr">{result.trackingCode}</strong><Badge tone="accent">{QUESTION_STATUS_LABEL[result.status]}</Badge></div>
            <p className="soft">נשלחה ב־{formatHebDate(result.createdAt)}</p>
            {result.answerText ? (
              <>
                <h2 style={{ fontSize: 'var(--step-2)' }}>התשובה</h2>
                {result.answerText.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
              </>
            ) : <p>התשובה תוצג כאן לאחר שתאושר.</p>}
            {result.hasAudio && <VoiceAnswer code={code} token={token} />}
            {result.publicSlug && <p><Link to={`/responsa/${result.publicSlug}`}>לתשובה כפי שפורסמה באתר</Link></p>}
          </section>
        )}
      </div>
    </div>
  );
}
