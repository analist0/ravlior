import { useState } from 'react';
import { errorMessage, useRepo, type ImportPreview } from '../data/repo.ts';
import { useConfirm } from '../components/Dialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Button, Notice, TextArea } from '../components/ui.tsx';
import { rowsFromCsv, rowsFromJson } from '../shared/importer.ts';
import { canEdit } from '../shared/workflow.ts';
import { useAdmin } from './AdminApp.tsx';

export default function ImportExport() {
  const repo = useRepo();
  const { roles } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = async () => {
    setError(null); setPreview(null);
    try {
      const rows = text.trim().startsWith('[') || text.trim().startsWith('{') ? rowsFromJson(text) : rowsFromCsv(text);
      if (!rows.length) throw new Error('לא נמצאו שורות. נדרשת שורת כותרות: title,type,url,summary,speaker,duration');
      if (rows.length > 500) throw new Error('עד 500 שורות בכל ייבוא');
      setPreview(await repo.admin.previewImport(rows));
    } catch (e) { setError(errorMessage(e)); }
  };
  const commit = async () => {
    if (!preview) return;
    const n = preview.filter((p) => p.action === 'create').length;
    if (!(await confirm({ title: `ייבוא ${n} פריטים חדשים`, body: 'הפריטים ייווצרו כטיוטות. כפילויות ושורות לא תקינות ידולגו.', confirmLabel: 'ייבוא' }))) return;
    setBusy(true);
    try {
      const res = await repo.admin.commitImport(preview.map((p) => p.row));
      toast(`נוצרו ${res.created} טיוטות, דולגו ${res.skipped}`);
      setPreview(null); setText('');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const exportAll = async () => {
    try {
      const data = await repo.admin.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `or-hameir-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast(errorMessage(e), { tone: 'error' }); }
  };

  return (
    <div>
      <h1>ייבוא וייצוא</h1>
      <section className="panel" aria-labelledby="h-exp">
        <h2 id="h-exp">ייצוא</h2>
        <p className="soft">קובץ JSON של כל התוכן הציבורי והמבנה (ללא שאלות פרטיות, יומן או משתמשים). לגיבוי מלא ראו BACKUP_RESTORE.md.</p>
        <Button variant="secondary" icon="download" onClick={() => void exportAll()}>הורדת ייצוא</Button>
      </section>
      {canEdit(roles) && (
        <section className="panel" style={{ marginTop: 'var(--s-4)' }} aria-labelledby="h-imp">
          <h2 id="h-imp">ייבוא (CSV או JSON)</h2>
          <Notice>ייבוא מטא־דאטה בלבד. זיהוי כפילויות לפי מזהה YouTube וכתובת קנונית. הפריטים נוצרים כטיוטות לבדיקה.</Notice>
          <TextArea label="הדביקו CSV או JSON" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 160, marginTop: 'var(--s-3)' }}
            hint="CSV: title,type,url,summary,speaker,duration · type: video/audio/short/live/book/leaflet/article/answer" />
          <div className="row" style={{ marginTop: 'var(--s-3)' }}>
            <label className="btn btn-secondary">
              טעינת קובץ
              <input type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setText); }} />
            </label>
            <Button onClick={() => void parse()}>תצוגה מקדימה</Button>
          </div>
          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          {preview && (
            <>
              <p style={{ marginTop: 'var(--s-4)' }}>
                <Badge tone="ok">{preview.filter((p) => p.action === 'create').length} חדשים</Badge>{' '}
                <Badge tone="warn">{preview.filter((p) => p.action === 'duplicate').length} כפילויות</Badge>{' '}
                <Badge tone="danger">{preview.filter((p) => p.action === 'invalid').length} לא תקינים</Badge>
              </p>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>#</th><th>כותרת</th><th>סוג</th><th>פעולה</th><th>סיבה</th></tr></thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i}><td>{i + 1}</td><td>{p.row.title}</td><td>{p.row.type}</td>
                        <td>{p.action === 'create' ? <Badge tone="ok">יצירה</Badge> : p.action === 'duplicate' ? <Badge tone="warn">כפילות</Badge> : <Badge tone="danger">שגוי</Badge>}</td>
                        <td>{p.reason ?? ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button busy={busy} onClick={() => void commit()} style={{ marginTop: 'var(--s-3)' }} disabled={!preview.some((p) => p.action === 'create')}>ייבוא</Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
