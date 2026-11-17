# FreeLanzo Phase 4.1 — Chat & Work Offer Refinements

Phase 4.1 adds work descriptions, deadlines, payment terms, offer status/cancellation, unread inbox counts, message timestamps, and confirmation before freelancer accept/decline. The approved text-only messaging and 30 KB signature limit remain unchanged. Final cropped profile photos remain **10–200 KB**.

See **PHASE4_SETUP.md** for required Firestore rule deployment and two-account tests. Publish the matching `firestore.rules` and `js/messaging.js` together; do not deploy the new rule set with the old chat script. Existing accepted/declined offers cannot be modified. This is not verified e-signing or payment processing.

---

## Phase 3.6 — Freelancer visibility on Dashboard Home

Freelancers now manage their profile **discoverability** from **Dashboard Home**, below the profile completion card and above Quick Access. The toggle and **Save visibility** button have been **moved**, not duplicated. The old visibility panel was removed from Settings; account and security controls remain in Settings. The existing Firestore publishing workflow and permissions are unchanged. English/Hindi/Marathi guidance now points to Dashboard Home.

**Changed files:** `freelancer-dashboard.html`, `dashboard.css`, `js/dashboard.js`, `js/ui-preferences.js`, `README.md`. **New files:** none. **Firestore rules:** no changes needed.

**Test:** Log in as a freelancer, open Dashboard Home, toggle discoverability, click Save visibility, refresh and confirm the status persists. Check that Explore only lists published freelancers. Then confirm the visibility control is absent from Settings and the Client dashboard is unchanged.

---

# FreeLanzo Phase 3.3 — Experience & Privacy (November 15, 2026)

Built from **Phase 3.2 Google Auth + guest-navigation fix**, preserving all earlier functionality. Adds all six discussed enhancements and the two requested changes:

1. **Multilingual UI:** header language selector on the landing page, authentication, dashboards, and public profiles. English / Hindi / Marathi strings are stored in `js/ui-preferences.js`, and the selection persists in `localStorage`. Core navigation, actions, form labels, categories and major interface text are translated. Some decorative marketing descriptions, dynamic error notices, and user-written profiles/projects remain in the original language; this is not full machine translation.
2. **Profile completion:** transparent field-by-field percentage on both dashboards' Home view. Freelancer includes portfolio, skills, category, experience and availability; Client uses five standard profile fields. Progress updates when profile/photo/project data changes.
3. **Save freelancers:** **Clients only** can save/remove published freelancers in Explore and view them in **Saved Freelancers**. Bookmarks stored privately in `users/{clientUid}/savedFreelancers/{freelancerUid}`. Removed/unpublished people appear as unavailable with a remove action. Only the client can read their own list.
4. **Light/Dark mode:** global theme button in header; preference saved in `localStorage`. CSS stays compatible with the original minimalist theme.
5. **Advanced directory filters:** skill search, experience level (Beginner/Intermediate/Expert), availability (Available/Busy), plus existing name search/category, and Clear Filters. Freelancers can set experience and availability on My Profile. Older profiles without the new fields still appear with no advanced filter selected.
6. **Privacy & deletion:** existing freelancer visibility controls retained. Both roles can request full deletion via Settings. Requires typing `DELETE` plus password reauthentication or Google reauthentication. Deletes their own Firestore portfolios, saved bookmarks, public projects/profile and private user profile; then deletes the Firebase Authentication identity. **Do not use this client-side demo deletion approach in production:** network failures can partially complete deletion and require administrator assistance, Cloudinary unsigned assets are **not** deleted by the browser, and references held in other clients' saved lists are not globally cleaned. A production app needs a trusted backend for reliable orchestration and Cloudinary deletion.
7. **Automatic login role:** role-selection inputs are **removed from login.html only**. Signup still asks Freelancer/Client and saves it at registration. On login the role is verified from private Firestore `users/{uid}` and `dashboard.html` routes to the matching dashboard. Google signup still rejects an already registered FreeLanzo profile.
8. **Photo size now 10–200 KB (decimal) after cropping:** original JPG/PNG/WebP image may be up to 10 MB; the processed upload image must be 10,000–200,000 bytes. Image processing crops centrally and searches for a compliant output at multiple resolutions; images that cannot fit the range are rejected with an explanation. This is **browser-side validation only**. A Cloudinary unsigned preset is publicly callable outside the app and cannot enforce this limit without a verified backend.

