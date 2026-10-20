import { useState } from 'react';
import { errorMessage, useRepo } from '../data/repo.ts';
import { useToast } from '../components/Toast.tsx';
import { Button, Notice, TextArea, TextField } from '../components/ui.tsx';

export function ContactForm() {
  const repo = useRepo();
  const toast = useToast();
  const [startedAt] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await repo.submitContact({ name: name || null, email, subject, body, website, startedAt });
      setDone(true);
      toast('הפנייה נשמרה. הצוות יראה אותה בתיבה.');
    } catch (e) {
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };
  if (done) return <Notice tone="ok" icon="check">הפנייה התקבלה ונשמרה לצוות האתר. אין כאן כתובת רשמית של הרב.</Notice>;
  return (
    <form className="form-grid qa-panel contact-letter" onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-labelledby="h-contact-form">
      <h2 id="h-contact-form">מכתב לצוות האתר</h2>
      <p className="soft">פרטי קשר רשמיים של הרב ושל המוסדות לא אומתו ולכן אינם מוצגים. הפנייה נשמרת כאן לצוות. לשאלה הלכתית יש טופס נפרד.</p>
      {error && <div role="alert"><Notice tone="warn" icon="alert">{error}</Notice></div>}
      <TextField label="שם (רשות)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <TextField label="דוא״ל" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <TextField label="נושא" required value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TextArea label="הפנייה" required value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 140 }} />
      <div className="sr-only" aria-hidden="true">
        <label>אתר<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <Button type="submit" busy={busy} icon="inbox">שליחה</Button>
    </form>
  );
}
