# FreeLanzo — Phase 3: Two Role-Specific Dashboards

**Base:** Phase 2 of FreeLanzo (Firebase project `freelanzo-82`). All landing-page content, the existing white/coral FL logo, 15 categories, login, signup, Google login, password show/hide, remember-me and password reset are preserved. Vanilla HTML/CSS/JavaScript; no npm setup needed.

## Start here

1. **Back up the currently working Phase 2 folder.** Replace its files with the files from this Phase 3 ZIP, keeping their folder structure. Opening `index.html` alone using the `file://` protocol cannot run Firebase modules. Use VS Code **Live Server** or another local HTTP server.
2. Open **Firebase Console → freelanzo-82 → Firestore Database → Rules**. Paste the included `firestore.rules` and **Publish**. These rules extend Phase 2: private accounts, opt-in directory listings, and owner-only portfolios. **Do not overwrite any rules for other features you already have.** Merge them carefully.
3. Ensure Email/Password and Google are already enabled under **Authentication → Sign-in method**, and your current site host is under **Authentication → Settings → Authorized domains**.
4. Log in with your **existing** freelancer and client test accounts. There's no need to create new accounts or move the Firebase project.
5. After login the existing `dashboard.html` routes each user to the correct role-specific dashboard. The profile button in the landing page and on either dashboard always opens the dashboard home.

## Dashboard pages

| Role | URL | Sections |
|---|---|---|
| Freelancer | `freelancer-dashboard.html?view=home` | Dashboard Home, My Profile, My Portfolios, Explore Freelancers, Messages, Settings |
| Client | `client-dashboard.html?view=home` | Dashboard Home, My Profile, Explore Freelancers, Messages, Settings |

`dashboard.html` remains the single destination after login/signup and redirects based on the **role stored in Firestore**, not the URL or a browser setting. Directly navigating to a dashboard for the wrong role redirects to the correct dashboard. An unauthenticated visitor is sent to login. Firestore security rules separately enforce data permissions; hiding links alone is not security.

### Working features

- **Header:** same logo and Home / Categories / Why FreeLanzo / About Us links as your landing page. Login/Signup buttons become a real profile button for a signed-in visitor, also on the landing page.
- **Dashboard Home:** real name and account type. Freelancers see a real portfolio count and public-profile visibility. Clients see published freelancers count after loading Explore.
- **My Profile:** save display name, headline, location, bio; freelancers additionally have skills and one main category. Saved into the existing private `users/{uid}` Firestore document. Client profiles stay private.
- **My Portfolios (Freelancer):** add, edit, and delete projects (title, category, description, optional HTTPS URL) in private `users/{uid}/portfolios/{projectId}` documents. Portfolio projects are visible only to their owner for Phase 3.
- **Explore Freelancers:** shows only *real*, opted-in freelancer profiles from `publicFreelancers`. Filter by category and search names, headlines, skills, descriptions. No fabricated users or exposed email addresses. The first 80 published profiles are queried; pagination is out of scope for this college milestone.
- **Messages:** honest empty state, reserved for the real-time chat phase; there are **no simulated conversations**.
- **Settings:** account email and role (read-only), password-reset link, sign out. Freelancers can opt in/out of the discoverable directory using a real database record. When an already-public freelancer edits their profile, private/public profile updates happen together in a Firestore batch.
- **Mobile:** responsive side navigation and collapsible landing-style header navigation.

### Phase 3 checkpoint tests

1. Create/login as Freelancer → `freelancer-dashboard.html?view=home` → all **six** sections show.
2. Click the header profile button → Dashboard Home, from both landing page and dashboard.
3. Edit My Profile → Save → refresh → changes persist in Firestore.
4. Add/edit/delete a portfolio item → refresh → Firestore data is consistent.
5. Settings → switch on **Make my freelancer profile discoverable** → Save. Check `publicFreelancers/{uid}` exists.
6. Login as Client → `client-dashboard.html?view=home` → Dashboard Home + the **four requested** tabs. No My Portfolios navigation.
7. Explore Freelancers as Client → your published Freelancer appears → category/search filters work. You should **not** see that freelancer's email.
8. Switch Freelancer discoverability off → Refresh directory as Client → listing disappears.
9. Copy direct URL to `freelancer-dashboard.html?view=portfolios` while signed in as a Client → redirects to Client Dashboard; data permissions also deny unauthorized reads.
10. Visit either dashboard while logged out → returned to Login. Recheck Google sign-in, email sign-in, password reset, and both roles after the change.

## Firestore collections

- `/users/{uid}`: **private** account role, email, terms agreement, display name and editable profile fields. Account role cannot be edited from the frontend.
- `/users/{uid}/portfolios/{portfolioId}`: **private** portfolio entries, freelancer owner only.
- `/publicFreelancers/{uid}`: optional published directory profile, no email. Deleting this document hides the profile.

**Important:** This is a working Phase 3 baseline; Firebase account/database testing must be performed against your project after publishing the new rules. Avoid turning the `users` collection into a public directory or using `allow read, write: if true`.

## Files

```
index.html                        Existing landing page with signed-in profile button
login.html, signup.html          Existing Phase 2 login/signup, unchanged
reset-password.html             Existing password reset, unchanged
freelancer-dashboard.html       Freelancer workspace
client-dashboard.html           Client workspace
dashboard.html                  Authenticated role router
styles.css                      Existing landing styles + profile button
dashboard.css                   Dashboard UI + responsive styles
auth.css                        Existing auth page styles
js/firebase-config.js           Unchanged freelanzo-82 settings
js/firebase.js                  Firebase initialization
js/auth-pages.js                Existing Phase 2 auth workflows
js/session-nav.js               Header signed-in state
js/dashboard-router.js          Role-based routing
js/dashboard.js                 Dashboard, profile, portfolios, directory, settings
firestore.rules                 Publish updated security rules
assets/                         Existing FreeLanzo logos/favicon
terms.html, privacy.html        Existing student-project policy drafts
```

**Note:** Messages are intentionally a placeholder because real one-to-one chat and security rules for conversations have not yet been specified in this phase. Phase 4 can add messaging without changing the UI's brand styling.
