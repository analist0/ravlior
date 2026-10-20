import { useEffect, useState } from 'react';
import { SITE_URL } from '../app/config.ts';
import { useHead } from '../app/head.ts';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { CardGrid } from '../components/Media.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, formatGregorian, formatHebDate, formatHebrewCalendar, LinkButton, Notice, Pagination, Skeleton } from '../components/ui.tsx';
import { ApprovedBadge, WavePlayer } from '../qa/pieces.tsx';
import { tocFromBlocks, readingLabel, sourceLines } from '../qa/reading.ts';
import { ANSWER_KIND_LABEL, audioFileLabel, plainFromBlocks } from '../shared/responsa.ts';
import type { PublicQuestion } from '../shared/types.ts';
import { useCanonicalRedirect } from '../app/redirect.tsx';
import { questionJsonLd } from '../shared/seo.ts';
import { NotFound } from './NotFound.tsx';

function Bank({ topic, category, heading }: { topic?: string; category?: string; heading: string }) {
  const repo = useRepo();
  const [params, update] = useSearchParams();
  const qParam = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const sort = params.get('sort') === 'latest' ? 'latest' : 'relevance';
  const topicFilter = topic ?? params.get('topic') ?? '';
  const [q, setQ] = useState(qParam);
  useEffect(() => { setQ(qParam); }, [qParam]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  const week = useAsync(() => repo.weekQuestion(), [repo]);
  const own = useAsync(() => repo.searchResponsa({ q: qParam, topic: topicFilter || undefined, category, page, sort }), [qParam, topicFilter, category, page, sort]);
  const topicName = topics.data?.find((t) => t.slug === topicFilter)?.name;
  const catName = categories.data?.find((c) => c.slug === category)?.name;
  useHead({
    title: catName ?? topicName ?? heading,
    description: 'תשובות הלכתיות שאושרו לפרסום, עם חיפוש וסינון לפי נושא.',
    path: category ? `/responsa/cat/${category}` : topic ? `/responsa/topic/${topic}` : '/responsa',
  });
  const crumbs = [{ label: 'בית', to: '/' }, { label: 'שו״ת', to: '/responsa' }, ...(topicName ? [{ label: topicName }] : catName ? [{ label: catName }] : [])];
  const base = category ? `/responsa/cat/${category}` : topic ? `/responsa/topic/${topic}` : '/responsa';
  const showWeek = !topic && !category && !qParam && page === 1 && week.data;
  return (
    <div className="container">
      <Breadcrumbs items={crumbs} />
      <section className="qa-hero">
        <p className="eyebrow">שו״ת</p>
        <div className="qa-rule" />
        <div className="spread">
          <h1>{catName ?? topicName ?? heading}</h1>
          <LinkButton to="/ask" icon="ask">שאלה לרב</LinkButton>
        </div>
        <p className="muted">תשובות שאושרו לפרסום, בהסכמת השואל ולאחר אישור הרב. החיפוש מזהה גם כתיב מלא וחסר.</p>
        <form className="qa-search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q, page: null }); }}>
          <div className="field">
            <label htmlFor="rq">חיפוש בשאלות</label>
            <input id="rq" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: שבת, תפלה" />
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
          <div className="field">
            <label htmlFor="rs">מיון</label>
            <select id="rs" className="input" value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? null : e.target.value, page: null })}>
              <option value="relevance">התאמה לחיפוש</option>
              <option value="latest">אחרונים</option>
            </select>
          </div>
          <button className="btn" type="submit">חיפוש</button>
        </form>
        <p className="soft qa-note">איננו אוספים מספר קריאות, ולכן אין דירוג „הנקראות ביותר”. „אחרונים” ממיין לפי תאריך הפרסום.</p>
      </section>
      {!category && (
        <div className="qa-choices" style={{ marginBottom: 'var(--s-4)' }}>
          {categories.data?.map((c) => <Link key={c.id} className="chip" to={`/responsa/cat/${c.slug}`}>{c.name}</Link>)}
        </div>
      )}
      {showWeek && week.data && (
        <Link className="qa-card qa-week" to={`/responsa/${week.data.slug}`}>
          <p className="eyebrow">שאלת השבוע</p>
          <h2>{week.data.questionText.slice(0, 180)}</h2>
          <p className="soft">{week.data.attribution}</p>
        </Link>
      )}
      {own.error && <ErrorState error={own.error} onRetry={own.reload} />}
      {own.loading && (
        <div className="qa-list" role="status" style={{ marginTop: 'var(--s-4)' }}>
          <span className="sr-only">טוען…</span>
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="qa-card" aria-hidden="true"><Skeleton h={22} /><Skeleton h={14} w="40%" /></div>)}
        </div>
      )}
      {own.data?.items.length === 0 && (
        <EmptyState icon="ask" title="עדיין אין כאן תשובות תואמות" action={<LinkButton to="/ask" icon="ask">שאלה לרב</LinkButton>}>
          כל תשובה מתפרסמת רק בהסכמת השואל ולאחר אישור הרב.
        </EmptyState>
      )}
      <div className="qa-list" style={{ marginTop: 'var(--s-4)' }}>
        {own.data?.items.map((p) => (
          <Link key={p.id} to={`/responsa/${p.slug}`} className="qa-card">
            <h2>{p.questionText.slice(0, 180)}</h2>
            <span className="row">
              {topics.data?.find((t) => t.id === p.topicId) && <Badge>{topics.data.find((t) => t.id === p.topicId)!.name}</Badge>}
              {categories.data?.find((c) => c.id === p.categoryId) && <Badge>{categories.data.find((c) => c.id === p.categoryId)!.name}</Badge>}
              {p.answerKind && <Badge>{ANSWER_KIND_LABEL[p.answerKind]}</Badge>}
              {p.approvedByRabbi && <Badge tone="ok">אושר בידי הרב</Badge>}
              <span className="soft">{p.attribution}</span>
            </span>
          </Link>
        ))}
      </div>
      {own.data && <Pagination page={own.data.page} total={own.data.total} pageSize={own.data.pageSize} hrefFor={(p) => {
        const n = new URLSearchParams(params);
        n.set('page', String(p));
        return `${base}${n.toString() ? `?${n}` : ''}`;
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
  const toast = useToast();
  const r = useAsync(() => repo.getPublicQuestion(params.slug ?? ''), [params.slug]);
  const categories = useAsync(() => repo.listCategories(), [repo]);
  const all = useAsync(() => repo.listPublicQuestions(), [repo]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const missing = !r.loading && !r.error && !r.data;
  useCanonicalRedirect(missing, `/responsa/${params.slug ?? ''}`);
  useHead({
    title: r.data ? r.data.questionText.slice(0, 70) : 'תשובה',
    description: r.data?.questionText.slice(0, 180) ?? null,
    path: r.data ? `/responsa/${r.data.slug}` : `/responsa/${params.slug}`,
    type: 'article',
    jsonLd: r.data ? questionJsonLd(SITE_URL, r.data) : null,
  });
  if (r.loading) return <div className="container section"><CardSkeletons n={1} /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  const p = r.data;
  const cat = categories.data?.find((c) => c.id === p.categoryId);
  const when = p.publishedAt;
  const plain = `${p.questionText} ${plainFromBlocks(p.answerBlocks)}`;
  const toc = tocFromBlocks(p.answerBlocks);
  const sources = sourceLines(p.sources);
  const pageUrl = `${location.origin}/responsa/${p.slug}`;
  return (
    <article className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'שו״ת', to: '/responsa' }, { label: 'תשובה' }]} />
      <p className="eyebrow">שאלה</p>
      <h1 className="qa-answer" style={{ fontSize: 'var(--step-3)' }}>{p.questionText}</h1>
      <div className="qa-meta">
        {p.approvedByRabbi && <ApprovedBadge />}
        {p.answerKind && <Badge>{ANSWER_KIND_LABEL[p.answerKind]}</Badge>}
        {cat && <Badge>{cat.name}</Badge>}
        <span className="soft">{readingLabel(plain)}</span>
      </div>
      <p className="soft">השאלה פורסמה בהסכמת השואל ובעריכה לשמירת פרטיותו</p>
      {when && <p className="soft">תאריך התשובה: {formatHebrewCalendar(when)} · {formatGregorian(when)}</p>}
      <p className="row qa-noprint">
        <a className="btn btn-secondary" href={shareHref(p)} target="_blank" rel="noopener noreferrer">שיתוף בוואטסאפ</a>
        <Button variant="secondary" icon="copy" onClick={() => void navigator.clipboard.writeText(pageUrl).then(() => toast('הקישור הועתק'), () => toast('העתקה נכשלה', { tone: 'error' }))}>העתקת קישור</Button>
        <Button variant="ghost" onClick={() => window.print()}>הדפסה</Button>
      </p>
      {toc.length >= 2 && (
        <nav className="qa-toc qa-noprint" aria-label="תוכן העניינים">
          <strong>תוכן</strong>
          <ol>
            {toc.map((item) => <li key={item.id} style={{ marginInlineStart: item.level === 3 ? 'var(--s-4)' : 0 }}><a href={`#${item.id}`}>{item.text}</a></li>)}
          </ol>
        </nav>
      )}
      <section className="qa-panel qa-answer" style={{ marginTop: 'var(--s-5)' }} aria-labelledby="h-ans">
        <h2 id="h-ans">תשובה</h2>
        <BlockRenderer blocks={p.answerBlocks} anchorIds />
        {p.answerAudioUrl && <WavePlayer src={p.answerAudioUrl} label={audioFileLabel(p.answerAudioUrl)} />}
        {sources.length > 0 && (
          <>
            <h3>מראי מקומות</h3>
            <div className="qa-sources">
              {sources.map((line, i) => <p key={i} className="qa-source"><b>{i + 1}</b>{line}</p>)}
            </div>
          </>
        )}
        {p.tags && p.tags.length > 0 && <p className="row">{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</p>}
        <p className="soft" style={{ marginTop: 'var(--s-4)' }}>{p.attribution}</p>
      </section>
      {p.related && p.related.length > 0 && (
        <section style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-rel">
          <h2 id="h-rel" style={{ fontSize: 'var(--step-1)' }}>שאלות קרובות</h2>
          <div className="qa-list">
            {p.related.map((x) => <Link key={x.id} className="qa-card" to={`/responsa/${x.slug}`}><h3>{x.questionText.slice(0, 140)}</h3></Link>)}
          </div>
        </section>
      )}
      <Notice>תשובה זו ניתנה לשואל מסוים ובנסיבות מסוימות. לשאלה מעשית יש לפנות לרב.</Notice>
    </article>
  );
}
