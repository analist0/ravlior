// Shared domain types — used by the frontend, the Node server, scripts and tests.
// Keep this file free of runtime dependencies so it can run under Node type-stripping.

export const CONTENT_TYPES = ['video', 'audio', 'short', 'live', 'book', 'leaflet', 'article', 'answer'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const QUESTION_STATUSES = [
  'submitted', 'triaged', 'assigned', 'answered', 'approved', 'published', 'private_delivered', 'closed',
] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ROLES = ['owner', 'admin', 'editor', 'reviewer', 'rabbi', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export type MediaProvider = 'youtube' | 'kol-barama' | 'ykr' | 'ktr' | 'hm-news' | 'pdf' | 'storage' | 'web';
export type DeliveryMode = 'embed' | 'direct' | 'storage' | 'link';
export type RightsStatus = 'unverified' | 'embed_only' | 'licensed' | 'owned' | 'blocked';
export type EmbedStatus = 'unchecked' | 'ok' | 'failed' | 'unsupported';

/** Verification level as defined in the research dossier. */
export type Verification = 'located' | 'archive' | 'candidate' | 'historical' | 'blocked';

/** How the rabbi's authorship/participation is supported by the source. */
export type AttributionStatus =
  | 'title_names_rabbi' // the public title names Rabbi Lior Cohen
  | 'channel_only' // appears on the institutions channel; the title does not name him
  | 'source_page' // a source page attributes the item to him
  | 'note_only' // only a note by him appears on the page — not the full answer
  | 'other_speaker' // another speaker is the main voice
  | 'not_author'; // publication related to him but he is not the author

export interface Provenance {
  section: string; // dossier section, e.g. "יא"
  row?: string; // row number as printed in the dossier
  note?: string; // original remark, verbatim
}

export interface MediaSource {
  id: string;
  contentId: string;
  provider: MediaProvider;
  providerId: string | null;
  url: string;
  canonicalUrl: string;
  deliveryMode: DeliveryMode;
  kind: 'media' | 'source_page' | 'pdf' | 'archive';
  mime: string | null;
  filesize: number | null;
  durationSeconds: number | null;
  checksum: string | null;
  rightsStatus: RightsStatus;
  rightsEvidence: string | null;
  embedStatus: EmbedStatus;
  lastCheckedAt: string | null;
  error: string | null;
  isPrimary: boolean;
  storageBucket: string | null;
  storagePath: string | null;
}

export interface ContentItem {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  summary: string | null;
  body: Block[];
  speaker: string | null;
  attributionStatus: AttributionStatus;
  attributionNote: string | null;
  eventDate: string | null; // ISO date only when stated explicitly
  eventDateText: string | null; // e.g. Hebrew date in title
  sourcePublishedDate: string | null;
  durationSeconds: number | null;
  durationText: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  featured: boolean;
  verification: Verification;
  provenance: Provenance[];
  duplicateGroup: string | null;
  /** Position in the collected source listing (channel tab order etc). Not a date. */
  catalogOrder: number;
  topicIds: string[];
  seriesIds: string[];
  sources: MediaSource[];
  bookDetails: BookDetails | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BookDetails {
  authorText: string | null;
  editorText: string | null;
  publisher: string | null;
  authoredByRabbi: boolean;
  coverPath: string | null;
  pdfAccess: 'none' | 'public' | 'restricted';
  locatedStatus: string; // human text, e.g. "דווח על קיומו; PDF לא אותר"
}

export interface Topic {
  id: string;
  auto?: boolean;
  slug: string;
  name: string;
  description: string | null;
  sort: number;
  status: ContentStatus;
  version: number;
  deletedAt: string | null;
}

export interface Series {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: 'system' | 'source';
  sourceUrl: string | null;
  status: ContentStatus;
  sort: number;
  items: string[]; // ordered content ids
  version: number;
  deletedAt: string | null;
}

export interface Institution {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sourceUrls: string[];
  status: ContentStatus;
  version: number;
  deletedAt: string | null;
}

export interface EventRecord {
  id: string;
  slug: string;
  institutionId: string | null;
  title: string;
  eventDate: string | null;
  dateText: string | null;
  summary: string | null;
  sourceUrls: string[];
  status: ContentStatus;
  version: number;
  deletedAt: string | null;
}

export interface SourceArchive {
  id: string;
  name: string;
  material: string;
  url: string;
  verification: Verification;
  note: string | null;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  blocks: Block[];
  status: ContentStatus;
  version: number;
  deletedAt: string | null;
}

export interface MenuItem { label: string; href: string }
export interface Menu { id: string; location: 'header' | 'footer'; items: MenuItem[]; version: number }

export type HomeSectionKind = 'actions' | 'continue' | 'featured' | 'latest' | 'topics' | 'series' | 'books' | 'answers';
export interface HomeSection {
  id: string;
  kind: HomeSectionKind;
  title: string;
  enabled: boolean;
  position: number;
  config: { contentIds?: string[]; limit?: number; type?: ContentType };
  version: number;
}

export interface PublicQuestion {
  id: string;
  slug: string;
  questionText: string;
  answerBlocks: Block[];
  answerAudioUrl: string | null;
  topicId: string | null;
  attribution: string; // who answered, as approved
  approvedByRabbi: boolean;
  publishedAt: string | null;
  status: ContentStatus;
  version: number;
  deletedAt: string | null;
}

export interface QuestionSubmission {
  id: string;
  trackingCode: string;
  tokenHash: string;
  isAnonymous: boolean;
  askerName: string | null;
  contactEmail: string | null;
  topicId: string | null;
  questionText: string;
  publishConsent: boolean;
  status: QuestionStatus;
  assignedTo: string | null;
  answerText: string | null;
  answerAudioPath: string | null;
  answeredBy: string | null;
  approvedBy: string | null;
  publicQuestionId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ModuleState { id: string; enabled: boolean; settings: Record<string, unknown> }

// ——— Structured content blocks (whitelisted; no raw HTML/JS/iframe) ———
export type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; src: string; alt: string; credit?: string }
  | { type: 'quote'; text: string; source: string }
  | { type: 'media'; contentId: string }
  | { type: 'pdf'; src: string; title: string }
  | { type: 'related'; contentIds: string[] }
  | { type: 'cta'; label: string; href: string };

export interface ContentQuery {
  q?: string;
  type?: ContentType | '';
  topic?: string;
  series?: string;
  provider?: MediaProvider | '';
  sort?: 'newest' | 'oldest' | 'title' | 'duration';
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

export interface SeedData {
  generatedAt: string;
  sourceFile: string;
  audit: SeedAudit;
  archives: SourceArchive[];
  content: ContentItem[];
  topics: Topic[];
  series: Series[];
  institutions: Institution[];
  events: EventRecord[];
  readPages: { row: string; title: string; url: string; videoIds: string[] }[];
}

export interface SeedAudit {
  distinctUrls: number;
  distinctVideoIds: number;
  activeChannel: { video: number; short: number; live: number; total: number };
  legacyChannel: number;
  additionalVideoIds: number;
  readPages: number;
  contentItems: number;
  unassignedUrls: string[];
}
