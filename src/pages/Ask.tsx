import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '../app/config.ts';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { errorMessage, useAsync, useRepo, type TrackResult } from '../data/repo.ts';
import { Badge, Breadcrumbs, Button, Checkbox, ErrorState, Notice, SelectField, TextArea, TextField, formatHebDate } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { PublicTimeline, SaveTrackLink, StepList, WavePlayer } from '../qa/pieces.tsx';
import { publicStage } from '../qa/reading.ts';
import { audioFileLabel, etaLabel } from '../shared/responsa.ts';
import { QUESTION_STATUS_LABEL } from '../shared/workflow.ts';
import { parseTrackingFragment, trackingLink, validateQuestion, type FieldErrors } from '../shared/questions.ts';

const DRAFT_KEY = 'or-ask-draft';
const STEPS = ['מדף', 'שאלה', 'פרטיות', 'קשר'];

interface AskDraft {
  questionText: string;
  topicId: string;
  categorySlug: string;
  isAnonymous: boolean;
  askerName: string;
  contactEmail: string;
  publishConsent: boolean;
  step: number;
}

function readDraft(): AskDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<AskDraft>;
    const step = typeof o.step === 'number' && o.step >= 0 && o.step <= 3 ? o.step : 0;
    return {
      questionText: typeof o.questionText === 'string' ? o.questionText : '',
      topicId: typeof o.topicId === 'string' ? o.topicId : '',
      categorySlug: typeof o.categorySlug === 'string' ? o.categorySlug : '',
      isAnonymous: o.isAnonymous !== false,
      askerName: typeof o.askerName === 'string' ? o.askerName : '',
      contactEmail: typeof o.contactEmail === 'string' ? o.contactEmail : '',
      publishConsent: o.publishConsent === true,
      step,
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

function VoiceCapture({ onBlob, code, token }: { onBlob?: (blob: Blob | null) => void; code?: string; token?: string }) {
  const repo = useRepo();
  const toast = useToast();
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [ready, setReady] = useState(false);
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
      if (code && token) {
        void repo.submitVoice(code, token, blob).then(() => { setSaved(true); toast('ההקלטה נשמרה'); }, (e) => toast(errorMessage(e), { tone: 'error' }));
      } else {
        onBlob?.(blob);
        setReady(true);
      }
    };
    rec.start();
    setRecorder(rec);
    setRecording(true);
    setReady(false);
  };
  return (
    <div className="stack" style={{ marginTop: 'var(--s-4)' }}>
      <p className="soft">אפשר לצרף הקלטה קולית. היא נשמרת באופן פרטי ואינה מתפרסמת.</p>
      {saved ? <Notice tone="ok" icon="check">ההקלטה צורפה לשאלה.</Notice> : (
        <div className="row">
          {!recording && <Button variant="secondary" icon="listen" onClick={() => void start().catch(() => toast('לא ניתן להפעיל את המיקרופון', { tone: 'error' }))}>{ready ? 'הקלטה מחדש' : 'הקלטת השאלה'}</Button>}
          {recording && <Button variant="danger" onClick={() => { recorder?.stop(); setRecording(false); }}>סיום ההקלטה</Button>}
          {ready && !code && <Button variant="ghost" onClick={() => { onBlob?.(null); setReady(false); }}>ביטול ההקלטה</Button>}
        </div>
      )}
      {ready && !code && <p className="soft">ההקלטה מוכנה ותצורף עם שליחת השאלה.</p>}
    </div>
  );
}

