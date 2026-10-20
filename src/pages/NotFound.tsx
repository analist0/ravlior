import { useHead } from '../app/head.ts';
import { requestSearch } from '../components/Layout.tsx';
import { EmptyState, LinkButton } from '../components/ui.tsx';

export function NotFound() {
  useHead({ title: 'העמוד לא נמצא', description: 'העמוד שחיפשתם אינו באתר.', noindex: true });
  return (
    <div className="container miss">
      <p className="miss-num" aria-hidden="true">404</p>
      <h1>העמוד לא נמצא</h1>
      <p className="muted">ייתכן שהקישור שגוי או שהפריט הוסר. אפשר לחפש בכל הספרייה, או לחזור למדפים.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={() => requestSearch()}>חיפוש</button>
        <LinkButton to="/" variant="secondary">לדף הבית</LinkButton>
        <LinkButton to="/library" variant="secondary">לספרייה</LinkButton>
        <LinkButton to="/topics" variant="ghost">לנושאים</LinkButton>
      </div>
    </div>
  );
}

export function ModuleOff({ name }: { name: string }) {
  useHead({ title: name, noindex: true });
  return (
    <div className="container section">
      <EmptyState icon="lock" title={`האזור „${name}” אינו פעיל כרגע`} action={<LinkButton to="/">לדף הבית</LinkButton>}>ניתן להפעיל אותו ממסך המודולים בניהול.</EmptyState>
    </div>
  );
}