**Phase 3.3 compatibility fixes:** Existing saved freelancer experience and availability values are loaded back into the edit form. Updating a published avatar rebuilds its public record with the new fields, so older Phase 3.1 profiles work with the revised Firestore rules. Category navigation uses canonical English URL parameters even while interface labels are translated.

## REQUIRED DEPLOYMENT STEPS

1. Back up the working FreeLanzo directory and replace with this package, including new `preferences.css` and `js/ui-preferences.js`.
2. In **Firebase Console → Firestore Database → Rules**, paste **this updated `firestore.rules`** and click **Publish**. **This is essential** for saved bookmarks, new experience/availability profile fields, and account deletion. If you already implemented later phases, **merge** the rules instead of blindly replacing them.
3. Push the repository to GitHub Pages and refresh with Ctrl+Shift+R. Your Firebase and Cloudinary identifiers are already present; don't commit API secrets.
4. Test on a separate temporary account; **avoid testing account deletion on a real account**.

## PHASE 3.3 CHECKLIST

- [ ] Login with email and Google **without selecting a role**; both account roles route correctly.
- [ ] Signup still collects Freelancer/Client role; Google signup using an existing FreeLanzo profile shows an error.
- [ ] English/Hindi/Marathi switches core UI labels; refresh and confirm selected language persists.
- [ ] Toggle dark/light theme; refresh and check mobile and desktop contrast.
- [ ] Profile completion changes after saving bio, photo, and portfolio fields.
- [ ] A Client can save a published freelancer, see it under Saved Freelancers, remove it, and cannot read another client's saved list.
- [ ] Freelancer saves Experience and Availability; advanced Explore filters match these values.
- [ ] Original photos up to 10 MB open the crop editor; the final upload is 10–200 KB or shows a clear validation error.
- [ ] Test freelancer visibility and existing portfolio CRUD; signed-out guests still see the homepage category notice.
- [ ] On a **disposable test account only**, confirm the delete flow reauthenticates and removes Firestore/Auth account data. Confirm Cloudinary asset deletion still requires an administrator.

## Updated files relative to Phase 3.2 Google Auth Fix

Modified: `login.html`, `index.html`, `signup.html`, `reset-password.html`, `terms.html`, `privacy.html`, `freelancer-profile.html`, `freelancer-dashboard.html`, `client-dashboard.html`, `js/auth-pages.js`, `js/avatar.js`, `js/dashboard.js`, `script.js`, `firestore.rules`, `README.md`.
New: `js/ui-preferences.js`, `preferences.css`.

---

# FreeLanzo Phase 3.2 — Landing category → filtered Explore

This is an incremental Phase 3.1 update. All existing authentication, dashboards, profiles, projects, and photos are preserved.

## New behavior (updated: no forced guest redirect)

- All **15** Find Your Field cards on the landing page are keyboard-accessible links.
- **Signed-in clients and freelancers:** selecting a category opens their role-correct dashboard at **Explore Freelancers**, with the exact category preselected. The normal search and filters still work.
- **Visitors without an account:** the landing page shows **“Sign up or log in first to see freelancers”** and **keeps them on the home page**. They can choose Log In, Sign Up, or Not now; there is no automatic redirect.
- If an existing member clicks **Log in** from the signup page, the category is preserved. Successful signup/login also returns the member to the filtered directory.
- The destination always checks Firebase Auth; no private freelancer data is exposed to guests. Published public portfolios remain owner-editable only.
- No new Firestore rules or collections are needed. Existing Explore currently loads **up to 80** published freelancer profiles, then filters them; results beyond that limit need pagination in a later scaling pass.

