# Audit — the site as the rav would use it

Date: 20.10.2026. Branch work against `integration/all-preview`.

The public catalog keeps the navy-and-gold hall the office already had on the topics page, and raises it: real counts, a lesson preview, a face that stays in the frame, and the same gold actions on the other desks. Long reading (a Torah sheet, the Q&A wizard, the contact letter, the admin) stays on paper. SEO and the video auditorium were left to the other agents. No production database was touched. No new migration.

The site’s own voice stays „הרב ליאור כהן”. Titles that appear only inside other people’s video headlines are not copied onto our chrome. „המדף המלא” is the topic with the most published lessons. There is no view counter, so the site does not call it popular.

## What changed

### Study hall
- Topics is a navy stage with the owner photo. On a phone the picture is a tall crop of the left side, where the face is, and the title sits under the picture. On a wide screen the title sits on the dark shelves, not on the face.
- Each topic card shows a published count from the library (`topics.shelves` on the server, the same count in the demo), a YouTube thumbnail when the newest lesson has one, and that lesson’s title. An empty shelf says „עדיין בלי שיעור משויך” and „0 פריטים”.
- The fullest shelf is marked „המדף המלא” and sits above the grid. Search hides that mark and filters by name and description, including nikud.
- Cards lift a few pixels on hover and press in on tap. `prefers-reduced-motion` and the site’s reduce-motion setting turn that off.
- Jewel colors, hall navy, and the gold button are tokens (`--hall-*`, `--jewel-*`). Components do not add new hex.

### The same language on the other desks
- Library, books, events, series, and saved items open with a navy band, a gold rule, and a small face from the same photo. About, institutions, sources, contact, and support use the band without that portrait, because an official portrait is still not approved for those pages.
- Search, „לדף השיעור”, „המשך הסדרה”, the events link, and a donation link when one exists are gold buttons.
- Home topic shelves are the same cards, eight of them, with the fullest of those eight marked. The owner banner has a gold edge. The four doors keep a gold hairline.
- Book spines, lesson cards, and the doors share the same short motion. A book page, a lesson’s notes, and the Q&A flow stay on the paper sheet. The video player was not restyled.

### Earlier desk work, still in place
- Library search explains nikud behind „איך החיפוש עובד”. Active filters are removable chips.
- The ימי מלך distinction stays inside „איך לקרוא את המדף”. A saved table of contents links only to a heading with the same title (`tocAnchors`).
- Events say „יומן Google”, offer „היום”, and show the event name on a wide calendar and a larger dot on a phone.
- Contact opens with two doors, then the paper letter. The footer update form says nothing is sent, and the button says „שמירת הפרטים”.
- `/support` lists a purchase or donation link only when an editor saved an https URL. No account number.
- Hosted audio opens as a listening desk. On a narrow screen the player’s skip controls drop to their own row.
- The admin dashboard opens with „מה על השולחן”: only the counts that are actually waiting. Content, topics, series, pages, institutions, and events each have one plain sentence. Nav rows meet the 44px target.
- The footer update form waits until the library is ready. Before that, asking it for the repository blanked the whole page.

### Left alone
- Q&A wizard, public bank, and tracking.
- Video auditorium, lesson player, and YouTube facade.
- SEO files beyond one prerender entry so `/support` is a real page in the static build.
- Seed facts, RLS, and the production database.

## Further ideas, in order

1. **Home length.** „על השולחן” and the CMS block „חדש בערוץ” show the same shelf twice. Turn one off in the home builder once the office decides which voice it wants. Do not hard-code that choice.
2. **Official portrait and biography.** The banner and the topics hall use the owner’s image. A short approved biography, titles, and a portrait for the about page should be pasted into the CMS by the office. The page is ready; the sentences are not.
3. **Contact details.** Phone, address, and lesson times stay empty until someone who may publish them types them into the institution records.
4. **Donation account.** `/support` will show a link the moment one is saved on a book. A standing donation page needs a real URL from the office, not a placeholder account.
5. **Sending updates.** The list is stored and consent is recorded. Mail or WhatsApp still needs a sender the office chooses. Do not imply that a message went out.
6. **Topic assignments.** Several topics are still automatic from the title. A staff hour in „נושאים” to confirm or move items would make the shelves trustworthy.
7. **Reading aloud.** The audio desk plays files we host. Most lessons are still video. A „listen to this lesson” path is a product decision, not a new player.
8. **Print of a lesson page.** Books print. A video lesson’s notes do not yet have a print sheet.
9. **Admin on a phone.** The rail collapses and the lists are tables. A card list for the question inbox on a narrow screen would be the next staff task; the Q&A inbox already switches layout.
10. **Screen-reader pass.** Contrast and names were checked in code. A pass with a real reader, especially the calendar and the photo hall, is still undone.
