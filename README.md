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

6. Save, reload the page, and try uploading a photo under 500 KB from **My Profile**.

**Important security/limits:** This static-hosting version uploads directly to a Cloudinary **unsigned** preset. The browser rejects files above **500,000 bytes (500 KB)** and normalizes them to a 400×400 square before upload. Cloudinary does **not** offer a per-unsigned-preset server-enforced file-size limit; an attacker using the public preset outside this UI can bypass browser checks. For a production site that needs a strict back-end 500 KB limit or per-user upload permission, add a verified Firebase Auth backend that validates the file and performs signed uploads. Unsigned uploads also require external Cloudinary administration to delete files; pressing **Remove photo** removes the URL from FreeLanzo, but does not delete the Cloudinary asset itself. Never commit a Cloudinary API secret to this repository.

## 3. Photo upload and display

- On Freelancer and Client dashboards → **My Profile**, choose JPG, PNG, or WebP of **500 KB or less**, preview the cropped image, then click **Upload photo**.
- Uploaded images are converted to a 400 × 400 square and compressed (usually to WebP) before upload; we check the upload blob is also under 500 KB.
- The Cloudinary HTTPS URL is stored only as `avatarURL` on the private `/users/{uid}` document and copied to the public freelancer directory only when the freelancer has explicitly published their profile.
- The picture displays in the landing-page signed-in header, dashboard header, sidebar, profile preview, Explore listings, and published freelancer profile page.
- **Remove photo** clears the reference from the user's profile and any published freelancer profile. Empty images show initials.
- The standard `photoURL` value from Phase 2 Google signup is not automatically placed on the public freelancer page. Only a user-chosen photo is shared publicly.

## 4. Read-only public freelancer profile

1. Sign in as a **Freelancer**. In **My Portfolios**, add one or more project descriptions.
2. In **Settings**, enable **Make my freelancer profile discoverable**, then **Save visibility**. Existing projects are copied into an allowlisted public project collection; unpublished projects stay accessible only to you.
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
- [ ] Freelancer and Client both upload an image under 500 KB; show it in the header, sidebar and My Profile.
- [ ] A file over 500 KB is rejected with a message; non-image types are rejected.
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
