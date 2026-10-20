import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageIntro } from '../components/PageIntro.tsx';
import { Breadcrumbs, ErrorState, Skeleton } from '../components/ui.tsx';
import { ContactForm } from './ContactForm.tsx';
import { NotFound } from './NotFound.tsx';

export default function ContentPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getPage(params.slug ?? ''), [params.slug]);
  useHead({ title: r.data?.title ?? '', description: r.data?.description ?? null, path: `/p/${params.slug}` });
  if (r.loading) return <div className="container section"><Skeleton h={40} w="40%" /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: r.data.title }]} />
      <PageIntro title={r.data.title} lede={params.slug === 'contact' ? 'שאלה הלכתית והודעה לצוות האתר הן שתי תיבות נפרדות.' : undefined} />
      {params.slug === 'contact' && (
        <div className="choice-grid">
          <Link to="/ask" className="action-tile">
            <Icon name="ask" />
            <strong>שאלה הלכתית</strong>
            <span>לרב, גם בעילום שם. התשובה אינה מתפרסמת בלי הסכמה.</span>
          </Link>
          <a href="#contact-form" className="action-tile">
            <Icon name="inbox" />
            <strong>פנייה לאתר</strong>
            <span>תקלה, הערה או בקשה לצוות. לא תשובה הלכתית.</span>
          </a>
        </div>
      )}
      <div className="torah-sheet"><BlockRenderer blocks={r.data.blocks} reading /></div>
      {params.slug === 'contact' && <div id="contact-form" style={{ marginTop: 'var(--s-6)' }}><ContactForm /></div>}
    </div>
  );
}
