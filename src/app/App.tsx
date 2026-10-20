import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import WatchPage from '../pages/Watch.tsx';
import { IS_DEMO } from './config.ts';
import { PrefsProvider } from './prefs.tsx';
import { LibraryStateProvider } from './library-state.tsx';
import { matchPath, RouterProvider, useRouter } from './router.tsx';
import { RepoContext, useAsync, type Repository } from '../data/repo.ts';
import { PlayerProvider } from '../player/PlayerProvider.tsx';
import { ToastProvider } from '../components/Toast.tsx';
import { ConfirmProvider } from '../components/Dialog.tsx';
import { BottomNav, DemoBanner, Footer, Header, SearchPanel } from '../components/Layout.tsx';
import { ErrorState, Skeleton } from '../components/ui.tsx';
import { moduleForPath } from '../modules/manifest.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { HomePage } from '../pages/Home.tsx';
import { NotFound, ModuleOff } from '../pages/NotFound.tsx';

// Public pages are split per route; the CMS is a separate lazy chunk.
const LibraryPage = lazy(() => import('../pages/Library.tsx'));
const ItemPage = lazy(() => import('../pages/Item.tsx'));
const SeriesList = lazy(() => import('../pages/Series.tsx').then((m) => ({ default: m.SeriesList })));
const SeriesPage = lazy(() => import('../pages/Series.tsx').then((m) => ({ default: m.SeriesPage })));
const TopicsList = lazy(() => import('../pages/Topics.tsx').then((m) => ({ default: m.TopicsList })));
const TopicPage = lazy(() => import('../pages/Topics.tsx').then((m) => ({ default: m.TopicPage })));
const BooksPage = lazy(() => import('../pages/Books.tsx'));
const BookPage = lazy(() => import('../pages/BookPage.tsx'));
const EventsPage = lazy(() => import('../pages/EventsPage.tsx'));
const ResponsaList = lazy(() => import('../pages/Responsa.tsx').then((m) => ({ default: m.ResponsaList })));
const ResponsaTopic = lazy(() => import('../pages/Responsa.tsx').then((m) => ({ default: m.ResponsaTopic })));
const ResponsaCategory = lazy(() => import('../pages/Responsa.tsx').then((m) => ({ default: m.ResponsaCategory })));
const ResponsaItem = lazy(() => import('../pages/Responsa.tsx').then((m) => ({ default: m.ResponsaItem })));
const AskPage = lazy(() => import('../pages/Ask.tsx').then((m) => ({ default: m.AskPage })));
const TrackPage = lazy(() => import('../pages/Ask.tsx').then((m) => ({ default: m.TrackPage })));
const AboutPage = lazy(() => import('../pages/About.tsx').then((m) => ({ default: m.AboutPage })));
const SupportPage = lazy(() => import('../pages/About.tsx').then((m) => ({ default: m.SupportPage })));
const InstitutionsPage = lazy(() => import('../pages/About.tsx').then((m) => ({ default: m.InstitutionsPage })));
const SourcesPage = lazy(() => import('../pages/About.tsx').then((m) => ({ default: m.SourcesPage })));
const ContentPage = lazy(() => import('../pages/ContentPage.tsx'));
const FavoritesPage = lazy(() => import('../pages/Favorites.tsx'));
const AcceptPage = lazy(() => import('../pages/Accept.tsx'));
const ParashaShelf = lazy(() => import('../modules/parasha-shelf/ParashaShelf.tsx'));
const AdminApp = lazy(() => import('../admin/AdminApp.tsx'));

type Route = [pattern: string, Page: ComponentType<{ params: Record<string, string> }>];
const ROUTES: Route[] = [
  ['/', HomePage],
  ['/library', LibraryPage],
  ['/watch', WatchPage],
  ['/item/:slug', ItemPage],
  ['/series', SeriesList],
  ['/series/:slug', SeriesPage],
  ['/topics', TopicsList],
  ['/topics/:slug', TopicPage],
  ['/books', BooksPage],
  ['/books/:slug', BookPage],
  ['/events', EventsPage],
  ['/responsa', ResponsaList],
  ['/responsa/topic/:slug', ResponsaTopic],
  ['/responsa/cat/:slug', ResponsaCategory],
  ['/responsa/:slug', ResponsaItem],
  ['/ask', AskPage],
  ['/track', TrackPage],
  ['/about', AboutPage],
  ['/support', SupportPage],
  ['/institutions', InstitutionsPage],
  ['/sources', SourcesPage],
  ['/favorites', FavoritesPage],
  ['/accept', AcceptPage],
  ['/p/:slug', ContentPage],
  ['/parasha', ParashaShelf],
];

