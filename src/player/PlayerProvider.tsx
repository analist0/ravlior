import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatDuration } from '../shared/media.ts';
import { readJSON, writeJSON } from '../app/storage.ts';

// Persistent audio player: one <audio> element that survives navigation.
// Only native, authorised audio sources (MP3/M4A in our Storage or a direct licensed URL) play here.
// YouTube is never converted to audio.

export interface Track { contentId: string; slug: string; title: string; src: string; mime?: string | null }
interface Ctx {
  current: Track | null;
  queue: Track[];
  playing: boolean;
  play: (t: Track) => void;
  enqueue: (t: Track) => void;
  toggle: () => void;
  isCurrent: (contentId: string) => boolean;
}
const PlayerCtx = createContext<Ctx | null>(null);
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const { progress, saveProgress } = useLibraryState();
  const [queue, setQueue] = useState<Track[]>(() => readJSON<Track[]>('queue.v1', []));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [rate, setRate] = useState<number>(() => readJSON('rate.v1', 1));
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = queue[index] ?? null;
  const lastSave = useRef(0);

  useEffect(() => writeJSON('queue.v1', queue.slice(0, 50)), [queue]);
  useEffect(() => { writeJSON('rate.v1', rate); if (audio.current) audio.current.playbackRate = rate; }, [rate]);
  useEffect(() => { document.body.classList.toggle('has-player', !!current); }, [current]);

  // Load source + resume position when the track changes.
  useEffect(() => {
    const a = audio.current;
    if (!a || !current) return;
    setError(null);
    a.src = current.src;
    a.playbackRate = rate;
    const resume = progress[current.contentId]?.t ?? 0;
    const onMeta = () => {
      if (resume > 5 && (!a.duration || resume < a.duration - 10)) a.currentTime = resume;
      setDuration(Number.isFinite(a.duration) ? a.duration : null);
    };
    a.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => a.removeEventListener('loadedmetadata', onMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.src]);

  const persist = useCallback(() => {
    const a = audio.current;
    if (!a || !current) return;
    saveProgress(current.contentId, { t: a.currentTime, d: Number.isFinite(a.duration) ? a.duration : null, at: Date.now(), title: current.title, slug: current.slug });
  }, [current, saveProgress]);

  const play = useCallback((t: Track) => {
    setQueue((q) => {
      const i = q.findIndex((x) => x.contentId === t.contentId);
      if (i >= 0) { setIndex(i); return q; }
      setIndex(q.length);
      return [...q, t];
    });
    setTimeout(() => { void audio.current?.play().catch(() => setError('הדפדפן חסם ניגון. לחצו על כפתור הניגון.')); }, 0);
  }, []);
  const enqueue = useCallback((t: Track) => setQueue((q) => (q.some((x) => x.contentId === t.contentId) ? q : [...q, t])), []);
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setError('לא ניתן לנגן את הקובץ.'));
    else a.pause();
  }, []);
  const seek = (delta: number) => { const a = audio.current; if (a) a.currentTime = Math.max(0, Math.min((a.duration || Infinity) - 1, a.currentTime + delta)); };

  // Media Session (lock-screen / notification controls on Android Chrome).
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: 'אור המאיר' });
    navigator.mediaSession.setActionHandler('play', () => void audio.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => seek(-15));
    navigator.mediaSession.setActionHandler('seekforward', () => seek(30));
    navigator.mediaSession.setActionHandler('nexttrack', index < queue.length - 1 ? () => setIndex((i) => i + 1) : null);
    navigator.mediaSession.setActionHandler('previoustrack', index > 0 ? () => setIndex((i) => i - 1) : null);
  }, [current, index, queue.length]);

  const value = useMemo<Ctx>(() => ({ current, queue, playing, play, enqueue, toggle, isCurrent: (id) => current?.contentId === id }), [current, queue, playing, play, enqueue, toggle]);

  return (
    <PlayerCtx.Provider value={value}>
      {children}
      <audio
        ref={audio}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); persist(); }}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          if (Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); persist(); }
        }}
        onEnded={() => { persist(); if (index < queue.length - 1) { setIndex((i) => i + 1); setTimeout(() => void audio.current?.play(), 0); } }}
        onError={() => setError('הקובץ אינו זמין כרגע. אפשר לפתוח את המקור המקורי מדף השיעור.')}
        hidden
      />
      {current && (
        <section className="player-bar" aria-label="נגן אודיו">
          <div className="container">
            <div className="player-inner">
              <button className="play-btn" onClick={toggle} aria-label={playing ? 'השהיה' : 'ניגון'}>
                <Icon name={playing ? 'pause' : 'play'} />
              </button>
              <div style={{ minWidth: 0 }}>
                <Link to={`/item/${current.slug}`} className="player-title" style={{ display: 'block', color: 'var(--text)', textDecoration: 'none' }}>{current.title}</Link>
                {error ? <span className="soft" role="alert" style={{ color: 'var(--danger)' }}>{error}</span> : (
                  <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
                    <span className="player-time">{formatDuration(time)}</span>
                    <input
                      className="player-progress"
                      type="range"
                      min={0}
                      max={duration ?? 0}
                      step={1}
                      value={Math.min(time, duration ?? 0)}
                      onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }}
                      aria-label="מיקום בהקלטה"
                      aria-valuetext={`${formatDuration(time)} מתוך ${formatDuration(duration)}`}
                      disabled={!duration}
                    />
                    <span className="player-time">{formatDuration(duration)}</span>
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
                <button className="icon-btn" onClick={() => seek(-15)} aria-label="15 שניות אחורה"><Icon name="fwd10" /></button>
                <button className="icon-btn" onClick={() => seek(30)} aria-label="30 שניות קדימה"><Icon name="back10" /></button>
                <button className="icon-btn" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-label="אפשרויות נגן ותור"><Icon name={expanded ? 'chevronDown' : 'chevronUp'} /></button>
              </div>
            </div>
            {expanded && (
              <div className="player-expanded">
                <div className="row">
                  <label className="row" style={{ gap: 'var(--s-2)' }}>
                    <Icon name="speed" /> מהירות
                    <select className="select" style={{ width: 'auto' }} value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                      {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
                    </select>
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => { audio.current?.pause(); setQueue([]); setIndex(0); }}>סגירת הנגן</button>
                </div>
                <h3 style={{ marginTop: 'var(--s-4)' }}>בתור ({queue.length})</h3>
                <ol className="list-rows" style={{ paddingInlineStart: 'var(--s-5)' }}>
                  {queue.map((t, i) => (
                    <li key={t.contentId}>
                      <div className="spread">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setIndex(i); setTimeout(() => void audio.current?.play(), 0); }} aria-current={i === index || undefined}>
                          {i === index && <Icon name="listen" />} {t.title}
                        </button>
                        <button className="icon-btn" aria-label={`הסרה מהתור: ${t.title}`} onClick={() => { setQueue((q) => q.filter((_, j) => j !== i)); if (i < index) setIndex((x) => x - 1); }}>
                          <Icon name="close" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
      )}
    </PlayerCtx.Provider>
  );
}

export function usePlayer(): Ctx {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error('usePlayer outside provider');
  return c;
}
