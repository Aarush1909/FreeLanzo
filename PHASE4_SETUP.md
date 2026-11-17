# FreeLanzo Phase 4.1 — Messaging & Contract Refinements: Setup and Tests

**Version:** Text-only real-time chat with unread counts, timestamps, and recorded work offers. No chat media uploads or Firebase Cloud Storage setup required.

## 1. Update the project

Copy the Phase 4 files into the FreeLanzo repository, preserving the `js/` directory. If applying the patch, merge `firestore.rules` with any later custom rules rather than overwriting them. Commit and push to GitHub Pages as usual.

## 2. Publish Firestore rules (required)

1. Firebase Console → Firestore Database → Rules.
2. Publish the included `firestore.rules` after checking it against your existing custom rules. This adds/retains rules for `conversations/{id}`, `messages/{id}`, and `contracts/{id}` as well as profiles, bookmarks, and portfolios.
3. The chat rules permit **only text messages and work-offer markers**; they **reject file messages**.
4. **Phase 4.1 breaking schema change:** Send-message operations now use a 2-document Firestore batch (message + conversation preview) with `lastMessageId` and unread counters. Deploy the updated `js/messaging.js` and `firestore.rules` together. Older Phase 4 chat code will not be able to send messages under these new rules. Existing Phase 4 conversations without unread counters remain readable and get counters on their first new message.
5. No Firebase Cloud Storage bucket, Storage rules, CORS configuration, or paid Storage billing plan is needed for these Phase 4 features. Cloudinary remains in use for public profile photos only.

**If you previously deployed an older Phase 4 with media uploads:** remove public access to any legacy chat files and close off the old `chats/` Storage rules separately, if enabled. Removing upload buttons or the two old Storage configuration files does not delete previously uploaded files or disable Storage rules already deployed to Firebase.

## 3. Test with two registered accounts (and a third nonparticipant)

1. Sign up with a Client and Freelancer test account; publish the Freelancer profile from Freelancer → Dashboard Home.
2. Client → Explore Freelancers → **Message**, then select the Freelancer. Freelancer → Messages sees the conversation.
3. Client sends 2 texts while freelancer has that chat closed. Verify the freelancer sees **2 unread** in the inbox; opening the chat clears the count. Repeat in the other direction. Check accurate message timestamps and persistence after reload.
4. Verify **there is no chat attachment input**; reject empty messages and messages over 2,000 characters.
5. Client → **+ Work offer**: enter client/company name, positive INR amount, work description (10–1,600 characters), future deadline, payment terms (payment schedule details mandatory for milestones), working days, working hours and timezone, and a JPG/PNG/WebP signature up to **30 KB**. Send.
6. Freelancer sees full recorded terms and the **Pending** badge. Click **Accept** then **Cancel** in the browser confirmation prompt: offer should remain Pending. Confirm acceptance afterward: status changes to **Accepted**, no further editing/declining/cancellation allowed. Repeat with fresh offers to test **Declined** and **Cancelled**.
7. Verify that a Client can cancel only **pending** offers, and cannot accept or decline. Freelancer cannot create or cancel offers. A third authenticated account cannot read the private conversation, messages or offers.
8. Verify Firestore rules reject direct attempts to (a) change accepted offer amount/signature, (b) increase your own unread counter or edit the other member's count, (c) send unlinked messages without a conversation preview batch, (d) upload `kind: 'file'` messages, or (e) change the participant UIDs.
9. Test on both mobile and desktop, in light/dark modes, and with English/Hindi/Marathi; recheck existing saved freelancers, profile visibility, and photo uploads (original up to 10 MB; final cropped file **10–200 KB**).

## Phase 4.1 contract fields and states

- `workDescription`: required (10–1,600 characters)
- `deadline`: required (`YYYY-MM-DD`, current/future date checked in browser)
- `paymentTerms`: required (`completion`, `milestones`, `weekly`, `upfront`)
- `paymentDetails`: max 500 characters; at least 5 for milestones
- `status`: **pending → accepted / declined** (by freelancer); **pending → cancelled** (by client); no reversal or edits
- `respondedAt`: server timestamp, written only when status changes
- `clientUnread` / `freelancerUnread`: server-validated increments for the **recipient** when a new text or offer arrives; recipient may reset only their own unread count to zero.
- Messages and contract terms are immutable once saved.

## Important limitations

- The signature image is stored **inside the Firestore offer document**, capped at 30,000 bytes (base64 size is validated separately). It is not a legally verified e-signature or identity proof; there is no payment processing.
- Chat is participant-restricted through Firestore rules, **not end-to-end encrypted**. Avoid sensitive real contracts/financial credentials in a college demo.
- The existing browser-side account deletion cannot guarantee removal of shared conversations and contracts. A production platform needs explicit server-side retention and deletion policies. Cloudinary photo assets also require secure backend cleanup.
- Test with **disposable accounts**. No live Firebase user, Firestore emulator, or Cloudinary service has been used in local validation; verify the new security rules using the Firebase Emulator Suite before production deployment.
