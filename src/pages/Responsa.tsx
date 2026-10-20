import { useEffect, useState } from 'react';
import { useHead } from '../app/head.ts';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { CardGrid } from '../components/Media.tsx';
import { Badge, Breadcrumbs, CardSkeletons, EmptyState, ErrorState, LinkButton, Notice, Pagination, formatGregorian, formatHebrewCalendar } from '../components/ui.tsx';
import { ANSWER_KIND_LABEL, audioFileLabel } from '../shared/responsa.ts';
import type { PublicQuestion } from '../shared/types.ts';
import { NotFound } from './NotFound.tsx';

function Bank({ topic, category, heading }: { topic?: string; category?: string; heading: string }) {
  const repo = useRepo();
  const [params, update] = useSearchParams();
  const qParam = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const topicFilter = topic ?? params.get('topic') ?? '';
  const [q, setQ] = useState(qParam);
  useEffect(() => { setQ(qParam); }, [qParam]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  const own = useAsync(() => repo.searchResponsa({ q: qParam, topic: topicFilter || undefined, category, page }), [qParam, topicFilter, category, page]);
  const topicName = topics.data?.find((t) => t.slug === topicFilter)?.name;
  const catName = categories.data?.find((c) => c.slug === category)?.name;
  useHead({
    title: catName ?? topicName ?? heading,
    description: 'תשובות הלכתיות שאושרו לפרסום, עם חיפוש וסינון לפי נושא.',
    path: category ? `/responsa/cat/${category}` : topic ? `/responsa/topic/${topic}` : '/responsa',
  });
  const crumbs = [{ label: 'בית', to: '/' }, { label: 'שו״ת', to: '/responsa' }, ...(topicName ? [{ label: topicName }] : catName ? [{ label: catName }] : [])];
  return (
    <div className="container">
      <Breadcrumbs items={crumbs} />
      <div className="spread"><h1>{catName ?? topicName ?? heading}</h1><LinkButton to="/ask" icon="ask">שאלה לרב</LinkButton></div>
      <form className="row" role="search" style={{ margin: 'var(--s-4) 0', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); update({ q, page: null }); }}>
        <div className="field" style={{ flex: 1, maxWidth: 420 }}>
          <label htmlFor="rq">חיפוש בשאלות</label>
          <input id="rq" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: שבת, תפילה" />
        </div>
        {!topic && !category && (
          <div className="field">
            <label htmlFor="rt">נושא</label>
            <select id="rt" className="input" value={topicFilter} onChange={(e) => update({ topic: e.target.value || null, page: null })}>
              <option value="">כל הנושאים</option>
              {topics.data?.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn" type="submit">חיפוש</button>
      </form>
      {categories.data && categories.data.length > 0 && !category && (
        <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
          {categories.data.map((c) => <Link key={c.id} className="chip" to={`/responsa/cat/${c.slug}`}>{c.name}</Link>)}
        </div>
      )}
      {own.error && <ErrorState error={own.error} onRetry={own.reload} />}
      {own.loading && <CardSkeletons n={2} />}
      {own.data?.items.length === 0 && <p className="soft">עדיין לא פורסמו כאן תשובות התואמות לחיפוש. כל תשובה מתפרסמת רק בהסכמת השואל ולאחר אישור הרב.</p>}
      <div className="list-rows">
        {own.data?.items.map((p) => (
          <Link key={p.id} to={`/responsa/${p.slug}`} className="row-item" style={{ gridTemplateColumns: '1fr', color: 'var(--text)', textDecoration: 'none' }}>
            <strong>{p.questionText.slice(0, 160)}</strong>
            <span className="row">
              {topics.data?.find((t) => t.id === p.topicId) && <Badge>{topics.data.find((t) => t.id === p.topicId)!.name}</Badge>}
              {p.answerKind && <Badge>{ANSWER_KIND_LABEL[p.answerKind]}</Badge>}
              <span className="soft">{p.attribution}</span>
            </span>
          </Link>
        ))}
      </div>
      {own.data && <Pagination page={own.data.page} total={own.data.total} pageSize={own.data.pageSize} hrefFor={(p) => {
        const n = new URLSearchParams(params);
        n.set('page', String(p));
        const s = n.toString();
        const base = category ? `/responsa/cat/${category}` : topic ? `/responsa/topic/${topic}` : '/responsa';
        return `${base}${s ? `?${s}` : ''}`;
      }} />}
    </div>
  );
}

export function ResponsaList() {
  const repo = useRepo();
  const [params] = useSearchParams();
  const dq = params.get('q') ?? '';
  const ext = useAsync(() => repo.listContent({ type: 'answer', q: dq, pageSize: 50 }), [dq]);
  return (
    <>
      <Bank heading="שאלות ותשובות" />
      <div className="container section">
        <section aria-labelledby="h-ext">
          <h2 id="h-ext">תשובות במאגרים חיצוניים</h2>
          <Notice>התשובות מתארחות במאגר השו״ת של כסא רחמים. באחת מהן מופיעה הערה של הרב בלבד, והיא מסומנת כך.</Notice>
          <div style={{ height: 'var(--s-4)' }} />
          {ext.loading && <CardSkeletons n={2} />}
          {ext.data && (ext.data.items.length ? <CardGrid items={ext.data.items} view="list" /> : <EmptyState title="לא נמצאו תשובות" />)}
        </section>
      </div>
    </>
  );
}

export function ResponsaTopic({ params }: { params: Record<string, string> }) {
  return <Bank topic={params.slug} heading="שו״ת לפי נושא" />;
}

export function ResponsaCategory({ params }: { params: Record<string, string> }) {
  return <Bank category={params.slug} heading="שו״ת לפי מדף" />;
}

function shareHref(p: PublicQuestion): string {
  const url = `${location.origin}/responsa/${p.slug}`;
  return `https://wa.me/?text=${encodeURIComponent(`${p.questionText.slice(0, 180)}\n${url}`)}`;
}

export function ResponsaItem({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getPublicQuestion(params.slug ?? ''), [params.slug]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  useHead({ title: r.data ? r.data.questionText.slice(0, 60) : 'תשובה', description: r.data?.questionText.slice(0, 160) ?? null, path: `/responsa/${params.slug}` });
  if (r.loading) return <div className="container section"><CardSkeletons n={1} /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  const p = r.data;
  const cat = categories.data?.find((c) => c.id === p.categoryId);
  const when = p.publishedAt;
  return (
    <article className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שו״ת', to: '/responsa' }, { label: 'תשובה' }]} />
      <p className="eyebrow">שאלה</p>
      <h1 style={{ fontSize: 'var(--step-3)' }} className="prose">{p.questionText}</h1>
      <p className="soft">
        השאלה פורסמה בהסכמת השואל ובעריכה לשמירת פרטיותו
        {p.answerKind ? ` · תשובה ${ANSWER_KIND_LABEL[p.answerKind]}` : ''}
        {cat ? ` · ${cat.name}` : ''}
      </p>
      {when && (
        <p className="soft">
          תאריך התשובה: {formatHebrewCalendar(when)} · {formatGregorian(when)}
        </p>
      )}
      <p><a className="btn btn-secondary" href={shareHref(p)} target="_blank" rel="noopener noreferrer">שיתוף בוואטסאפ</a></p>
      <section className="side-card prose" style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-ans">
        <h2 id="h-ans" style={{ fontSize: 'var(--step-2)' }}>תשובה</h2>
        <BlockRenderer blocks={p.answerBlocks} />
        {p.answerAudioUrl && <audio controls preload="none" src={p.answerAudioUrl} style={{ width: '100%' }} aria-label={audioFileLabel(p.answerAudioUrl)} />}
        {p.sources && (
          <>
            <h3>מראי מקומות</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{p.sources}</p>
          </>
        )}
        {p.tags && p.tags.length > 0 && <p className="row">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</p>}
        <p className="soft" style={{ marginTop: 'var(--s-4)' }}>{p.attribution}{p.approvedByRabbi ? ' · אושר על ידי הרב' : ''}</p>
      </section>
      {p.related && p.related.length > 0 && (
        <section style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-rel">
          <h2 id="h-rel" style={{ fontSize: 'var(--step-1)' }}>שאלות קרובות</h2>
          <ul>
            {p.related.map((x) => <li key={x.id}><Link to={`/responsa/${x.slug}`}>{x.questionText.slice(0, 140)}</Link></li>)}
          </ul>
        </section>
      )}
      <Notice>תשובה זו ניתנה לשואל מסוים ובנסיבות מסוימות. לשאלה מעשית יש לפנות לרב.</Notice>
    </article>
  );
}