## Modified files (relative to the previous Phase 3.1 ZIP)

1. `index.html` — clickable 15 cards, a dismissible guest notice with Log In / Sign Up / Not now, category-navigation module.
2. `styles.css` — linked-card focus/hover/hidden styles and guest notice actions.
3. `js/dashboard-router.js` — preserves `view=explore` and category while choosing the right dashboard; returns guest category deep-links to the home-page notice.
4. `js/dashboard.js` — preselects the category filter and preserves it across role redirects.
5. `js/auth-pages.js` — preserves chosen category through signup/login and redirects to filtered Explore.
6. `js/cloudinary-config.js` — includes your previously supplied Cloudinary cloud name and unsigned preset, so replacing the whole ZIP won't wipe your setup. These are public identifiers; no secret is included.
7. `README.md` — this update and checkpoints.

## New files

1. `js/category-navigation.js` — Auth-aware landing category navigation; guests stay on the page and can choose whether to log in or sign up.

## Install and test

1. Back up your current working FreeLanzo folder.
2. Extract this ZIP and replace the **modified files** listed above; add the **one new file** in `js/`. Keep every other file unchanged.
3. Start Live Server. Test selecting **Web Development** while logged in as Client: it should open Client → Explore with **Web Development** selected. Repeat with Freelancer.
4. Log out, select **Graphic Design** from the home page: notice appears but you **remain on the home page**. Choose Sign Up and create a test account; it should open Explore with Graphic Design selected.
5. Test **Already have an account? Log in** from the signup page: the category should remain selected after signing in.
6. Test the mobile category grid and category search.

No Firebase or Cloudinary console changes are required for this update.

---

# FreeLanzo — Phase 3.1: Profile photos + read-only public freelancer portfolios

**Built directly on Phase 3.** All Phase 1 landing content and approved FL logo, Phase 2 Firebase login/signup, and Phase 3 role-specific dashboards are preserved. Uses your existing Firebase project **`freelanzo-82`**. HTML/CSS/vanilla JS, hosted on a static HTTP server such as Live Server or GitHub Pages. The existing Messaging section is still a placeholder.

## 1. Install

1. Back up your working FreeLanzo folder.
2. Extract the entire ZIP and use **all** its files, including the `/js` and `/assets` folders. Open this folder in VS Code.
3. Open Firebase Console → `freelanzo-82` → Firestore Database → Rules, paste the new `firestore.rules`, then **Publish**. If you already added rules for messaging or another later phase, **merge those rules**; do not replace them with the template alone.
4. Continue using Firebase Authentication with the previously configured Email/Password + Google providers. Don't create a new Firebase project or change its config.
5. Launch `index.html` via Live Server. Opening by `file://` doesn't support all Firebase modules.

## 2. Configure Cloudinary for photos (free plan; YOUR cloud name required)

1. Create or sign in to a Cloudinary account at https://cloudinary.com/ .
2. In Cloudinary's Console find the **Cloud name** (not API key or API secret).
3. In Settings → Upload → Upload Presets, create a preset, choose **Unsigned** signing mode and name it something like `freelanzo_profile_photos`.
4. Restrict the preset: **image-only use**, **allowed formats JPG/PNG/WebP**, and preferably a fixed asset folder such as `freelanzo/avatars`; enable automatic normalization to reasonable avatar dimensions and remove metadata if those options are available in your Cloudinary UI. Do **not** accept arbitrary file types or expose your API secret. Make sure the preset is **Unsigned**.
5. Open `js/cloudinary-config.js` and replace these placeholders:

```js
export const CLOUDINARY_CLOUD_NAME = "your_cloud_name";
export const CLOUDINARY_UPLOAD_PRESET = "freelanzo_profile_photos";
```

6. Save, reload the page, and try uploading a photo between 100 and 200 KB from **My Profile**.