export function AskPage() {
  const repo = useRepo();
  const toast = useToast();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  const modules = useAsync(() => repo.getModules(), [repo]);
  const eta = useAsync(() => repo.etaDays(), [repo]);
  const started = useRef(Date.now());
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  const voice = useRef<Blob | null>(null);
  const voiceSent = useRef(false);
  const [step, setStep] = useState(() => readDraft()?.step ?? 0);
  const [form, setForm] = useState(() => {
    const d = readDraft();
    return {
      questionText: d?.questionText ?? '', topicId: d?.topicId ?? '', categorySlug: d?.categorySlug ?? '',
      isAnonymous: d?.isAnonymous ?? true, askerName: d?.askerName ?? '', contactEmail: d?.contactEmail ?? '',
      publishConsent: d?.publishConsent ?? false, website: '',
    };
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; token: string } | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [suggestions, setSuggestions] = useState<{ slug: string; questionText: string }[]>([]);
  useHead({ title: 'שאלה לרב', description: 'שליחת שאלה לרב ליאור כהן — ללא הרשמה, אפשר בעילום שם. השאלה אינה מתפרסמת ללא הסכמה ואישור.', path: '/ask' });
  const accepting = (modules.data?.find((m) => m.id === 'responsa')?.settings.acceptQuestions ?? true) !== false;

  useEffect(() => {
    const { website: _w, ...rest } = form;
    void _w;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...rest, step })); } catch { /* private mode */ }
  }, [form, step]);

  useEffect(() => {
    const q = form.questionText.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      const run = form.categorySlug
        ? repo.searchResponsa({ q, category: form.categorySlug, page: 1 }).then((r) => r.items.map((p) => ({ slug: p.slug, questionText: p.questionText })))
        : repo.suggestQuestions(q);
      void run.then(setSuggestions, () => setSuggestions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [form.questionText, form.categorySlug, repo]);

  useEffect(() => {
    if (errors.form || errors.questionText) alertRef.current?.focus();
  }, [errors]);
  useEffect(() => { if (done) successRef.current?.focus(); }, [done]);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    stepRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!done || !voice.current || voiceSent.current) return;
    voiceSent.current = true;
    const blob = voice.current;
    void repo.submitVoice(done.code, done.token, blob).then(() => setVoiceNote('ההקלטה צורפה לשאלה.'), (e) => setVoiceNote(errorMessage(e)));
  }, [done, repo]);

  const next = () => {
    if (step === 1) {
      const n = form.questionText.trim().length;
      if (n < 10) { setErrors({ questionText: 'נא לכתוב שאלה של 10 תווים לפחות.' }); return; }
      if (n > 4000) { setErrors({ questionText: 'השאלה ארוכה מדי (עד 4000 תווים).' }); return; }
    }
    setErrors({});
    setStep((s) => Math.min(3, s + 1));
  };

  const submit = async () => {
    const payload = { ...form, topicId: form.topicId || null, askerName: form.askerName || null, contactEmail: form.contactEmail || null, startedAt: started.current, turnstileToken: turnstileToken || undefined };
    const v = validateQuestion(payload);
    if (!v.ok) { setErrors(v.errors); if (v.errors.questionText) setStep(1); return; }
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
      <div className="container section qa-success">
        <div className="qa-panel prose">
          <p className="eyebrow">השאלה בדרך</p>
          <div className="qa-rule" />
          <h1 ref={successRef} tabIndex={-1}>השאלה התקבלה</h1>
          <p>מספר המעקב: <strong className="ltr qa-code">{done.code}</strong></p>
          <Notice tone="warn" icon="lock">
            שמרו את קישור המעקב הפרטי. הוא מוצג <strong>פעם אחת בלבד</strong> ואיננו שומרים את הקוד הסודי — בלעדיו לא ניתן לצפות בתשובה.
          </Notice>
          <SaveTrackLink link={link} code={done.code} />
          <div className="row" style={{ marginTop: 'var(--s-4)' }}>
            <a className="btn" href={link}>מעבר למעקב</a>
          </div>
          {voiceNote && <Notice tone={voiceNote.startsWith('ההקלטה') ? 'ok' : 'warn'}>{voiceNote}</Notice>}
          <VoiceCapture code={done.code} token={done.token} />
          {eta.data != null && <p>{etaLabel(eta.data)}</p>}
          <p className="soft">השאלה תיקרא בידי הצוות. תשובה בשם הרב נמסרת רק לאחר אישורו. השאלה לא תתפרסם באופן אוטומטי. אם נמסר דוא״ל, תישלח הודעה עם קישור בלבד כשהתשובה מוכנה.</p>
        </div>
      </div>
    );
  }

  const titles = ['באיזה מדף השאלה?', 'כתבו את השאלה', 'פרטיות ופרסום', 'איך נחזור אליכם'];

  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שאלה לרב' }]} />
      <div className="qa-hero">
        <p className="eyebrow">שאלה לרב</p>
        <div className="qa-rule" />
        <h1>בלי הרשמה, אפשר בעילום שם</h1>
        <p className="muted">תקבלו מספר מעקב וקישור פרטי. תשובה בשם הרב נמסרת רק אחרי אישורו, והשאלה אינה מתפרסמת בלי הסכמה.</p>
        <p className="qa-eta">{eta.data != null ? etaLabel(eta.data) : ''}</p>
      </div>
      {!accepting && <Notice tone="warn">קבלת שאלות חדשות מושהית כרגע.</Notice>}
      <StepList labels={STEPS} step={step} />
      <form className="qa-panel" noValidate onSubmit={(e) => { e.preventDefault(); if (step < 3) next(); else void submit(); }}>
        <h2 ref={stepRef} tabIndex={-1}>{titles[step]}</h2>
        {(errors.form || errors.questionText) && (
          <div ref={alertRef} tabIndex={-1} role="alert">
            <Notice tone="warn" icon="alert">{errors.form ?? errors.questionText}</Notice>
          </div>
        )}
        {step === 0 && (
          <div className="stack">
            <p className="soft">המדף עוזר למצוא תשובות שכבר פורסמו. הוא אינו נשמר כסיווג מחייב של השאלה.</p>
            <div className="qa-choices" role="group" aria-label="מדפי הלכה">
              <button type="button" className="chip" aria-pressed={form.categorySlug === ''} onClick={() => setForm({ ...form, categorySlug: '' })}>בלי מדף</button>
              {categories.data?.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={form.categorySlug === c.slug} onClick={() => setForm({ ...form, categorySlug: c.slug })}>{c.name}</button>
              ))}
            </div>
            <SelectField label="נושא בספרייה (לא חובה)" value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })}>
              <option value="">פנייה כללית / ללא נושא</option>
              {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
          </div>
        )}
        {step === 1 && (
          <div className="stack">
            <TextArea label="השאלה" required value={form.questionText} maxLength={4000} error={errors.questionText}
              onChange={(e) => setForm({ ...form, questionText: e.target.value })} hint={`${form.questionText.length}/4000 · נא לא לכלול פרטים מזהים אם אינם נחוצים`} />
            <div aria-live="polite">
              {suggestions.length > 0 && (
                <>
                  <p className="soft">תשובות שכבר פורסמו ועשויות לענות:</p>
                  <ul className="qa-suggest">
                    {suggestions.map((s) => <li key={s.slug}><Link to={`/responsa/${s.slug}`}>{s.questionText.slice(0, 140)}</Link></li>)}
                  </ul>
                </>
              )}
            </div>
            <VoiceCapture onBlob={(b) => { voice.current = b; }} />
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <Notice icon="lock">השאלה נשמרת באופן פרטי. אין פרסום בלי הסכמה מפורשת, וגם אז רק אחרי אישור הרב. בינה מלאכותית אינה עונה ואינה פוסקת בשם הרב.</Notice>
            <Checkbox label="לשאול בעילום שם" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })} />
            <Checkbox
              checked={form.publishConsent}
              onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })}
              label="אני מסכים/ה שהשאלה והתשובה יפורסמו באתר, בעריכה ובלי פרטים מזהים"
              hint="הסכמה נפרדת ורשות בלבד. גם בהסכמה — פרסום רק לאחר אישור הרב."
            />
            <p className="soft">בשליחה אתם מאשרים את <Link to="/p/privacy">מדיניות הפרטיות</Link>.</p>
          </div>
        )}
        {step === 3 && (
          <div className="form-grid">
            {!form.isAnonymous && <TextField label="שם (לא יפורסם)" value={form.askerName} maxLength={80} error={errors.askerName} onChange={(e) => setForm({ ...form, askerName: e.target.value })} autoComplete="name" />}
            <TextField label="דוא״ל לעדכון (לא חובה)" type="email" dir="ltr" value={form.contactEmail} error={errors.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} autoComplete="email" hint="משמש רק לשליחת קישור כשהתשובה מוכנה. תוכן התשובה אינו נשלח בדוא״ל." />
            {eta.data != null && <p>{etaLabel(eta.data)}</p>}
            <Turnstile onToken={setTurnstileToken} />
          </div>
        )}
        <div className="hp" aria-hidden="true">
          <label htmlFor="website">אתר</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div className="qa-nav">
          {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>חזרה</Button>}
          {step < 3 && <Button type="submit">המשך</Button>}
          {step === 3 && <Button type="submit" busy={busy} disabled={!accepting} icon="ask">{busy ? 'שולח…' : 'שליחת השאלה'}</Button>}
          <Link to="/track">כבר שאלתי — למעקב</Link>
        </div>
      </form>
    </div>
  );
}

