-- RLS / workflow / storage verification. Runs inside ONE transaction and ROLLS BACK at the end.
-- Works on the local shim (scripts/verify-db-local.sh) and on a Supabase project's SQL editor
-- (as the postgres role) — it creates temporary test users and removes everything on rollback.
-- Each check prints "PASS: ..." or aborts with "FAIL: ...".

begin;

create function pg_temp.act(uid uuid, r text) returns void language plpgsql as $$
begin
  perform set_config('app.user_id', coalesce(uid::text, ''), true);
  perform set_config('app.actor', 'user', true);
  execute format('set local role %I', r);
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('app.user_id', '', true);
  perform set_config('app.actor', '', true);
end $$;
create function pg_temp.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', what; end if;
  raise notice 'PASS: %', what;
end $$;
-- Runs SQL and reports whether it raised (optionally with a given SQLSTATE).
create function pg_temp.raises(stmt text, state text default null) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return state is null or sqlstate = state;
end $$;
grant execute on all functions in schema pg_temp to app_anon, app_api;

-- ——— fixtures ———
insert into public.app_users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'owner@test.invalid'),
  ('00000000-0000-4000-a000-000000000002', 'admin@test.invalid'),
  ('00000000-0000-4000-a000-000000000003', 'editor@test.invalid'),
  ('00000000-0000-4000-a000-000000000004', 'reviewer@test.invalid'),
  ('00000000-0000-4000-a000-000000000005', 'rabbi@test.invalid'),
  ('00000000-0000-4000-a000-000000000006', 'viewer@test.invalid'),
  ('00000000-0000-4000-a000-000000000007', 'nobody@test.invalid');
select set_config('app.actor', 'service', true);
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-a000-000000000001', 'owner'),
  ('00000000-0000-4000-a000-000000000002', 'admin'),
  ('00000000-0000-4000-a000-000000000003', 'editor'),
  ('00000000-0000-4000-a000-000000000004', 'reviewer'),
  ('00000000-0000-4000-a000-000000000005', 'rabbi'),
  ('00000000-0000-4000-a000-000000000006', 'viewer');
insert into public.content_items (id, slug, type, title, status) values
  ('10000000-0000-4000-a000-000000000001', 'test-draft', 'video', 'טיוטת בדיקה', 'draft'),
  ('10000000-0000-4000-a000-000000000010', 'test-pub-search', 'article', 'הלכות סוכה וארבעת המינים', 'published');
insert into public.media_sources (content_id, provider, provider_id, url, canonical_url, kind)
  values ('10000000-0000-4000-a000-000000000001', 'web', null, 'https://example.org/draft', 'https://example.org/draft', 'source_page');
insert into public.question_submissions (id, tracking_code, token_hash, question_text, publish_consent)
  values ('20000000-0000-4000-a000-000000000001', 'TEST-0001',
          encode(extensions.digest('x'||repeat('s', 40), 'sha256'), 'hex'), 'שאלה פרטית לבדיקה בלבד', false);
insert into public.content_items (id, slug, type, title, status, publish_at) values
  ('10000000-0000-4000-a000-000000000099', 'future-pub', 'article', 'עתידי', 'published', now() + interval '7 days');
select pg_temp.back();
-- Contact intake is inserted by the table owner (API), the same way questions are stored.
insert into public.contact_messages (email, subject, body) values ('inbox@test.invalid', 'שלום', 'הודעת בדיקה ארוכה מספיק');

-- ——— anon ———
select pg_temp.act(null, 'app_anon');
select pg_temp.ok((select count(*) from public.question_submissions) = 0, 'anon cannot read private question submissions');
select pg_temp.ok((select count(*) from public.content_items where status <> 'published') = 0, 'anon sees published content only');
select pg_temp.ok(not exists (select 1 from public.content_items where slug = 'test-draft'), 'anon cannot see a draft item');
select pg_temp.ok(not exists (select 1 from public.content_items where slug = 'future-pub'), 'anon cannot see a published row waiting for publish_at');
select pg_temp.ok(not exists (select 1 from public.search_content('עתידי') s join public.content_items c on c.id = s.id where c.slug = 'future-pub'),
  'public search hides a row waiting for publish_at');