**Important security/limits:** This static-hosting version uploads directly to a Cloudinary **unsigned** preset. The browser rejects files above **10,000–200,000 bytes (10–200 KB)** and normalizes them to a center-cropped square (400–1000 px, as needed) before upload. Cloudinary does **not** offer a per-unsigned-preset server-enforced file-size limit; an attacker using the public preset outside this UI can bypass browser checks. For a production site that needs a strict server-side 10–200 KB limit or per-user upload permission, add a verified Firebase Auth backend that validates the file and performs signed uploads. Unsigned uploads also require external Cloudinary administration to delete files; pressing **Remove photo** removes the URL from FreeLanzo, but does not delete the Cloudinary asset itself. Never commit a Cloudinary API secret to this repository.

## 3. Photo upload and display

- On Freelancer and Client dashboards → **My Profile**, choose JPG, PNG, or WebP of **10–200 KB**, preview the cropped image, then click **Upload photo**.
- Uploaded images are converted to a center-cropped square (400–1000 px, as needed) and compressed (usually to WebP) before upload; we check the upload blob is also between 100 and 200 KB.
- The Cloudinary HTTPS URL is stored only as `avatarURL` on the private `/users/{uid}` document and copied to the public freelancer directory only when the freelancer has explicitly published their profile.
- The picture displays in the landing-page signed-in header, dashboard header, sidebar, profile preview, Explore listings, and published freelancer profile page.
- **Remove photo** clears the reference from the user's profile and any published freelancer profile. Empty images show initials.
- The standard `photoURL` value from Phase 2 Google signup is not automatically placed on the public freelancer page. Only a user-chosen photo is shared publicly.

## 4. Read-only public freelancer profile

1. Sign in as a **Freelancer**. In **My Portfolios**, add one or more project descriptions.
2. On **Dashboard Home**, enable **Make my freelancer profile discoverable**, then **Save visibility**. Existing projects are copied into an allowlisted public project collection; unpublished projects stay accessible only to you.
3. Sign in as a **Client** (or another Freelancer). Open **Explore Freelancers**, choose a real published person and click **View full profile**.
4. The new `freelancer-profile.html?id=<uid>` shows: their chosen photo, name, headline, category, location, bio, skills, and published projects with optional safe project links. There are **no edit/delete buttons** and the viewer's Firestore rules cannot write to someone else's profile or projects.
5. Contact fields such as the registered **email** (or any private account field) are never copied to public collections. The app also attempts to redact typical phone/email patterns if they are accidentally typed in the published bio, titles or descriptions. Redaction is best-effort; advise users never to place sensitive information in free-text public fields.
6. If the freelancer unpublishes their profile, visitors lose access to their public page and public projects immediately. Re-publishing synchronizes their current projects again.
7. New/edited/deleted portfolio projects are updated in private and public collections **atomically** while the freelancer is published. Projects are always owner-editable, visitor-read-only.

## 5. Firestore collections and permission model

| Path | Read permissions | Write permissions |
|---|---|---|
| `users/{uid}` | Account owner only | Owner, restricted profile fields (role & email cannot change) |
| `users/{uid}/portfolios/{id}` | Owner only | Freelancer owner only |
| `publicFreelancers/{uid}` | Signed-in members when published; owner | Freelancer owner only, allowlisted public fields |
| `publicFreelancers/{uid}/projects/{id}` | Signed-in members when parent is published; owner | Freelancer owner only, allowlisted project fields |

Firestore **security rules**, not hidden UI controls, enforce access. No `allow read, write: if true` is included. Public project records are copies containing only title, category, description, optional project link and timestamps—not email, phone, or the owner's private account document.

## 6. Checkpoints for testing