function VoiceAnswer({ code, token }: { code: string; token: string }) {
  const repo = useRepo();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (url) return <WavePlayer src={url} label={audioFileLabel('answer.mp3')} />;
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
  const link = code && token ? trackingLink(location.origin, code, token) : '';

  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מעקב אחר שאלה' }]} />
      <div className="qa-hero">
        <p className="eyebrow">מעקב</p>
        <div className="qa-rule" />
        <h1>מעקב אחר שאלה</h1>
        <p className="muted">פתחו את קישור המעקב הפרטי שקיבלתם, או הזינו את מספר המעקב והקוד הסודי.</p>
      </div>
      <form className="qa-panel form-grid" onSubmit={(e) => { e.preventDefault(); void check(code, token); }}>
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
          <section className="qa-panel">
            <div className="spread"><strong className="ltr">{result.trackingCode}</strong><Badge tone="accent">{QUESTION_STATUS_LABEL[result.status]}</Badge></div>
            <p className="soft">נשלחה ב־{formatHebDate(result.createdAt)}</p>
            <PublicTimeline stage={publicStage(result.status)} />
            {result.answerText ? (
              <div className="qa-answer">
                <h2>התשובה</h2>
                {result.answerText.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ) : <p>התשובה תוצג כאן לאחר שתאושר בידי הרב ותימסר.</p>}
            {result.hasAudio && <VoiceAnswer code={code} token={token} />}
            {result.publicSlug && <p><Link to={`/responsa/${result.publicSlug}`}>לתשובה כפי שפורסמה באתר</Link></p>}
            {link && (
              <details className="qa-save">
                <summary>שמירת קישור המעקב</summary>
                <SaveTrackLink link={link} code={result.trackingCode} />
              </details>
            )}
            {open && <VoiceCapture code={code} token={token} />}
            {delivered && !follow && <FollowUp code={code} token={token} onDone={setFollow} />}
            {follow && (
              <Notice tone="ok" icon="check">
                שאלת ההמשך התקבלה. מספר המעקב החדש: <strong className="ltr">{follow.code}</strong>. שמרו את הקישור הפרטי — הוא מוצג פעם אחת.
                <SaveTrackLink link={trackingLink(location.origin, follow.code, follow.token)} code={follow.code} />
              </Notice>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
