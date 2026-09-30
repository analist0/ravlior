import { useEffect, useState } from 'react';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { CardGrid } from '../components/Media.tsx';
import { Badge, Breadcrumbs, CardSkeletons, EmptyState, ErrorState, LinkButton, Notice, formatHebDate } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';

export function ResponsaList() {
  const repo = useRepo();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const own = useAsync(() => repo.listPublicQuestions(dq), [dq]);
  const ext = useAsync(() => repo.listContent({ type: 'answer', q: dq, pageSize: 50 }), [dq]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  useHead({ title: 'שאלות ותשובות', description: 'תשובות הלכתיות של הרב ליאור כהן: תשובות שאושרו לפרסום ותשובות במאגרים חיצוניים עם ייחוס מדויק.', path: '/responsa' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שו״ת' }]} />
      <div className="spread"><h1>שאלות ותשובות</h1><LinkButton to="/ask" icon="ask">שאלה לרב</LinkButton></div>
      <div className="field" style={{ maxWidth: 520, marginBottom: 'var(--s-5)' }}>
        <label htmlFor="rq">חיפוש בשאלות</label>
        <input id="rq" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: שבת, תפילה" />
      </div>
      <section aria-labelledby="h-own">
        <h2 id="h-own">תשובות שאושרו לפרסום באתר</h2>
        {own.error && <ErrorState error={own.error} onRetry={own.reload} />}
        {own.loading && <CardSkeletons n={2} />}
        {own.data?.length === 0 && <p className="soft">עדיין לא פורסמו כאן תשובות. כל תשובה מתפרסמת רק בהסכמת השואל ולאחר אישור הרב.</p>}
        <div className="list-rows">
          {own.data?.map((p) => (
            <Link key={p.id} to={`/responsa/${p.slug}`} className="row-item" style={{ gridTemplateColumns: '1fr', color: 'var(--text)', textDecoration: 'none' }}>
              <strong>{p.questionText.slice(0, 160)}</strong>
              <span className="row">{topics.data?.find((t) => t.id === p.topicId) && <Badge>{topics.data.find((t) => t.id === p.topicId)!.name}</Badge>}<span className="soft">{p.attribution}</span></span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section" aria-labelledby="h-ext">
        <h2 id="h-ext">תשובות במאגרים חיצוניים</h2>
        <Notice>התשובות מתארחות במאגר השו״ת של כסא רחמים. באחת מהן מופיעה הערה של הרב בלבד, והיא מסומנת כך.</Notice>
        <div style={{ height: 'var(--s-4)' }} />
        {ext.loading && <CardSkeletons n={2} />}
        {ext.data && (ext.data.items.length ? <CardGrid items={ext.data.items} view="list" /> : <EmptyState title="לא נמצאו תשובות" />)}
      </section>
    </div>
  );
}

export function ResponsaItem({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getPublicQuestion(params.slug ?? ''), [params.slug]);
  useHead({ title: r.data ? r.data.questionText.slice(0, 60) : 'תשובה', description: r.data?.questionText.slice(0, 160) ?? null, path: `/responsa/${params.slug}` });
  if (r.loading) return <div className="container section"><CardSkeletons n={1} /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  const p = r.data;
  return (
    <article className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שו״ת', to: '/responsa' }, { label: 'תשובה' }]} />
      <p className="eyebrow">שאלה</p>
      <h1 style={{ fontSize: 'var(--step-3)' }} className="prose">{p.questionText}</h1>
      <p className="soft">השאלה פורסמה בהסכמת השואל ובעריכה לשמירת פרטיותו{p.publishedAt ? ` · ${formatHebDate(p.publishedAt)}` : ''}</p>
      <section className="side-card prose" style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-ans">
        <h2 id="h-ans" style={{ fontSize: 'var(--step-2)' }}>תשובה</h2>
        <BlockRenderer blocks={p.answerBlocks} />
        {p.answerAudioUrl && <audio controls preload="none" src={p.answerAudioUrl} style={{ width: '100%' }} aria-label="תשובה קולית" />}
        <p className="soft" style={{ marginTop: 'var(--s-4)' }}>{p.attribution}{p.approvedByRabbi ? ' · אושר על ידי הרב' : ''}</p>
      </section>
      <Notice>תשובה זו ניתנה לשואל מסוים ובנסיבות מסוימות. לשאלה מעשית יש לפנות לרב.</Notice>
    </article>
  );
}