- [ ] Existing signup (Google + email/password), login, role checks and password reset still work.
- [ ] Freelancer and Client both upload an image between 100 and 200 KB; show it in the header, sidebar and My Profile.
- [ ] A file outside 10–200 KB is rejected with a message; non-image types are rejected.
- [ ] Profile photos can be removed and revert to initials.
- [ ] A freelancer who has not published does **not** appear in Explore.
- [ ] Publish a freelancer; open their **View full profile** link as a Client.
- [ ] Public page shows their projects and no edit/delete controls.
- [ ] As a Client, attempting to directly read another member's `users/{uid}` or private `portfolios` path in Firestore should be denied.
- [ ] Add, edit and delete a project as a published Freelancer; refresh the public page and verify the changes.
- [ ] Turn off public visibility; public profile and projects become unreadable by another user.
- [ ] Sign out and visit a public profile link: it should ask you to log in.
- [ ] Mobile navigation, Explore search and category filters still work.

### File map

- `js/avatar.js` — input validation, resize/compress, Cloudinary upload, safe avatar rendering.
- `js/cloudinary-config.js` — *your* Cloudinary cloud name and unsigned preset.
- `js/dashboard.js` — updated private profiles, photos, public portfolio synchronization and Explore links.
- `js/session-nav.js` — signed-in landing header avatar.
- `freelancer-profile.html`, `js/public-profile.js` — read-only published freelancer profile + projects.
- `firestore.rules` — updated read/write validation and public visibility guard.
- `dashboard.css` and `styles.css` — avatar and public-profile layouts.
- All other pages/code/assets continue from Phase 3.

## Notes for team demos

This source bundle passed local static validation and JavaScript syntax checks. **Live Cloudinary and Firebase behavior requires your own project/preset credentials and testing in your browser.** Cloudinary free-tier allowances and availability can change, so check the provider's current plan before relying on it for a production service.

## Phase 3.2 guest-category fix (November 15, 2026)

**What was wrong:** Landing category cards were still ordinary links to `dashboard.html`.
When Firebase scripts failed to load or were delayed, the login check never ran and
an unsigned visitor landed on the "Opening your workspace" route page.

**What is now different:** All fifteen cards have guest-safe `index.html` fallback URLs.
The regular `script.js` intercepts clicks and displays the Login / Sign Up / Not now
notice without needing Firebase. `js/category-navigation.js` reports signed-in status
once Firebase loads; only confirmed signed-in accounts navigate to filtered Explore.
Guest users remain on the home page, including if Firebase is offline or they use
"Open in new tab". No database, Firebase, or Cloudinary settings need changing.

**Modified files (3):** `index.html`, `script.js`, `js/category-navigation.js`.
`README.md` was also updated (documentation only). **New files: none.**

**Quick test:** Open the site with Live Server in a private/incognito window,
click Web Development, and verify the guest prompt appears on the landing page.
Choose Not now to dismiss. Then sign in and click the same category: you should
reach Explore Freelancers with Web Development selected. Test Ctrl+Click on a card
while logged out as well. Refresh with Ctrl+Shift+R if the browser cached old JS.


### Photo crop editor (Phase 3.3 refinement)
Selecting an original JPG, PNG or WebP up to 10 MB opens a crop dialog. Drag to reposition the square crop, use the zoom slider (1–4×), and press **Use this crop**. Keyboard users can focus the canvas and use arrow keys (Shift+arrows for larger movement). The crop is compressed to a 10–200 KB square prior to Cloudinary upload. Cancel does not change the saved profile photo. All size checks are client-side only; Cloudinary does not enforce them unless configured server-side.

---

## Phase 3.3 — Dark theme and Hindi/Marathi display fix (15 November 2026)

This update fixes the inconsistent dark mode and partially untranslated content reported in the homepage screenshots while preserving Phase 3.3 functionality, Google/email authentication, dashboard routing, Cloudinary uploads, photo cropping and Firestore rules.

