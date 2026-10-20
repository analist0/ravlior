import { useMemo, useState } from 'react';
import { useHead } from '../app/head.ts';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { PageIntro } from '../components/PageIntro.tsx';
import { Badge, Breadcrumbs, Button, EmptyState, ErrorState, Notice, Skeleton, formatHebDate } from '../components/ui.tsx';
import { eventIcs, eventIsoDate, eventJsonLd, externalHref, googleCalendarUrl, hebrewDateFromIso, linkHost, monthGrid, partitionEvents, todayIso } from '../shared/sections.ts';
import type { EventRecord, Institution } from '../shared/types.ts';

function downloadIcs(event: EventRecord) {
  const ics = eventIcs(event, `${location.origin}/events#${event.slug}`);
  if (!ics) return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.slug || 'event'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function EventCard({ event, institutions }: { event: EventRecord; institutions: Institution[] }) {
  const iso = eventIsoDate(event);
  const heb = iso ? hebrewDateFromIso(iso) : null;
  const map = externalHref(event.mapUrl);
  const google = googleCalendarUrl(event);
  const inst = institutions.find((i) => i.id === event.institutionId);
  return (
    <li className="event-card" id={event.slug}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>{event.title}</h3>
        {iso ? <Badge tone="accent">{formatHebDate(iso)}{heb ? ` · ${heb.dayLabel} ב${heb.monthName}` : ''}</Badge> : <Badge>תאריך לא נקבע במקור</Badge>}
      </div>
      {event.dateText && !iso && <p className="soft" style={{ margin: 0 }}>{event.dateText}</p>}
      {event.summary && <p style={{ margin: 0 }}>{event.summary}</p>}
      <div className="row" style={{ gap: 8 }}>
        {inst && <Link to={`/institutions#${inst.slug}`}>{inst.name}</Link>}
        {event.locationLabel && <span>{event.locationLabel}</span>}
        {map && <a href={map} target="_blank" rel="noopener noreferrer">מפה <Icon name="external" /></a>}
      </div>
      {iso && (
        <div className="row">
          <Button size="sm" variant="secondary" icon="download" onClick={() => downloadIcs(event)}>הוספה ליומן (ics)</Button>
          {google && <a className="btn btn-secondary btn-sm" href={google} target="_blank" rel="noopener noreferrer"><Icon name="calendar" /> יומן Google</a>}
        </div>
      )}
      {event.sourceUrls.length > 0 && (
        <p className="soft" style={{ margin: 0 }}>
          מקורות: {event.sourceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{linkHost(u)} </a>)}
        </p>
      )}
    </li>
  );
}

