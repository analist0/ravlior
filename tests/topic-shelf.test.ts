import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTopicShelves, featuredShelf, itemCountLabel } from '../src/shared/topic-shelf.ts';
import type { ContentItem, Topic } from '../src/shared/types.ts';

const topic = (over: Partial<Topic>): Topic => ({
  id: 't1', slug: 'emunah', name: 'אמונה', description: null, sort: 0, status: 'published', version: 1, deletedAt: null, ...over,
});

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1', slug: 's', type: 'video', title: 'שיעור', summary: null, body: [], speaker: null,
  attributionStatus: 'channel_only', attributionNote: null, eventDate: null, eventDateText: null,
  sourcePublishedDate: null, durationSeconds: null, durationText: null, chapters: [], transcript: null,
  status: 'published', publishedAt: null, featured: false, verification: 'located', provenance: [],
  duplicateGroup: null, catalogOrder: 1, topicIds: ['t1'], seriesIds: [], sources: [], bookDetails: null,
  version: 1, createdAt: '', updatedAt: '', deletedAt: null, publishAt: null, ...over,
});

test('shelf count ignores drafts and uses catalog order for the preview', () => {
  const shelves = buildTopicShelves(
    [topic({ id: 't1' }), topic({ id: 't2', slug: 'empty', name: 'ריק' })],
    [
      item({ id: 'new', catalogOrder: 2, title: 'חדש', sources: [{ id: 'm', contentId: 'new', provider: 'youtube', providerId: 'abc', kind: 'media', deliveryMode: 'embed', url: 'https://youtu.be/abc', canonicalUrl: 'https://youtu.be/abc', mime: null, filesize: null, durationSeconds: null, checksum: null, rightsStatus: 'unverified', rightsEvidence: null, embedStatus: 'ok', lastCheckedAt: null, error: null, isPrimary: true, storageBucket: null, storagePath: null }] }),
      item({ id: 'old', catalogOrder: 9, title: 'ישן' }),
      item({ id: 'draft', status: 'draft', title: 'טיוטה' }),
      item({ id: 'other', topicIds: ['t2'], title: 'אחר', catalogOrder: 3 }),
    ],
  );
  assert.equal(shelves[0]?.count, 2);
  assert.equal(shelves[0]?.preview?.title, 'חדש');
  assert.equal(shelves[0]?.preview?.youtubeId, 'abc');
  assert.equal(shelves[1]?.count, 1);
  assert.equal(featuredShelf(shelves)?.slug, 'emunah');
  assert.equal(featuredShelf([shelves[1]!])?.count, 1);
  assert.equal(featuredShelf([{ ...shelves[1]!, count: 0, preview: null }]), null);
  assert.equal(itemCountLabel(1), 'פריט אחד');
  assert.equal(itemCountLabel(0), '0 פריטים');
});