select pg_temp.ok(pg_temp.raises('select count(*) from public.contact_messages'), 'anon has no privilege on contact messages');
select pg_temp.ok(not exists (select 1 from public.media_sources where url = 'https://example.org/draft'), 'anon cannot see sources of a draft item');
select pg_temp.ok(pg_temp.raises($$insert into public.content_items (slug, type, title) values ('x', 'video', 'x')$$), 'anon cannot insert content');
select pg_temp.ok((select count(*) from public.audit_log) = 0, 'anon cannot read audit log');
select pg_temp.ok((select count(*) from public.revisions) = 0, 'anon cannot read revisions');
select pg_temp.ok(not exists (select 1 from public.search_content('בדיקה') s join public.content_items c on c.id = s.id where c.status <> 'published'),
  'public search returns published only');
select pg_temp.ok(exists (select 1 from public.search_site('סוקה') s where s.href = '/item/test-pub-search'),
  'site search matches a one-letter typo via trigram');
select pg_temp.ok(not exists (select 1 from public.search_site('טיוטת בדיקה') s where s.href like '%test-draft%'),
  'site search hides drafts');
select pg_temp.ok(pg_temp.raises('select * from public.update_signups'), 'anon cannot read update signups');
select pg_temp.ok(pg_temp.raises($$insert into public.update_signups (channel, contact, consent) values ('email', 'anon@example.com', true)$$),
  'anon cannot insert update signups');
select pg_temp.ok((select count(*) from public.track_question('TEST-0001', 'wrong-token-wrong-token-wrong-token-00')) = 0, 'tracking with a wrong token returns nothing');
select pg_temp.ok((select status from public.track_question('TEST-0001', 'x'||repeat('s', 40))) = 'submitted', 'tracking with code + token returns status');
select pg_temp.ok((select answer_text from public.track_question('TEST-0001', 'x'||repeat('s', 40))) is null, 'tracking hides unanswered text');
select pg_temp.ok(pg_temp.raises($$insert into public.storage_objects (bucket_id, name) values ('public-media', '2026/00000000-0000-4000-a000-000000000009/a.mp3')$$),
  'anon cannot upload to storage');
select pg_temp.back();

-- ——— viewer ———
select pg_temp.act('00000000-0000-4000-a000-000000000006', 'app_api');
select pg_temp.ok(exists (select 1 from public.content_items where slug = 'test-draft'), 'viewer (staff) can see drafts');
select pg_temp.ok((select count(*) from public.contact_messages) = 0, 'viewer cannot read contact messages');
update public.content_items set title = 'viewer edit' where slug = 'test-draft';
select pg_temp.ok((select title from public.content_items where slug = 'test-draft') = 'טיוטת בדיקה', 'viewer update is silently filtered by RLS');
select pg_temp.ok((select count(*) from public.question_submissions) = 0, 'viewer cannot read private questions');
select pg_temp.back();

-- ——— editor ———
select pg_temp.act('00000000-0000-4000-a000-000000000003', 'app_api');
select pg_temp.ok(pg_temp.raises($$insert into public.content_items (slug, type, title, status) values ('e-pub', 'video', 'x', 'published')$$, '42501'),
  'editor cannot create an already-published item');
insert into public.content_items (id, slug, type, title) values ('10000000-0000-4000-a000-000000000002', 'e-draft', 'audio', 'טיוטת עורך');
select pg_temp.ok((select version from public.content_items where slug = 'e-draft') = 1, 'editor creates a draft (version 1)');
update public.content_items set status = 'in_review', version = 1 where slug = 'e-draft';
select pg_temp.ok((select status from public.content_items where slug = 'e-draft') = 'in_review', 'editor sends draft to review');
select pg_temp.ok(pg_temp.raises($$update public.content_items set status = 'approved', version = 2 where slug = 'e-draft'$$, '42501'),
  'editor cannot approve');