function PageFallback() {
  return (
    <div className="container section" role="status" aria-live="polite">
      <span className="sr-only">טוען…</span>
      <Skeleton h={40} w="50%" /><div style={{ height: 16 }} /><Skeleton h={18} w="80%" /><div style={{ height: 8 }} /><Skeleton h={18} w="60%" />
    </div>
  );
}

function Routes({ modules }: { modules: Record<string, boolean> }) {
  const { loc } = useRouter();
  for (const [pattern, Page] of ROUTES) {
    const params = matchPath(pattern, loc.pathname);
    if (!params) continue;
    const mod = moduleForPath(loc.pathname);
    if (mod && modules[mod.id] === false) return <ModuleOff name={mod.name} />;
    return <Page params={params} />;
  }
  return <NotFound />;
}

function PublicShell({ repo }: { repo: Repository | null }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { loc } = useRouter();
  const menus = useAsync(() => (repo ? repo.getMenus() : Promise.resolve([])), [repo]);
  const mods = useAsync(() => (repo ? repo.getModules() : Promise.resolve([])), [repo]);
  const modules = Object.fromEntries((mods.data ?? []).map((m) => [m.id, m.enabled]));
  const header = menus.data?.find((m) => m.location === 'header');
  const footer = menus.data?.find((m) => m.location === 'footer');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
      const palette = (e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (palette) { e.preventDefault(); setSearchOpen(true); }
    };
    const onAsk = () => setSearchOpen(true);
    addEventListener('keydown', onKey);
    addEventListener('site-search', onAsk);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('site-search', onAsk);
    };
  }, []);
  useEffect(() => {
    const main = document.getElementById('main');
    if (main && document.activeElement !== document.body) main.focus({ preventScroll: true });
  }, [loc.pathname]);
  const page = repo ? (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes modules={modules} />
      </Suspense>
    </ErrorBoundary>
  ) : <PageFallback />;
  // The provider is always mounted so the header is not recreated when the
  // repository arrives. Search is mounted only once a repository exists.
  return (
    <RepoContext.Provider value={repo}>
      <a href="#main" className="skip-link">דילוג לתוכן</a>
      <DemoBanner />
      <Header menu={header} onSearch={() => setSearchOpen(true)} />
      <main id="main" tabIndex={-1}>{page}</main>
      <Footer menu={footer} updates={!!repo} />
      <BottomNav onSearch={() => setSearchOpen(true)} />
      {repo && <SearchPanel open={searchOpen} onOpenChange={setSearchOpen} />}
    </RepoContext.Provider>
  );
}

function Shell({ repo }: { repo: Repository }) {
  const { loc } = useRouter();
  // Move focus to main content on route change for screen-reader users.
  useEffect(() => {
    if (loc.pathname.startsWith('/admin')) return;
    const main = document.getElementById('main');
    if (main && document.activeElement !== document.body) main.focus({ preventScroll: true });
  }, [loc.pathname]);
  if (loc.pathname === '/admin' || loc.pathname.startsWith('/admin/')) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}><AdminApp /></Suspense>
      </ErrorBoundary>
    );
  }
  return <PublicShell repo={repo} />;
}

function RepoGate() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { loc } = useRouter();
  useEffect(() => {
    const load = IS_DEMO
      ? import('../data/demo-repo.ts').then((m) => m.createDemoRepository())
      : import('../data/api-repo.ts').then((m) => m.createApiRepository());
    load.then(setRepo, (e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);
  if (error) return <div className="container section"><ErrorState error={error} onRetry={() => location.reload()} /></div>;
  const isAdmin = loc.pathname === '/admin' || loc.pathname.startsWith('/admin/');
  // Public chrome stays mounted while the repository chunk loads, so the header
  // does not appear late and push the page down.
  if (!isAdmin) return <PublicShell repo={repo} />;
  if (!repo) return <PageFallback />;
  return <RepoContext.Provider value={repo}><Shell repo={repo} /></RepoContext.Provider>;
}

export function App() {
  return (
    <PrefsProvider>
      <RouterProvider>
        <ToastProvider>
          <ConfirmProvider>
            <LibraryStateProvider>
              <PlayerProvider>
                <RepoGate />
              </PlayerProvider>
            </LibraryStateProvider>
          </ConfirmProvider>
        </ToastProvider>
      </RouterProvider>
    </PrefsProvider>
  );
}
