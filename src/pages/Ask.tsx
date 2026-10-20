import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '../app/config.ts';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type TrackResult } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, Button, Checkbox, ErrorState, Notice, SelectField, TextArea, TextField, formatHebDate } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { audioFileLabel, etaLabel } from '../shared/responsa.ts';
import { QUESTION_STATUS_LABEL } from '../shared/workflow.ts';
import { parseTrackingFragment, trackingLink, validateQuestion, type FieldErrors } from '../shared/questions.ts';

const DRAFT_KEY = 'or-ask-draft';

interface AskDraft {
  questionText: string;
  topicId: string;
  isAnonymous: boolean;
  askerName: string;
  contactEmail: string;
  publishConsent: boolean;
}

function readDraft(): AskDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<AskDraft>;
    return {
      questionText: typeof o.questionText === 'string' ? o.questionText : '',
      topicId: typeof o.topicId === 'string' ? o.topicId : '',
      isAnonymous: o.isAnonymous !== false,
      askerName: typeof o.askerName === 'string' ? o.askerName : '',
      contactEmail: typeof o.contactEmail === 'string' ? o.contactEmail : '',
      publishConsent: o.publishConsent === true,
    };
  } catch {
    return null;
  }
}

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    const node = ref.current;
    const render = () => {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => void } };
      if (!w.turnstile || !node.isConnected) return;
      w.turnstile.render(node, { sitekey: TURNSTILE_SITE_KEY, callback: onToken });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    if (existing) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.dataset.turnstile = '1';
    s.onload = render;
    document.head.appendChild(s);
  }, [onToken]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="cf-turnstile" />;
}

function VoiceRecorder({ code, token }: { code: string; token: string }) {
  const repo = useRepo();
  const toast = useToast();
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [saved, setSaved] = useState(false);
  if (typeof MediaRecorder === 'undefined') return null;
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      for (const t of stream.getTracks()) t.stop();
      const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
      void repo.submitVoice(code, token, blob).then(() => { setSaved(true); toast('ההקלטה נשמרה'); }, (e) => toast(errorMessage(e), { tone: 'error' }));
    };
    rec.start();
    setRecorder(rec);
    setRecording(true);
  };
  return (
    <div className="stack" style={{ marginTop: 'var(--s-4)' }}>
      <p className="soft">אפשר לצרף הקלטה קולית של השאלה. היא נשמרת באופן פרטי ואינה מתפרסמת.</p>
      {saved ? <Notice tone="ok" icon="check">ההקלטה צורפה לשאלה.</Notice> : (
        <div className="row">
          {!recording && <Button variant="secondary" icon="listen" onClick={() => void start().catch(() => toast('לא ניתן להפעיל את המיקרופון', { tone: 'error' }))}>הקלטת השאלה</Button>}
          {recording && <Button variant="danger" onClick={() => { recorder?.stop(); setRecording(false); }}>סיום ההקלטה</Button>}
        </div>
      )}
    </div>
  );
}

