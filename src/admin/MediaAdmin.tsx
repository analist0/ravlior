import { useRef, useState } from 'react';
import { errorMessage, useRepo, type UploadResult } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { useToast } from '../components/Toast.tsx';
import { Button, Notice, SelectField, TextField } from '../components/ui.tsx';
import { BUCKETS, checkUpload, signedUrlValid, type BucketId } from '../shared/upload-policy.ts';
import { useAdmin } from './AdminApp.tsx';
import { canEdit } from '../shared/workflow.ts';

/** Browser → Supabase Storage directly (TUS resumable for large files). Never through our server. */
export function Uploader({ bucket, accept, onDone }: { bucket: BucketId; accept?: string; onDone: (r: UploadResult) => void }) {
  const repo = useRepo();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const pick = async (file: File) => {
    setError(null);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const check = checkUpload(bucket, file, head);
    if (!check.ok) { setError(check.error!); return; }
    ctrl.current = new AbortController();
    setPct(0);
    try {
      const res = await repo.admin.upload(bucket, file, setPct, ctrl.current.signal);
      toast('הקובץ הועלה');
      onDone(res);
    } catch (e) {
      setError((e as Error).name === 'AbortError' ? 'ההעלאה בוטלה' : errorMessage(e));
    } finally {
      setPct(null);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="stack">
      <input ref={input} type="file" accept={accept} className="input" aria-label={`בחירת קובץ ל${BUCKETS[bucket].label}`} disabled={pct !== null}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
      {pct !== null && (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="progress grow" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="התקדמות העלאה"><span style={{ width: `${pct}%` }} /></div>
          <span className="kbd">{pct}%</span>
          <Button size="sm" variant="ghost" onClick={() => ctrl.current?.abort()}>ביטול</Button>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error} <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>לנסות שוב</Button></p>}
      <span className="soft">עד {Math.round(BUCKETS[bucket].maxBytes / 1048576)}MB. סוג הקובץ נבדק לפי תוכנו. SVG/HTML אינם מותרים.</span>
    </div>
  );
}

export default function MediaScreen() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const toast = useToast();
  const [bucket, setBucket] = useState<BucketId>('public-media');
  const [last, setLast] = useState<UploadResult[]>([]);
  const [signed, setSigned] = useState<{ url: string; expiresAt: number } | null>(null);
  const [probeUrl, setProbeUrl] = useState('');
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null);
  const [probeErr, setProbeErr] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const doProbe = async () => {
    setProbing(true); setProbe(null); setProbeErr(null);
    try {
      setProbe(await repo.admin.probeUrl(probeUrl));
    } catch (e) { setProbeErr(errorMessage(e)); } finally { setProbing(false); }
  };

  return (
    <div>
      <h1>מדיה והעלאות</h1>
      <Notice>
        סדר עדיפות: נגן רשמי (YouTube) ← קישור ישיר מורשה ← קובץ שקיבלנו מצוות הרב ← קישור למקור. אין הורדת אודיו מ-YouTube ואין עקיפת הגנות.
        אחסון חינמי אינו ארכיון וידאו בלתי מוגבל — בדקו מכסות לפני העלאה גדולה.
      </Notice>
      {!canEdit(roles) ? <Notice tone="warn" icon="lock">העלאה מותרת לעורכים ומנהלים בלבד.</Notice> : (
        <section className="panel" style={{ marginTop: 'var(--s-4)' }} aria-labelledby="h-up">
          <h2 id="h-up"><Icon name="upload" /> העלאת קובץ</h2>
          <div className="form-grid two">
            <SelectField label="יעד" value={bucket} onChange={(e) => setBucket(e.target.value as BucketId)}>
              {(Object.keys(BUCKETS) as BucketId[]).filter((b) => b !== 'private-submissions').map((b) => <option key={b} value={b}>{BUCKETS[b].label} ({BUCKETS[b].public ? 'ציבורי' : 'פרטי'})</option>)}
            </SelectField>
            <Uploader bucket={bucket} onDone={(r) => setLast((l) => [r, ...l])} />
          </div>
          {last.length > 0 && (
            <ul className="reorder-list" style={{ marginTop: 'var(--s-3)' }}>
              {last.map((r) => (
                <li key={r.path}>
                  <span className="kbd grow">{r.bucket}/{r.path}</span>
                  {r.publicUrl ? (
                    <Button size="sm" variant="secondary" icon="copy" onClick={() => void navigator.clipboard.writeText(r.publicUrl!).then(() => toast('הקישור הועתק'))}>העתקת קישור</Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => void repo.admin.signedUrl(r.bucket, r.path, 300).then(setSigned, (e) => toast(errorMessage(e), { tone: 'error' }))}>קישור זמני (5 דק׳)</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {signed && (
            <p className="soft" style={{ marginTop: 'var(--s-2)' }}>
              {signedUrlValid(signed.expiresAt) ? <a href={signed.url} target="_blank" rel="noopener noreferrer">פתיחת הקובץ הפרטי</a> : 'הקישור הזמני פג — צרו חדש.'} · קישור זמני אינו נשמר כקישור קבוע.
            </p>
          )}
          <p className="soft">אחרי ההעלאה: פתחו את פריט התוכן ← „מקורות מדיה” ← הוסיפו את הקישור עם אספקה „קובץ באחסון שלנו” וסוג MIME.</p>
        </section>
      )}
      <section className="panel" style={{ marginTop: 'var(--s-4)' }} aria-labelledby="h-probe">
        <h2 id="h-probe"><Icon name="link" /> בדיקת קישור ישיר לפני ייבוא</h2>
        <p className="soft">השרת בודק את הקישור עם הגנות SSRF (https בלבד, רשימת מארחים מותרים, חסימת כתובות פנימיות, בדיקת כל הפניה, מגבלת זמן וגודל) ומחזיר סוג וגודל. ההורדה עצמה מתבצעת בכלי הייבוא המבוקר (ראו README).</p>
        <div className="row" style={{ alignItems: 'end' }}>
          <div className="grow"><TextField label="קישור ישיר (https)" dir="ltr" value={probeUrl} onChange={(e) => setProbeUrl(e.target.value)} /></div>
          <Button variant="secondary" busy={probing} onClick={() => void doProbe()}>בדיקה</Button>
        </div>
        {probeErr && <p role="alert" style={{ color: 'var(--danger)' }}>{probeErr}</p>}
        {probe && <pre className="kbd" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg-sunken)', padding: 'var(--s-3)', borderRadius: 'var(--r-2)' }}>{JSON.stringify(probe, null, 2)}</pre>}
      </section>
    </div>
  );
}