- **Consistent dark mode:** Categories, How It Works, Why FreeLanzo, About, CTA, directory cards, form inputs and category guest notices now use readable dark surfaces and appropriate contrast. The intentionally dark showcase/illustrations retain their original aesthetic. Header profile card, search box, mobile menu, account/portfolio cards and legal pages have matching dark styles.
- **Broader multilingual coverage:** Hindi and Marathi translations now cover homepage hero and section titles, descriptive copy, buttons, navigation, category guest notices/counts, account page headings, profile/directory UI, and privacy/terms pages. Dynamic directory counts and category guest notices are localized. User-provided profile and project text is intentionally not machine-translated.
- **Better Devanagari layout:** Headings use a Devanagari-capable font fallback and adjusted tracking, line height and size; translated navigation collapses into a mobile-style menu at narrower widths.
- **Translation accessibility:** Placeholder text, aria labels and title attributes can now be translated when a translation is provided. Language selection persists in local storage as before.
- **Accurate copy:** Replaced stale pre-portfolio and 500 KB statements with current Phase 3.3 features and the 10–200 KB final cropped photo upload condition. Terms/Privacy remain student-project drafts and require review before production.

**Files modified compared with the Phase 3.3 crop-editor package:** `preferences.css`, `js/ui-preferences.js`, `index.html`, `dashboard.html`, `privacy.html`, `terms.html`, and `README.md`. No Firebase config or Firestore rules changes required for this visual/language fix.

**Verification:** All JS files passed `node --check`, stylesheets parsed, translation mappings for every static page heading were checked, and a headless Chromium static-page render confirmed dark/HI language compatibility on all 10 HTML pages. The homepage was checked in English/Hindi/Marathi at 1280/960/390px; no horizontal overflow was observed, all major sections rendered dark, and category guest notices localized correctly. These are UI tests **without a live Firebase session**; test signed-in pages with your actual Firebase setup after deployment.

**Deployment:** Replace the changed files or extract the full ZIP into your FreeLanzo repository, commit and push to GitHub Pages. Use **Ctrl+Shift+R** to force-refresh cached CSS/JS. Verify English/Hindi/Marathi × light/dark on your live site.


## Phase 3.6 — Account deletion reliability and loading states

- Profile, portfolio, visibility, avatar upload/removal, bookmarked freelancer saves, directory refresh, initial workspace loading, and sign-out show accessible progress states. Buttons are disabled while their operations are pending and restored on completion/failure.
- Account deletion now requires recent Firebase reauthentication, hides the freelancer's public profile before removing project copies, removes subcollection documents in batches, and then removes the account document and Firebase Auth identity.
- A minimal `localStorage` recovery marker associated with the authenticated Firebase UID allows deletion to be **resumed on the same browser** if the operation fails after the Firestore account document is removed. Keep browser storage and don't sign up again until deletion is complete. If the page is reloaded with the profile already gone, a recovery panel appears.
- **Important limitations:** A browser-only/static GitHub Pages app **cannot provide guaranteed atomic deletion** across Firestore, Firebase Authentication, and Cloudinary. A second device, revoked permissions, or a network outage can interrupt the process. The recovery marker is device-local. For production-grade guaranteed cleanup (including Cloudinary assets and cross-user references), use a securely authenticated Firebase Cloud Function or other backend with administrative credentials and a durable deletion job. Never put Firebase Admin keys or the Cloudinary API secret in browser JavaScript.
- Firestore rules and Firebase configuration are unchanged. Test deletion ONLY with disposable test accounts; it is irreversible. Be sure to test both Client and Freelancer flows, including Google and password reauthentication and recovery after intentionally interrupting a request.
- **Known scope**: Phase 4 now enforces 10–200 KB on the final cropped avatar, with originals up to 10 MB.


---
# Phase 4 — Real-Time Text Chat & Work Offers (17 November 2026)

This version deliberately removes all media attachments from chat. Two registered participants (one Client and one Freelancer) can exchange **text messages only**, stored in Firestore and updated in real time using `onSnapshot`. The inbox shows conversations and most recent message previews. Clients can initiate chats from Explore or a public freelancer profile. The Freelancer can reply.

## Client work offers