export default function EventsPage() {
  const repo = useRepo();
  const events = useAsync(() => repo.listEvents(), [repo]);
  const inst = useAsync(() => repo.listInstitutions(), [repo]);
  const [params, update] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : params.get('view') === 'past' ? 'past' : 'upcoming';
  const institution = params.get('institution') ?? '';
  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y!, month: m! };
  });
  const filtered = (events.data ?? []).filter((e) => !institution || inst.data?.find((i) => i.slug === institution)?.id === e.institutionId);
  const groups = partitionEvents(filtered, today);
  const grid = monthGrid(cursor.year, cursor.month);
  const byDay = new Map<string, EventRecord[]>();
  for (const e of filtered) {
    const iso = eventIsoDate(e);
    if (!iso) continue;
    const list = byDay.get(iso) ?? [];
    list.push(e);
    byDay.set(iso, list);
  }
  const jsonLd = useMemo(() => {
    const items = (events.data ?? []).map((e) => eventJsonLd(e, null)).filter((x): x is Record<string, unknown> => !!x);
    return items.length ? items : undefined;
  }, [events.data]);
  useHead({
    title: 'אירועים',
    description: 'פעילות מתועדת של הרב ומוסדות אור המאיר. תאריך מוצג רק כשצוין במקור. אירועים ללא תאריך אינם נכנסים ללוח.',
    path: '/events',
    jsonLd,
  });
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  };
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מוסדות', to: '/institutions' }, { label: 'אירועים' }]} />
      <PageIntro mark eyebrow="מוסדות" title="אירועים" lede="ארכיון פעילות שתועדה במקורות. „קרוב” ו„עבר” נקבעים רק כשיש תאריך מפורש. בלי תאריך הפריט נשאר ברשימה נפרדת, בלי ניחוש." />
      <div className="row" style={{ margin: 'var(--s-4) 0' }}>
        <div className="segmented" role="group" aria-label="תצוגת אירועים">
          <button type="button" aria-pressed={view === 'upcoming'} onClick={() => update({ view: null })}>קרובים</button>
          <button type="button" aria-pressed={view === 'past'} onClick={() => update({ view: 'past' })}>עבר</button>
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => update({ view: 'calendar' })}>לוח עברי</button>
        </div>
        <label className="field" style={{ minWidth: 180 }}>
          <span className="field-label">מוסד</span>
          <select className="select" value={institution} onChange={(e) => update({ institution: e.target.value || null })}>
            <option value="">הכול</option>
            {inst.data?.map((i) => <option key={i.id} value={i.slug}>{i.name}</option>)}
          </select>
        </label>
      </div>
      {events.error && <ErrorState error={events.error} onRetry={events.reload} />}
      {events.loading && <Skeleton h={240} />}
      {events.data && view === 'calendar' && (
        <section aria-labelledby="h-cal">
          <div className="cal-head">
            <h2 id="h-cal" style={{ margin: 0 }}>{grid.label}</h2>
            <div className="row">
              <Button size="sm" variant="secondary" onClick={() => shift(-1)}>חודש קודם</Button>
              <Button size="sm" variant="secondary" onClick={() => shift(1)}>חודש הבא</Button>
              <Button size="sm" variant="ghost" onClick={() => { const [y, m] = today.split('-').map(Number); setCursor({ year: y!, month: m! }); }}>היום</Button>
            </div>
          </div>
          <div className="cal-grid" style={{ marginTop: 'var(--s-3)' }}>
            {grid.weekdayLabels.map((w) => <div key={w} className="cal-dow">{w}</div>)}
            {grid.cells.map((c) => {
              const hits = byDay.get(c.iso) ?? [];
              return (
                <div key={c.iso} className="cal-day" data-out={!c.inMonth} data-today={c.iso === today}>
                  <strong>{c.gregorian}</strong>
                  {c.hebrew && <small>{c.hebrew.dayLabel} {c.hebrew.monthName}</small>}
                  {hits.slice(0, 2).map((e) => <a key={e.id} href={`#${e.slug}`} className="cal-event">{e.title}</a>)}
                  {hits.length > 2 && <span className="cal-more">+{hits.length - 2}</span>}
                </div>
              );
            })}
          </div>
          <p className="soft">נקודה מסמנת אירוע שתאריכו נשמר. ימים בלי נקודה אינם „ריקים מפעילות” — פשוט אין להם תאריך מאומת.</p>
        </section>
      )}
      {events.data && view !== 'calendar' && (
        <section>
          <h2>{view === 'past' ? 'פעילות שתאריכה עבר' : 'פעילות עם תאריך מהיום ואילך'}</h2>
          {(view === 'past' ? groups.past : groups.upcoming).length === 0
            ? <EmptyState icon="calendar" title={view === 'past' ? 'אין אירועים מתוארכים בעבר' : 'אין אירועים מתוארכים קרובים'} />
            : <ul className="event-list">{(view === 'past' ? groups.past : groups.upcoming).map((e) => <EventCard key={e.id} event={e} institutions={inst.data ?? []} />)}</ul>}
          {view === 'upcoming' && groups.undated.length > 0 && (
            <>
              <h2>תועדו בלי תאריך אירוע</h2>
              <Notice>אלה סיקורים ופעילות שהמקור לא ציין להם יום. הם לא מוצגים כעבר או כעתיד.</Notice>
              <ul className="event-list">{groups.undated.map((e) => <EventCard key={e.id} event={e} institutions={inst.data ?? []} />)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
