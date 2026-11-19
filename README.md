# FreeLanzo

**A freelance portfolio and collaboration platform for Clients and Freelancers.**

[Live Website](https://aarush1909.github.io/FreeLanzo/) · [GitHub Repository](https://github.com/Aarush1909/FreeLanzo)

**Current release:** Phase 4.3 — simplified, responsive website with authentication, role-specific dashboards, freelancer portfolios, discovery, real-time text messaging, work offers, blocking, and email verification. The latest follow-up fixes improve the mobile menu, chat actions, login-page spacing, and **Find Your Field** category navigation.

> **Project status:** Feature implementation for the college-project MVP is complete. End-to-end testing with the deployed Firebase project is still required before a public/production launch. FreeLanzo is a student project, not a commercial payment or legally verified contracting service.

---

## Contents

1. [About the project](#about-the-project)
2. [Objectives](#objectives)
3. [Technology stack](#technology-stack)
4. [Key features](#key-features)
5. [Development journey: Phase 1 to Phase 4.3](#development-journey-phase-1-to-phase-43)
6. [How FreeLanzo works](#how-freelanzo-works)
7. [Work offers and contract lifecycle](#work-offers-and-contract-lifecycle)
8. [Project structure](#project-structure)
9. [Firebase and Cloudinary setup](#firebase-and-cloudinary-setup)
10. [Run locally](#run-locally)
11. [Deploy to GitHub Pages](#deploy-to-github-pages)
12. [Firestore data model](#firestore-data-model)
13. [Security and privacy](#security-and-privacy)
14. [Testing checklist](#testing-checklist)
15. [Known limitations](#known-limitations)
16. [Possible future improvements](#possible-future-improvements)

## About the project

**FreeLanzo** is a web-based platform that helps freelancers present their skills, publish portfolios, and connect with clients looking for project collaborators. Instead of simply displaying sample cards or fake conversations, it uses Firebase for real accounts, persistent data, and two-way messages.

Two account types are supported:

| Freelancer | Client |
|---|---|
| Creates a personal profile and portfolio projects | Creates a personal/client profile |
| Publishes or hides a discoverable freelancer profile | Discovers and saves freelancers |
| Receives and replies to messages | Starts conversations with published freelancers |
| Reviews, accepts, or declines client work offers | Sends work offers and cancels pending offers |
| Can block/unblock another participant | Can block/unblock another participant |

The interface uses a **minimal, original black/white/red visual style** with responsive layouts, and supports **English, Hindi, and Marathi** for major UI text. The aesthetic is inspired by high-contrast editorial/industrial design but does not use third-party brand assets.

## Objectives

- Create a useful and responsive portfolio platform using web fundamentals.
- Offer separate experiences for Clients and Freelancers.
- Protect private accounts while enabling opt-in freelancer discovery.
- Allow genuine, persistent, one-to-one communication.
- Record simple work-offer terms without implementing payments.
- Explore Firebase Authentication, Firestore real-time updates, Security Rules, and third-party image hosting.
- Keep the website deployable to a static hosting service such as GitHub Pages.

## Technology stack

| Layer | Technologies | Purpose |
|---|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES modules) | Pages, layout, forms, navigation, responsive UI |
| Authentication | Firebase Authentication | Email/password and Google sign-in, email verification, sessions |
| Database | Cloud Firestore | Private profiles, published portfolios, bookmarks, chats, offers, block records |
| Real-time messaging | Firestore `onSnapshot` | Immediate updates to conversations and inbox |
| Security | Firestore Security Rules | Owner, participant, and role-based data permissions |
| Profile images | Cloudinary | User-selected cropped profile photos |
| Hosting | GitHub Pages | Static public website |
| Local development | VS Code + Live Server (or another HTTP server) | Test the website locally |
| Optional rule testing | Node.js, Firebase CLI, Firebase Emulator Suite, Java | Local Firestore rule tests |

**No React, application server, Firebase Storage for chat, or payment gateway is required for the current MVP.** A Node.js build step is not needed to serve the site. The included `package.json` is for optional Firebase rules testing, not for building the website.

## Key features

### Landing page and discovery

- Home, Categories, Why FreeLanzo, and About Us sections.
- A responsive landing page with search and category filtering.
- **15 freelancer categories:** Web Development; Graphic Design; Mobile App Development; Digital Marketing; Video Editing; Writing & Translation; Data Science & Analytics; AI & Machine Learning; UI/UX Design; Photography; Cybersecurity; 3D Design & Animation; Virtual Assistance; Business & Consulting; Education & Tutoring.
- **Find Your Field** cards: a signed-in user is sent to their dashboard's **Explore Freelancers** view with the chosen category selected; guests see a login/signup prompt instead of being silently redirected.
- Signed-in visitors see a profile/dashboard entry rather than guest authentication buttons.

### Authentication and account management

- Email/password signup and login, plus Google authentication.
- Required **Client/Freelancer** account type at signup. **Login detects the saved role automatically**; there is no login-page role selector.
- Password confirmation, show/hide controls, required Terms acknowledgement, and helpful validation messages.
- **Remember me** controls Firebase session persistence.
- Password reset by email.
- **Email verification for newly registered email/password accounts**, with a dedicated verification page, resend option, and verification-status check. New Google accounts do not need a separate verification step; older accounts without the new verification flag retain legacy behavior.
- Authenticated role-based dashboard routing and sign-out functionality, including **Sign Out inside the mobile three-line navigation menu**.

### Profiles and portfolios

- Editable name, headline, location, and biography for both roles.
- Freelancer skills, primary category, experience level, and availability.
- Freelancer portfolio project **create, read, update, and delete** operations, including descriptions and optional links.
- A profile-completion indicator on dashboard home.
- Upload, crop, preview, or remove a profile photo.
- **Original photo:** up to **10 MB** for cropping. **Final processed/uploaded photo:** **10–200 KB** (10,000–200,000 bytes). Accepted image formats include JPG, PNG, and WebP.
- Opt-in **Show up in Explore Freelancers** setting on the **Freelancer Dashboard Home**. Unpublished freelancers are hidden from the directory.
- Read-only public freelancer profile and published project pages for signed-in members. Private account email and other sensitive account fields are not published in directory records.

### Freelancer search and bookmarks

- Explore real published freelancer accounts (no fictional profiles).
- Search by name, skills, and relevant profile text; filter by category, experience level, and availability.
- **Saved Freelancers** for Clients, with private user-specific bookmarks.
- Selected homepage categories carry over into Explore.

### Messaging and work offers

- Real-time, persistent **one-to-one text chat between a Client and Freelancer** using Firestore listeners.
- Conversation inbox, recent-message previews, timestamps, and unread counters.
- Chat history pagination in batches of **100 messages**, including **Load earlier messages**.
- Today/Yesterday/date separators, failed-send feedback, and retry without intentionally creating duplicate message IDs.
- Conversations and offers are restricted to their participants by Firestore rules; unrelated users cannot read them.
- A **three-dot menu** in each conversation header with **Work Offer** (Client only) and **Block/Unblock User** actions.
- Blocked pairs cannot exchange new messages or offers; past messages remain readable to the participants.
- On small screens, chat provides a way back from the conversation to the inbox.
- **Text-only messaging:** no attachments, voice calling, automatic replies, or chat media uploads.

### Work-offer management

- Clients can send a structured offer with company/person name, INR amount, description, deadline, working days, hours/timezone, payment terms, and a signature image (**maximum 30 KB**).
- Freelancers can accept or decline pending offers; Clients can cancel pending offers.
- Offers have recorded statuses and cannot be edited after sending. Finalized terms/statuses cannot be arbitrarily changed.
- Confirmation before acceptance or decline, plus a print-friendly offer summary.
- Offer records are saved in Firestore; **no money is collected or transferred**.

### Preferences and mobile usability

- Light and dark appearance modes, with preference saved in the browser.
- English, Hindi, and Marathi options for core interface text; this is **not automatic translation of user-written content**.
- Responsive landing, login, freelancer/client dashboards, and chat layouts.
- Improved login-header spacing, mobile three-line menu, and mobile Sign Out.
- Keyboard/focus and status-message improvements in key interactions.

## Development journey: Phase 1 to Phase 4.3

| Release | What was added or changed |
|---|---|
| **Phase 1 — Landing page** | FreeLanzo branding and logo, minimalist responsive homepage, 15 categories, site information, search, and category-filter UI. |
| **Phase 2 — Authentication** | Firebase setup, email/password and Google sign-in, signup, Terms/Privacy pages, password reset, account roles, session management. |
| **Phase 3 — Dashboards** | Role-specific Client/Freelancer dashboards, editable profiles, freelancer portfolio CRUD, published directory and settings. |
| **Phase 3.1 — Photos and public profiles** | Cloudinary profile photos; read-only published freelancer pages with project previews; owner-only/private data separation. |
| **Phase 3.2 — Category navigation** | Homepage category links to filtered Explore, plus guest-category behavior and Google authentication fixes. |
| **Phase 3.3 — Experience and privacy** | English/Hindi/Marathi, light/dark mode, profile completion, saved freelancers, advanced filters, account deletion, and automatic login role detection. |
| **Phase 3.3 refinements** | Crop editor and final-image 10–200 KB rule; responsive theme and translation adjustments. |
| **Phase 3.6 — Dashboard and reliability** | Discoverability setting moved to Freelancer Dashboard Home; operation loading states and account-deletion recovery improvements. |
| **Phase 4 — Messaging and offers** | Real-time text chat, private participant-only conversations, and client-to-freelancer work offers. |
| **Phase 4.1 — Chat/offer refinement** | Unread counts, timestamps, detailed offer fields and payment terms, immutable status transitions, client cancellation and confirmation prompts. |
| **Phase 4.2 — Final-candidate features** | Block/unblock, older-message pagination, resend/retry feedback, chat date separators, printable offers, email verification, and conversation closure during account deletion. Reporting was temporarily prototyped here. |
| **Phase 4.3 — Simplified release** | **Report and admin moderation were removed**. Blocking, verification, messaging and offers remained. No admin account or service-account setup is required. |
| **Phase 4.3 UI and bug-fix patches** | Login-page spacing, conversation three-dot actions, mobile chat/back navigation, Sign Out in the mobile three-line menu, and a fix to avoid duplicate category-card handlers incorrectly prompting signed-in users to log in. |

> **Current behavior takes precedence over earlier releases.** In particular: there is **no Report feature**, no moderation dashboard, no login role selector, no chat attachment option, and the final cropped avatar limit is **10–200 KB**, not the original Phase 3.1 limit.

## How FreeLanzo works

### Freelancer journey

1. Open FreeLanzo and register as a **Freelancer** (or sign in to an existing Freelancer account).
2. Complete email verification if required for a new password account.
3. Complete the profile, select a main category and skills, and optionally upload a cropped profile photo.
4. Add portfolio projects in **My Portfolios**.
5. Enable **Make my freelancer profile discoverable** from **Dashboard Home** to appear in Explore.
6. Receive Client messages, discuss a project, and accept or decline an offered contract.
7. Manage account preferences or block a conversation participant if necessary.

### Client journey

1. Register as a **Client** (or sign in to an existing account).
2. Complete the profile and open **Explore Freelancers**.
3. Search by category, skill, experience, or availability; save relevant freelancers.
4. Open a published freelancer profile and start a conversation.
5. Use the conversation's three-dot menu to prepare and send a **Work Offer**.
6. Review its status and, if still pending, cancel it if plans change.

### Guest journey

Guests can browse the homepage and categories but cannot view private conversations or workspaces. Clicking a **Find Your Field** card while signed out shows an invitation to log in or sign up. After authenticating, the selected category can be carried into Explore.

## Work offers and contract lifecycle

Each work offer contains the Client/company name, payment amount (**INR**), project description, deadline, working days/hours, timezone, payment terms and optional payment details, and a **client-provided image signature no larger than 30 KB**.

```text
                       Client sends offer
                               |
                            PENDING
                      /        |         \
          Freelancer accepts   |    Freelancer declines
                    |          |             |
                 ACCEPTED      |          DECLINED
                               |
                      Client cancels
                               |
                            CANCELLED
```

- Only Clients initiate offers.
- Only the named Freelancer accepts or declines a pending offer.
- The Client can cancel a **pending** offer, but not an accepted/declined one.
- Accepted, declined, and cancelled offers are final states; the saved terms cannot be edited.
- If terms need to change, the Client can cancel a pending offer and send a new one.
- A signature image is **not** a legally verified e-signature; recorded offers are **not** an escrow or payment solution.

## Project structure

### GitHub Pages repository (current flat-file layout)

Your deployed GitHub repository keeps JavaScript and SVG files **in the repository root**. The site works with this layout when HTML script/asset references and JavaScript imports point to those root-level files.

```text
FreeLanzo/
├── index.html                   # Landing page and Find Your Field
├── login.html                   # Sign-in
├── signup.html                  # Registration
├── reset-password.html          # Password reset
├── verify-email.html            # New-account email verification
├── dashboard.html               # Role-based routing
├── client-dashboard.html        # Client workspace
├── freelancer-dashboard.html    # Freelancer workspace
├── freelancer-profile.html      # Published, read-only profile
├── terms.html                   # Project Terms draft
├── privacy.html                 # Project Privacy draft
├── styles.css                   # Landing design
├── auth.css                     # Authentication pages
├── dashboard.css                # Dashboard, chat and mobile styling
├── preferences.css              # Theme and preferences styling
├── script.js                    # Homepage search/navigation UI
├── category-navigation.js       # Firebase-aware category navigation
├── session-nav.js               # Signed-in header/profile link
├── auth-pages.js                # Login, signup and password reset
├── firebase-config.js           # Public Firebase web configuration
├── firebase.js                  # Firebase initialization
├── dashboard-router.js          # Route users by saved role
├── dashboard.js                 # Profiles, Explore, portfolios, settings
├── messaging.js                 # Real-time chat, offers, blocks
├── public-profile.js            # Read-only profile loading
├── avatar.js                    # Photo processing/upload
├── avatar-crop.js               # Photo crop interface
├── cloudinary-config.js         # Cloudinary public identifiers
├── ui-preferences.js            # Language and theme preferences
├── verify-email.js              # Verification UI actions
├── favicon.svg
├── freelanzo-logo.svg
├── freelanzo-monogram.svg
└── README.md
```

Some full-release development ZIPs instead store JavaScript inside `js/` and logos inside `assets/`. **Do not combine paths from the two layouts without updating imports and HTML references.** For your current GitHub repository, use the root-level versions from the GitHub-specific patches.

### Optional development-only files

These may exist in a local full release but **do not need to be uploaded for GitHub Pages**:

```text
firestore.rules                # Publish separately in Firebase Console
firebase.json                  # Local emulator configuration
package.json                  # Local rule-test dependencies/scripts
tests/                       # Local Firestore and structure tests
PHASE4_SETUP.md               # Additional release guidance
PHASE4_3_DEPLOY.md            # Phase 4.3 deployment notes
```

## Firebase and Cloudinary setup

The website uses an **existing Firebase project**. The checked project configuration references `freelanzo-82`; use whatever project is actually configured in the deployed `firebase-config.js`. You do **not** need to create a separate project for each phase.

### 1. Firebase Authentication

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Select the project referenced by `firebase-config.js`.
3. Open **Authentication → Sign-in method** and enable **Email/Password** and **Google**.
4. In **Authentication → Settings → Authorized domains**, authorize your GitHub Pages host: `aarush1909.github.io`. Keep your local development host (`localhost`, or `127.0.0.1` when applicable) authorized for testing as needed.
5. Under **Authentication → Templates**, review the email-verification and password-reset emails. Test verification with a new disposable password account.

Email verification is handled by `verify-email.html` and `verify-email.js`; the verification-required flag applies to new password registrations. Firebase Authentication still performs the actual email verification.

### 2. Cloud Firestore and Security Rules

1. Ensure a **Cloud Firestore** database exists in the same Firebase project.
2. In **Firestore Database → Rules**, review and publish the **Phase 4.3 `firestore.rules`** appropriate for the currently deployed messaging code.
3. Back up existing rules before changes, especially if other collections were added manually.
4. Deploy the matching frontend and security rules together when updating messaging schemas. Do not revert to open-access rules.
5. Use disposable Client and Freelancer accounts to verify the actual permissions.

**Important:** Publishing website files on GitHub **does not publish Firestore Security Rules**. The latter are configured in Firebase Console (or via an intentional Firebase CLI deployment).

### 3. Cloudinary profile photos

1. Set up a Cloudinary account and an **unsigned, image-only upload preset**.
2. Configure the cloud name and preset in `cloudinary-config.js`.
3. Restrict the preset to suitable image formats/folders where supported.
4. Test the crop-and-upload flow: original image up to **10 MB**, processed image **10–200 KB**.

Never put a Cloudinary API secret, Firebase service-account key, or other private administrator credentials in browser code or your public GitHub repository. The Firebase **web app config** is public by design; access control depends on Authentication and Security Rules.

### Not required for this release

- A Firebase Admin SDK service account or admin custom-claim setup.
- An admin dashboard or reporting/moderation backend.
- Firebase Storage for messaging attachments.
- A payment gateway or a dedicated backend web server.

## Run locally

1. Clone or download the repository:

   ```bash
   git clone https://github.com/Aarush1909/FreeLanzo.git
   cd FreeLanzo
   ```

2. Open the folder in VS Code.
3. Start **Live Server** (or run any local static HTTP server). Open the address it provides, typically `http://127.0.0.1:5500/`.
4. Ensure the hostname in your browser is authorized in Firebase Authentication and the Firebase web configuration points to your existing project.
5. Test the website using separate disposable **Client** and **Freelancer** accounts.

Do **not** launch Firebase module pages with the `file://` protocol by double-clicking HTML files. Firebase requests require an internet connection, and the hosted Firebase SDK imports must be reachable.

## Deploy to GitHub Pages

1. Back up the working repository and Firebase Security Rules.
2. Upload/commit the updated website files, **preserving the repository's flat JavaScript/SVG layout** and correcting any links when files are moved.
3. In GitHub repository **Settings → Pages**, use the branch and root folder configured for the published site.
4. Make sure `index.html` is at the published root.
5. Separately publish the matching `firestore.rules` in Firebase Console if the release changes database behavior.
6. Open **https://aarush1909.github.io/FreeLanzo/** and hard-refresh (`Ctrl + Shift + R` on Windows) after deployment.
7. Test Login, Google signup, Email Verification, Find Your Field, Explore, Messages, Work Offer, Block/Unblock, and mobile Sign Out.

### Latest Phase 4.3 follow-up fixes

- **Mobile/chat layout:** updated `client-dashboard.html`, `freelancer-dashboard.html`, `auth.css`, `dashboard.css`, and `messaging.js` in the mobile-UI patch.
- **Sign Out in mobile three-line menu:** updated `client-dashboard.html`, `freelancer-dashboard.html`, and `dashboard.css` in the hamburger-menu patch.
- **Find Your Field signed-in navigation:** updated `script.js` and `category-navigation.js` in the category-auth bug-fix patch. These must not both register competing handlers for the same category click.

The correct files depend on which patch is already on GitHub. When applying an incremental patch, avoid replacing more recent files with older ZIP contents.

## Firestore data model

The current project uses these core paths (abbreviated; actual document fields are validated by the deployed rules):

```text
users/{uid}                           # Private account, role, settings and profile
  portfolios/{projectId}              # Freelancer's private portfolio items
  savedFreelancers/{freelancerUid}     # Client's private bookmarks
  blocked/{otherUid}                  # Account-owner block list

publicFreelancers/{uid}                # Discoverable freelancer profile (opt-in)
  projects/{projectId}                # Read-only published portfolio copies

conversations/{conversationId}         # Client + Freelancer participants, preview, unread state
  messages/{messageId}                # Text messages and offer markers
  contracts/{contractId}              # Work-offer records and status changes
```

- Private `users` records are **not** the public directory.
- Only published freelancer profiles and sanitized project copies appear in Explore.
- Participant checks restrict chat and contract records.
- Block records belong to the blocking user.
- **No reporting workflow exists in Phase 4.3.** Earlier experimental `reports` documents, if any, are not automatically deleted by a site update.

## Security and privacy

- **Role separation:** roles are selected at signup and stored in Firestore; the dashboard router checks them at login. Security Rules independently protect data.
- **Private account records:** normal users cannot freely read or edit another person's private user document.
- **Opt-in discovery:** freelancers explicitly publish their profiles; clients cannot edit them.
- **Private conversations:** only conversation participants may read their messages and offers. This is **not end-to-end encryption**.
- **Work-offer permissions:** client and freelancer actions are constrained by role and offer status.
- **Blocking:** either participant may block the other. Rules prevent new messages and offers when either user has blocked the other; existing history remains available.
- **Email verification:** rules and UI enforce verification for new password accounts whose record requires it.
- **No Report button:** report submission and admin moderation were intentionally removed in Phase 4.3.
- **Account deletion:** requires confirmation and recent reauthentication, but is performed from the browser and is **not a guaranteed atomic server-side deletion**.

### What happens when an account is deleted?

FreeLanzo deletes or hides the departing user's own account/profile data, and closes shared conversations. **The other participant can still read previous messages and offers**; the departed participant appears as **Deleted account**, and further messages to the closed conversation are disabled.

**Deleting a user does not automatically erase shared chat history, signatures contained in old offers, or Cloudinary image assets.** This retention behavior is important for demonstrations and for communicating privacy expectations. To remove *only disposable test chats*, the project owner can carefully delete selected Firestore conversations and their nested records through Firebase Console. Do not delete real user data by mistake.

## Testing checklist

Use three disposable accounts when possible: **C = Client**, **F = published Freelancer**, and **X = unrelated user**. Keep testing separate from real user data.

### Frontend and account flow

- [ ] Homepage renders on desktop and phone, with working search and all 15 categories.
- [ ] Login-page logo does not overlap **Back to home**.
- [ ] Email/password and Google login work, and the saved account role routes to the correct dashboard.
- [ ] New password accounts receive and complete email verification; resend and password reset work.
- [ ] Signed-in **Find Your Field** opens Explore with the selected category; guests see Login/Signup prompts.
- [ ] Light/dark modes and English/Hindi/Marathi core UI text work after a refresh.
- [ ] On mobile, **Sign Out** is accessible from the three-line menu for both roles.

### Profiles and discovery

- [ ] Freelancer profile and portfolio add/edit/delete persist after refresh.
- [ ] Photo editor accepts an original file up to 10 MB and produces a compliant **10–200 KB** final image.
- [ ] Publishing makes a freelancer appear in Explore; unpublishing hides their profile.
- [ ] Client can save and remove a freelancer; unauthorized users cannot read another client's bookmarks.
- [ ] Filters for name/category/skills/experience/availability work as intended.

### Chat and work offers

- [ ] Client opens a conversation; Freelancer receives it; both can exchange real-time text.
- [ ] Unread counts, timestamps, date separators, persistence and **Load earlier messages** work.
- [ ] Chat's three-dot menu exposes **Work Offer** for Clients and **Block/Unblock** for both roles.
- [ ] Client sends an offer with all required fields and a signature no larger than **30 KB**.
- [ ] Freelancer accepts or declines a pending offer; Client cancels a separate pending offer.
- [ ] Accepted/declined/cancelled offers cannot be edited or reversed; print summary works.
- [ ] Blocking prevents new chat/offer writes but preserves past messages.
- [ ] Unrelated user **X** cannot read or change C/F's conversations, offers, or private profiles.
- [ ] No Report option or chat-attachment control is present.

### Deletion, security and deployment

- [ ] Test account deletion **only** on disposable accounts; the remaining participant sees **Deleted account** and closed chat history.
- [ ] Firebase Security Rules are the matching Phase 4.3 version.
- [ ] The same features work from both Live Server and the deployed GitHub Pages URL.
- [ ] No service-account JSON, Cloudinary API secret, or other admin credential was committed to GitHub.

### Optional Firestore Emulator tests

If you have the **full development release** containing `package.json`, `firebase.json`, `firestore.rules`, and `tests/`, install Node.js and Java, then run:

```bash
npm install
npm run test:rules
```

These are **local security-rule tests**, not required files for GitHub Pages. Their presence does **not** mean they have been run against your live Firebase deployment. Run and review them before relying on rules in production.

## Known limitations

1. **No payments or escrow:** amounts are displayed in INR but no actual payment is processed.
2. **No verified legal contract signing:** uploaded image signatures are informal records only.
3. **Text-only communication:** no images, videos, attachments, calling, or automatic chat replies.
4. **No admin/reporting system:** the Report feature and proposed admin dashboard were removed to keep this college MVP manageable.
5. **Client-side account deletion:** partial failures and Cloudinary remnants can occur; shared chats/contracts remain for the other participant.
6. **Cloudinary unsigned uploads:** browser-side photo size checks do not guarantee server-side enforcement against direct requests to a public preset.
7. **Not end-to-end encrypted:** Firestore rules restrict access, but the system is not a private E2EE messenger.
8. **Limited production hardening:** rate limits, abuse handling, monitoring, automated backups, accessibility audits, and comprehensive live security testing would be needed for a commercial launch.
9. **Translation scope:** user-written text, some errors, and some decorative text may remain untranslated.
10. **Project policy drafts:** `terms.html` and `privacy.html` require legal/privacy review before real commercial use.

## Possible future improvements

If FreeLanzo is expanded beyond the college assignment, possible additions include a proper backend for reliable deletion and photo cleanup, more advanced directory pagination, optional user-reviewed moderation, notification delivery, stronger upload validation, and additional automated testing. **None of these are claimed as currently implemented.**

---

**FreeLanzo** — A college web-development project built with HTML, CSS, JavaScript, Firebase, Cloud Firestore, Cloudinary, and GitHub Pages.

*README updated for the simplified Phase 4.3 release and latest UI/category-navigation fixes (November 2026).*