Clients can send a recorded work offer inside a chat with:
- Client/company or person name
- Payment amount in INR
- Selected working days and start/end working hours, with time zone
- Client signature image in JPG, PNG or WebP **up to 30 KB** (stored privately as a base64 data URL in Firestore)

Freelancers can **Accept** or **Decline** a pending offer. Both parties see the outcome in real time. It is a student-project offer record, not an identity-verified legal e-signature or payment service.

## Firebase setup

1. Publish `firestore.rules` from this release in Firebase Console → Firestore Database → Rules. If you've customized rules beyond FreeLanzo, **merge rather than blindly overwrite**.
2. No Firebase Storage setup, CORS file, Storage rules, or paid Cloud Storage plan is needed for text messaging, offers, or the 30 KB signature image.
3. Cloudinary remains configured for public profile pictures and is unrelated to chat.
4. If you deployed a previous media-upload version, separately restrict any existing Firebase Storage `chats/` rules and remove old files as appropriate. Deleting `storage.rules` from this ZIP **does not** undeploy rules or delete already stored media.

## Testing checklist

- [ ] Client starts a conversation with a published Freelancer; both see it in Messages.
- [ ] Both send text that appears without refresh; history persists after reload.
- [ ] There is no paperclip/file picker; blank messages cannot be sent.
- [ ] Client sends a signed work offer (signature JPG/PNG/WebP, <=30,000 bytes) with company/name, INR amount, working days, hours, and time zone.
- [ ] Freelancer Accepts or Declines; both accounts show the updated decision.
- [ ] Third registered account cannot read the private conversation or offer.
- [ ] Attempts to create `kind: 'file'` messages fail against Firestore security rules.
- [ ] Hindi/Marathi and dark mode, bookmarks, profile visibility, and dashboard behavior still work.
- [ ] Final cropped profile photos remain **10–200 KB**; originals can be up to **10 MB**.

## Changed files in this text-only variant

- `js/messaging.js` — removed Storage imports, file previews, uploads and attachment handling; text and work offers preserved.
- `client-dashboard.html`, `freelancer-dashboard.html` — removed media attachment UI.
- `firestore.rules` — denies file messages, permits text and contract markers.
- `dashboard.css` — removed attachment-specific styling.
- `js/ui-preferences.js` — removed obsolete attachment translations, updated chat description.
- `privacy.html`, `terms.html` — descriptions no longer promise chat media uploads.
- `PHASE4_SETUP.md`, `README.md` — updated setup and tests.
- Removed legacy `storage.rules` and `storage-cors.json` from this release (not required by text-only chat).

**Validation:** Local syntax, file-integrity, and interface checks cannot confirm live Firestore permissions. Publish the rules and test with disposable accounts before a demo.


---
## Phase 4.2 — Final candidate (18 November 2026)

New: block/unblock user, private write-only reports, paginated older text messages, send/retry feedback with stable message IDs, Today/Yesterday date separators, print-friendly offers, new password-account email verification, and conversation closure/anonymized inbox names on deletion. Existing real-time chat, unread counts and immutable offers are preserved. Firebase rules now enforce blocks, closed conversations and email verification for newly registered password users.

**New files:** `verify-email.html`, `js/verify-email.js`, `PHASE4_2_DEPLOY.md`, `PHASE4_2_VIVA.md`, `firebase.json`, `package.json`, `tests/firestore-rules.test.mjs`, `tests/structure-check.py`.

**Historic Phase 4.2 note:** That version included a report button. Phase 4.3 removes reporting entirely. Rules and frontend must be deployed together. A browser still cannot guarantee Cloudinary cleanup or atomic account deletion.


## Phase 4.3 — simplified moderation
The Report button, report submission flow, and Firestore report creation permission were removed. Blocking remains available. No admin dashboard, custom claims, account bans, or moderation notifications are required. See **PHASE4_3_DEPLOY.md**. Existing report documents, if any, are not deleted automatically.