select pg_temp.ok(pg_temp.raises($$update public.content_items set title = 'stale', version = 1 where slug = 'e-draft'$$, '40001'),
  'stale version is rejected (optimistic concurrency)');
delete from public.content_items where slug = 'e-draft';
select pg_temp.ok(exists (select 1 from public.content_items where slug = 'e-draft'), 'editor cannot permanently delete');
select pg_temp.ok(pg_temp.raises($$insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000007', 'editor')$$),
  'editor cannot grant roles');
select pg_temp.ok((select count(*) from public.audit_log) = 0, 'editor cannot read audit log');
select pg_temp.ok((select count(*) from public.contact_messages) = 1, 'editor can read contact messages');
update public.contact_messages set status = 'read' where email = 'inbox@test.invalid';
select pg_temp.ok((select status from public.contact_messages where email = 'inbox@test.invalid') = 'read', 'editor marks a contact message read');
select pg_temp.ok(pg_temp.raises($$insert into public.storage_objects (bucket_id, name) values ('public-media', '../etc/passwd.mp3')$$),
  'storage rejects an unsafe path');
insert into public.storage_objects (bucket_id, name) values ('public-media', '2026/00000000-0000-4000-a000-000000000009/lesson-1.mp3');
select pg_temp.ok(true, 'editor uploads to public-media with a safe path');
select pg_temp.ok(pg_temp.raises($$insert into public.storage_objects (bucket_id, name) values ('private-submissions', '2026/00000000-0000-4000-a000-000000000009/a.mp3')$$),
  'editor cannot upload voice answers (rabbi/admin only)');
select pg_temp.ok((select count(*) from public.question_submissions) = 1, 'editor can read the question inbox');
update public.question_submissions set status = 'triaged', version = 1 where tracking_code = 'TEST-0001';
update public.question_submissions set status = 'assigned', version = 2 where tracking_code = 'TEST-0001';
update public.question_submissions set status = 'answered', answer_text = 'תשובת בדיקה', version = 3 where tracking_code = 'TEST-0001';
select pg_temp.ok((select status from public.question_submissions where tracking_code = 'TEST-0001') = 'answered', 'editor triages, assigns and drafts an answer');
select pg_temp.ok(pg_temp.raises($$update public.question_submissions set status = 'approved', version = 4 where tracking_code = 'TEST-0001'$$, '42501'),
  'editor cannot approve an answer in the rabbi''s name');
select pg_temp.ok(pg_temp.raises($$insert into public.public_questions (slug, question_text, attribution, approved_by_rabbi, status) values ('fake', 'q', 'x', true, 'draft')$$, '42501'),
  'editor cannot create a public answer marked as rabbi-approved');
select pg_temp.back();

-- ——— reviewer ———
select pg_temp.act('00000000-0000-4000-a000-000000000004', 'app_api');
update public.content_items set status = 'approved', version = 2 where slug = 'e-draft';
update public.content_items set status = 'published', version = 3 where slug = 'e-draft';
select pg_temp.ok((select status = 'published' and published_at is not null from public.content_items where slug = 'e-draft'), 'reviewer approves and publishes');
select pg_temp.ok(pg_temp.raises($$update public.question_submissions set status = 'approved', version = 4 where tracking_code = 'TEST-0001'$$, '42501'),
  'reviewer cannot approve an answer in the rabbi''s name');
select pg_temp.back();

select pg_temp.ok((select count(*) from public.revisions where entity = 'content_items' and entity_id = '10000000-0000-4000-a000-000000000002') = 3,
  'every update stored a revision');

-- ——— rabbi ———
select pg_temp.act('00000000-0000-4000-a000-000000000005', 'app_api');
update public.question_submissions set status = 'approved', version = 4 where tracking_code = 'TEST-0001';
select pg_temp.ok((select approved_by from public.question_submissions where tracking_code = 'TEST-0001') = '00000000-0000-4000-a000-000000000005',
  'rabbi approves; approver recorded');
select pg_temp.ok(pg_temp.raises($$update public.question_submissions set status = 'published', version = 5 where tracking_code = 'TEST-0001'$$, '42501'),
  'cannot publish a question without the asker''s consent');
update public.question_submissions set status = 'private_delivered', version = 5 where tracking_code = 'TEST-0001';
insert into public.storage_objects (bucket_id, name) values ('private-submissions', '2026/00000000-0000-4000-a000-000000000009/answer.mp3');
select pg_temp.ok(true, 'rabbi uploads a private voice answer');
select pg_temp.back();

select pg_temp.act(null, 'app_anon');
select pg_temp.ok((select answer_text from public.track_question('TEST-0001', 'x'||repeat('s', 40))) = 'תשובת בדיקה', 'asker sees the delivered answer with the token');
select pg_temp.ok(not exists (select 1 from public.storage_objects where bucket_id = 'private-submissions'), 'anon cannot list private voice answers');
select pg_temp.back();

-- ——— admin / owner ———
select pg_temp.act('00000000-0000-4000-a000-000000000002', 'app_api');
select pg_temp.ok((select count(*) from public.audit_log) > 0, 'admin can read the audit log');
select pg_temp.ok(not exists (select 1 from public.audit_log where meta::text like '%שאלה פרטית%' or meta::text like '%ssss%'),
  'audit log holds no private question text or token material');
select pg_temp.ok(not exists (select 1 from public.audit_log where entity = 'contact_messages' and (meta::text like '%הודעת בדיקה%' or meta::text like '%inbox@test%')),
  'contact audit stores status only, not the message body or address');
delete from public.content_items where slug = 'e-draft';
select pg_temp.ok(exists (select 1 from public.content_items where slug = 'e-draft'), 'permanent delete requires a prior soft delete');
update public.content_items set deleted_at = now(), version = 4 where slug = 'e-draft';
delete from public.content_items where slug = 'e-draft';
select pg_temp.ok(not exists (select 1 from public.content_items where slug = 'e-draft'), 'admin permanently deletes after soft delete');
select pg_temp.ok(pg_temp.raises($$insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000007', 'owner')$$, '42501'),
  'admin cannot grant owner');
insert into public.user_roles (user_id, role) values ('00000000-0000-4000-a000-000000000007', 'editor');
select pg_temp.ok(true, 'admin grants editor');
select pg_temp.back();

select pg_temp.act('00000000-0000-4000-a000-000000000001', 'app_api');
select pg_temp.ok(pg_temp.raises($$delete from public.user_roles where user_id = '00000000-0000-4000-a000-000000000001' and role = 'owner'$$, '42501'),
  'owner cannot remove their own owner role');
select pg_temp.back();

-- ——— Hebrew normalization parity with src/shared/hebrew.ts (tests/hebrew.test.ts uses the same inputs) ———
select pg_temp.ok(public.he_normalize('עוּלוּ אוּשְׁפִּיזִין') = 'עולו אושפיזינ', 'he_normalize strips niqqud and folds final letters (matches JS)');
select pg_temp.ok(public.he_normalize('זצ"ל') = public.he_normalize('זצ״ל') and public.he_normalize('ט"ו באב') = 'טו באב', 'he_normalize ignores geresh/gershayim (matches JS)');

-- ——— P0: lock, re-approval, unpublish ———
select pg_temp.back();
insert into public.question_submissions (id, tracking_code, token_hash, question_text, publish_consent, status, answer_text, approved_by)
values ('20000000-0000-4000-a000-000000000002', 'TEST-0002', encode(extensions.digest('y'||repeat('s', 40), 'sha256'), 'hex'),
        'שאלה לפרסום בדיקה', true, 'approved', 'תשובת בדיקה', '00000000-0000-4000-a000-000000000005');

select pg_temp.act('00000000-0000-4000-a000-000000000003', 'app_api');
update public.question_submissions set answer_text = 'נוסח ששונה', version = 1 where tracking_code = 'TEST-0002';
select pg_temp.ok((select status = 'answered' and approved_by is null and answer_text = 'נוסח ששונה' from public.question_submissions where tracking_code = 'TEST-0002'),
  'editing an approved answer returns it to answered and clears approval');
select pg_temp.back();

select pg_temp.act('00000000-0000-4000-a000-000000000005', 'app_api');
update public.question_submissions set status = 'approved', version = 2 where tracking_code = 'TEST-0002';
select pg_temp.back();

select pg_temp.act('00000000-0000-4000-a000-000000000002', 'app_api');
insert into public.public_questions (slug, question_text, answer_blocks, attribution, approved_by_rabbi, status, source_submission_id)
values ('qa-match', 'שאלה לפרסום בדיקה', '[{"type":"paragraph","text":"נוסח ששונה"}]'::jsonb, 'בדיקה', true, 'in_review', '20000000-0000-4000-a000-000000000002');
select pg_temp.ok((select approved_by_rabbi from public.public_questions where slug = 'qa-match'),
  'public answer copied from the approved text may be marked approved without a second rabbi click');
select pg_temp.ok(pg_temp.raises($$insert into public.public_questions (slug, question_text, answer_blocks, attribution, approved_by_rabbi, status, source_submission_id) values ('qa-edit', 'נוסח ערוך', '[{"type":"paragraph","text":"נוסח ששונה"}]'::jsonb, 'בדיקה', true, 'in_review', '20000000-0000-4000-a000-000000000002')$$, '42501'),
  'an edited public question cannot be marked approved until the rabbi re-approves');
update public.public_questions set status = 'approved', version = 1 where slug = 'qa-match';
update public.public_questions set status = 'published', version = 2 where slug = 'qa-match';
select pg_temp.ok(pg_temp.raises($$update public.public_questions set question_text = 'נוסח אחרי פרסום', version = 3 where slug = 'qa-match'$$, '42501'),
  'unpublishing by editing a published answer requires an audit reason');
select set_config('app.audit_reason', 'הסרת פרסום לעריכה', true);
update public.public_questions set question_text = 'נוסח אחרי פרסום', version = 3 where slug = 'qa-match';
select pg_temp.ok((select status = 'draft' and approved_by_rabbi = false from public.public_questions where slug = 'qa-match'),
  'editing a published answer unpublishes it and clears rabbi approval');
select pg_temp.back();

select pg_temp.act('00000000-0000-4000-a000-000000000005', 'app_api');
select set_config('app.audit_reason', '', true);
select pg_temp.ok(pg_temp.raises($$update public.question_submissions set status = 'assigned', version = 3 where tracking_code = 'TEST-0002'$$, '42501'),
  'approved -> assigned requires an audit reason');
select set_config('app.audit_reason', 'החזרה לטיפול', true);
update public.question_submissions set status = 'assigned', version = 3 where tracking_code = 'TEST-0002';
select pg_temp.ok((select status = 'assigned' and approved_by is null from public.question_submissions where tracking_code = 'TEST-0002'),
  'approved -> assigned is allowed with an audit reason');
select pg_temp.back();
select pg_temp.ok(exists (select 1 from public.audit_log where entity = 'question_submissions' and meta->>'reason' = 'החזרה לטיפול' and meta::text not like '%נוסח ששונה%'),
  'audit stores the reason and not the answer text');
select pg_temp.act('00000000-0000-4000-a000-000000000005', 'app_api');
update public.question_submissions set status = 'answered', version = 4 where tracking_code = 'TEST-0002';
update public.question_submissions set status = 'approved', version = 5 where tracking_code = 'TEST-0002';
update public.question_submissions set status = 'private_delivered', version = 6 where tracking_code = 'TEST-0002';
select pg_temp.ok(pg_temp.raises($$update public.question_submissions set answer_text = 'אחרי מסירה', version = 7 where tracking_code = 'TEST-0002'$$, '42501'),
  'answer text is locked after delivery');
select pg_temp.back();

-- ——— seed audit (only meaningful after neon/seed.sql) ———
select pg_temp.ok((select count(distinct provider_id) from public.media_sources where provider = 'youtube' and kind = 'media') in (0, 182),
  'seed: 182 distinct YouTube video ids (or seed not loaded)');

rollback;