export function AskPage() {
  const repo = useRepo();
  const toast = useToast();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const modules = useAsync(() => repo.getModules(), [repo]);
  const eta = useAsync(() => repo.etaDays(), [repo]);
  const started = useRef(Date.now());
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState(() => {
    const d = readDraft();
    return { questionText: d?.questionText ?? '', topicId: d?.topicId ?? '', isAnonymous: d?.isAnonymous ?? true, askerName: d?.askerName ?? '', contactEmail: d?.contactEmail ?? '', publishConsent: d?.publishConsent ?? false, website: '' };
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; token: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [suggestions, setSuggestions] = useState<{ slug: string; questionText: string }[]>([]);
  useHead({ title: 'שאלה לרב', description: 'שליחת שאלה לרב ליאור כהן — ללא הרשמה, אפשר בעילום שם. השאלה אינה מתפרסמת ללא הסכמה ואישור.', path: '/ask' });
  const accepting = (modules.data?.find((m) => m.id === 'responsa')?.settings.acceptQuestions ?? true) !== false;

  useEffect(() => {
    const { website: _w, ...rest } = form;
    void _w;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(rest)); } catch { /* private mode */ }
  }, [form]);

  useEffect(() => {
    const q = form.questionText.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => { void repo.suggestQuestions(q).then(setSuggestions, () => setSuggestions([])); }, 300);
    return () => clearTimeout(t);
  }, [form.questionText, repo]);

  useEffect(() => {
    if (errors.form || errors.questionText) alertRef.current?.focus();
  }, [errors]);
  useEffect(() => { if (done) successRef.current?.focus(); }, [done]);

  const submit = async () => {
    const payload = { ...form, topicId: form.topicId || null, askerName: form.askerName || null, contactEmail: form.contactEmail || null, startedAt: started.current, turnstileToken: turnstileToken || undefined };
    const v = validateQuestion(payload);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    setBusy(true);
    try {
      const res = await repo.submitQuestion(payload);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
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
        <h1 ref={successRef} tabIndex={-1}>השאלה התקבלה</h1>
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
        <VoiceRecorder code={done.code} token={done.token} />
        <p className="soft" style={{ marginTop: 'var(--s-5)' }}>השאלה תיקרא בידי הצוות. תשובה בשם הרב נמסרת רק לאחר אישורו. השאלה לא תתפרסם באופן אוטומטי. אם נמסר דוא״ל, תישלח הודעה עם קישור בלבד כשהתשובה מוכנה.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שאלה לרב' }]} />
      <div className="prose">
        <h1>שאלה לרב</h1>
        <p className="muted">אין צורך בהרשמה. אפשר לשאול בעילום שם. תקבלו מספר מעקב וקישור פרטי לצפייה בתשובה.</p>
        {eta.data != null && <p>{etaLabel(eta.data)}</p>}
        {!accepting && <Notice tone="warn">קבלת שאלות חדשות מושהית כרגע.</Notice>}
        <form className="form-grid" style={{ marginTop: 'var(--s-5)' }} noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {(errors.form || errors.questionText) && (
            <div ref={alertRef} tabIndex={-1} role="alert">
              <Notice tone="warn" icon="alert">{errors.form ?? errors.questionText}</Notice>
            </div>
          )}
          <SelectField label="נושא (לא חובה)" value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
            <option value="">פנייה כללית / ללא נושא</option>
            {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
          <TextArea label="השאלה" required value={form.questionText} maxLength={4000} error={errors.questionText}
            onChange={(e) => setForm({ ...form, questionText: e.target.value })} hint={`${form.questionText.length}/4000 · נא לא לכלול פרטים מזהים אם אינם נחוצים`} />
          {suggestions.length > 0 && (
            <div aria-live="polite">
              <p className="soft">תשובות שכבר פורסמו ועשויות לענות:</p>
              <ul>
                {suggestions.map((s) => <li key={s.slug}><Link to={`/responsa/${s.slug}`}>{s.questionText.slice(0, 140)}</Link></li>)}
              </ul>
            </div>
          )}
          <Checkbox label="לשאול בעילום שם" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
          {!form.isAnonymous && <TextField label="שם (לא יפורסם)" value={form.askerName} maxLength={80} error={errors.askerName} onChange={(e) => setForm({ ...form, askerName: e.target.value })} autoComplete="name" />}
          <TextField label="דוא״ל לעדכון (לא חובה)" type="email" dir="ltr" value={form.contactEmail} error={errors.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} autoComplete="email" hint="משמש רק לשליחת קישור כשהתשובה מוכנה. תוכן התשובה אינו נשלח בדוא״ל." />
          <Checkbox
            checked={form.publishConsent}
            onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })}
            label="אני מסכים/ה שהשאלה והתשובה יפורסמו באתר, בעריכה ובלי פרטים מזהים"
            hint="הסכמה נפרדת ורשות בלבד. גם בהסכמה — פרסום רק לאחר אישור הרב."
          />
          <Turnstile onToken={setTurnstileToken} />
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
  if (url) return <audio controls autoPlay={false} preload="none" src={url} style={{ width: '100%' }} aria-label={audioFileLabel('answer.mp3')} onError={() => { setUrl(null); setErr('הקישור הזמני פג. לחצו שוב.'); }} />;
  return (
    <p>
      <Button variant="secondary" icon="listen" onClick={() => void repo.answerAudioUrl(code, token).then(setUrl, (e) => setErr(errorMessage(e)))}>האזנה לתשובה הקולית</Button>
      {err && <span role="alert" style={{ color: 'var(--danger)', marginInlineStart: 8 }}>{err}</span>}
    </p>
  );
}

