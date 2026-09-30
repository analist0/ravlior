import { useHead } from '../app/head.ts';
import { EmptyState, LinkButton } from '../components/ui.tsx';

export function NotFound() {
  useHead({ title: 'העמוד לא נמצא', noindex: true });
  return (
    <div className="container section">
      <EmptyState icon="search" title="העמוד לא נמצא" action={<div className="row" style={{ justifyContent: 'center' }}><LinkButton to="/">לדף הבית</LinkButton><LinkButton to="/library" variant="secondary">לספרייה</LinkButton></div>}>
        ייתכן שהקישור שגוי או שהפריט הוסר.
      </EmptyState>
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
