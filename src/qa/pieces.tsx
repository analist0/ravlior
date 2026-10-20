import { useEffect, useRef, useState } from 'react';
import { encode } from 'uqr';
import { Icon } from '../components/Icon.tsx';
import { Button } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { PUBLIC_STAGE_LABEL, PUBLIC_STAGES, type PublicStage } from './reading.ts';

export function QrCode({ text }: { text: string }) {
  const qr = encode(text, { ecc: 'M', border: 2 });
  return (
    <div className="qa-qr" role="img" aria-label="קוד לסריקה של קישור המעקב" style={{ gridTemplateColumns: `repeat(${qr.size}, 1fr)` }}>
      {qr.data.flat().map((on, i) => <span key={i} className={on ? 'on' : 'off'} />)}
    </div>
  );
}

export function SaveTrackLink({ link, code }: { link: string; code: string }) {
  const toast = useToast();
  const wa = `https://wa.me/?text=${encodeURIComponent(`קישור מעקב פרטי לשאלה ${code}. הקישור סודי — מי שמחזיק בו רואה את התשובה.\n${link}`)}`;
  const copy = () => void navigator.clipboard.writeText(link).then(() => toast('הקישור הועתק'), () => toast('העתקה נכשלה — סמנו והעתיקו ידנית', { tone: 'error' }));
  return (
    <div className="qa-save">
      <p className="soft">הקישור הוא סוד. שמירה בוואטסאפ נועדה אליכם בלבד. מי שמחזיק בקישור יכול לראות את התשובה.</p>
      <div className="qa-save-row">
        <QrCode text={link} />
        <div className="stack">
          <label htmlFor="trk" className="field-label">קישור מעקב פרטי</label>
          <input id="trk" className="input ltr" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <Button icon="copy" onClick={copy}>העתקת הקישור</Button>
            <a className="btn btn-secondary" href={wa} target="_blank" rel="noopener noreferrer">שמירה בוואטסאפ<span className="sr-only"> (נפתח בחלון חדש)</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicTimeline({ stage }: { stage: PublicStage }) {
  const current = PUBLIC_STAGES.indexOf(stage);
  return (
    <ol className="qa-timeline" aria-label="מצב הטיפול בשאלה">
      {PUBLIC_STAGES.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span className="qa-timeline-mark" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
          <span>{PUBLIC_STAGE_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

export function TopicBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="soft">אין עדיין שאלות לסיכום לפי נושא.</p>;
  return (
    <div className="qa-bars" role="img" aria-label="שאלות לפי נושא">
      {rows.map((r) => (
        <div key={r.label} className="qa-bar-row">
          <span>{r.label}</span>
          <span className="qa-bar-track"><span className="qa-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="ltr">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

const RATES = [0.75, 1, 1.25, 1.5] as const;

/** Real peaks after the file decodes. Flat bars until then — not a drawing of the voice. */
export function WavePlayer({ src, label }: { src: string; label: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setPos(el.duration ? el.currentTime / el.duration : 0);
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [src]);
  useEffect(() => {
    let dead = false;
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void fetch(src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
      if (dead) return;
      const ch = buf.getChannelData(0);
      const n = 42;
      const step = Math.max(1, Math.floor(ch.length / n));
      const raw: number[] = [];
      for (let i = 0; i < n; i++) {
        let m = 0;
        const start = i * step;
        const hop = Math.max(1, Math.floor(step / 40));
        for (let j = start; j < start + step && j < ch.length; j += hop) m = Math.max(m, Math.abs(ch[j] ?? 0));
        raw.push(m);
      }
      const max = Math.max(...raw, 0.001);
      setPeaks(raw.map((v) => Math.max(0.12, v / max)));
    }).catch(() => { if (!dead) setPeaks(null); });
    return () => { dead = true; void ctx.close(); };
  }, [src]);
  const bars = peaks ?? Array.from({ length: 42 }, () => 0.18);
  return (
    <div className="qa-wave">
      <div className="qa-wave-bars" aria-hidden="true">
        {bars.map((h, i) => (
          <span key={i} className={!peaks ? 'pending' : pos > i / bars.length ? 'played' : ''} style={{ transform: `scaleY(${h})` }} />
        ))}
      </div>
      {!peaks && <p className="soft">הגל יוצג לאחר טעינת הקובץ.</p>}
      <audio ref={audio} controls preload="metadata" src={src} aria-label={label} />
      <div className="qa-speeds" role="group" aria-label="מהירות השמעה">
        {RATES.map((r) => (
          <button key={r} type="button" className="chip" aria-pressed={rate === r} onClick={() => { setRate(r); if (audio.current) audio.current.playbackRate = r; }}>
            {r === 1 ? 'רגילה' : r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepList({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol className="qa-steps" aria-label="התקדמות בשליחת השאלה">
      {labels.map((label, i) => (
        <li key={label} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} aria-current={i === step ? 'step' : undefined}>
          <span className="qa-step-n" aria-hidden="true">{i < step ? '✓' : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function ApprovedBadge() {
  return <span className="qa-approved"><Icon name="check" /> אושר בידי הרב</span>;
}