function FollowUp({ code, token, onDone }: { code: string; token: string; onDone: (next: { code: string; token: string }) => void }) {
  const repo = useRepo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="form-grid" style={{ marginTop: 'var(--s-5)' }} onSubmit={(e) => {
      e.preventDefault();
      setBusy(true); setError(null);
      void repo.followUp(code, token, text).then((r) => onDone({ code: r.trackingCode, token: r.token }), (err) => setError(errorMessage(err))).finally(() => setBusy(false));
    }}>
      <h2 style={{ fontSize: 'var(--step-1)' }}>שאלת המשך</h2>
      <TextArea label="שאלה נוספת באותו נושא" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} required />
      {error && <div role="alert"><Notice tone="warn">{error}</Notice></div>}
      <Button type="submit" busy={busy} variant="secondary">שליחת שאלת המשך</Button>
    </form>
  );
}

export function TrackPage() {
  const repo = useRepo();
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<TrackResult | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState<{ code: string; token: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useHead({ title: 'מעקב אחר שאלה', noindex: true });

  const check = async (c: string, t: string) => {
    setBusy(true); setError(null); setFollow(null);
    try { setResult(await repo.trackQuestion(c.trim(), t.trim())); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  useEffect(() => {
    const f = parseTrackingFragment(location.hash);
    if (f) {
      history.replaceState(null, '', '/track');
      setCode(f.code); setToken(f.token);
      void check(f.code, f.token);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const delivered = !!result && ['private_delivered', 'published', 'closed'].includes(result.status);
  const open = !!result && ['submitted', 'triaged', 'assigned'].includes(result.status);

  return (
    <div className="container prose">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מעקב אחר שאלה' }]} />
      <h1>מעקב אחר שאלה</h1>
      <p className="muted">פתחו את קישור המעקב הפרטי שקיבלתם, או הזינו את מספר המעקב והקוד הסודי.</p>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void check(code, token); }}>
        <TextField label="מספר מעקב" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoComplete="off" required />
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <TextField label="קוד סודי" dir="ltr" type={showToken ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
          <Button type="button" variant="secondary" onClick={() => setShowToken((v) => !v)} aria-pressed={showToken}>{showToken ? 'הסתרת הקוד' : 'הצגת הקוד'}</Button>
        </div>
        <div><Button type="submit" busy={busy} icon="search">בדיקה</Button></div>
      </form>
      <div style={{ marginTop: 'var(--s-6)' }} aria-live="polite">
        {error && <div ref={errorRef} tabIndex={-1}><ErrorState error={error} /></div>}
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
            {open && <VoiceRecorder code={code} token={token} />}
            {delivered && !follow && <FollowUp code={code} token={token} onDone={setFollow} />}
            {follow && (
              <Notice tone="ok" icon="check">
                שאלת ההמשך התקבלה. מספר המעקב החדש: <strong className="ltr">{follow.code}</strong>. שמרו את הקישור הפרטי — הוא מוצג פעם אחת.
                <div className="field" style={{ marginTop: 'var(--s-3)' }}>
                  <input className="input ltr" readOnly value={trackingLink(location.origin, follow.code, follow.token)} onFocus={(e) => e.currentTarget.select()} />
                </div>
              </Notice>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
