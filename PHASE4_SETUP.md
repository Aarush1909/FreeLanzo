# FreeLanzo Phase 4 — Text Messaging & Work Offers: Setup and Tests

**Version:** Text chat and work offers only. No chat media uploads or Firebase Cloud Storage setup required.

## 1. Update the project

Copy the Phase 4 files into the FreeLanzo repository, preserving the `js/` directory. If applying the patch, merge `firestore.rules` with any later custom rules rather than overwriting them. Commit and push to GitHub Pages as usual.

## 2. Publish Firestore rules (required)

1. Firebase Console → Firestore Database → Rules.
2. Publish the included `firestore.rules` after checking it against your existing custom rules. This adds/retains rules for `conversations/{id}`, `messages/{id}`, and `contracts/{id}` as well as profiles, bookmarks, and portfolios.
3. The chat rules permit **only text messages and work-offer markers**; they **reject file messages**.
4. No Firebase Cloud Storage bucket, Storage rules, CORS configuration, or paid Storage billing plan is needed for these Phase 4 features. Cloudinary remains in use for public profile photos only.

**If you previously deployed an older Phase 4 with media uploads:** remove public access to any legacy chat files and close off the old `chats/` Storage rules separately, if enabled. Removing upload buttons or the two old Storage configuration files does not delete previously uploaded files or disable Storage rules already deployed to Firebase.

## 3. Test with two registered accounts (and a third nonparticipant)

1. Sign up with a Client and Freelancer test account, then publish the Freelancer profile from Freelancer → Dashboard Home.
2. Client → Explore Freelancers → **Message**, and select the Freelancer; the Freelancer sees this conversation in Messages.
3. Send text messages both ways; verify they appear instantly with `onSnapshot` and persist after reloading.
4. Verify there is **no chat attachment input**. Try sending empty messages and messages over 2,000 characters; they should be blocked.
5. Client → **+ Work offer**: enter client/company name, positive INR amount, working days, start/end times, timezone, and JPG/PNG/WebP signature image **up to 30 KB**. Send it.
6. Freelancer sees the offer and clicks **Accept** or **Decline**; both users see the updated status and time. The Client cannot respond to their own offers, and the Freelancer cannot create offers.
7. With a third authenticated account, confirm Firestore rules reject direct conversation, message, and work-offer reads. Also confirm that direct attempts to create `kind: 'file'` messages fail.
8. Retest dark mode, Hindi/Marathi, mobile layout, saved freelancers, profile visibility, and profile photo uploads. **Profile photos: originals up to 10 MB; cropped output 10–200 KB.**

## Important limitations

- The signature image is stored **inside the Firestore offer document**, capped at 30,000 bytes (base64 size is validated separately). It is not a legally verified e-signature or identity proof; there is no payment processing.
- Chat is participant-restricted through Firestore rules, **not end-to-end encrypted**. Avoid sensitive real contracts/financial credentials in a college demo.
- The existing browser-side account deletion cannot guarantee removal of shared conversations and contracts. A production platform needs explicit server-side retention and deletion policies. Cloudinary photo assets also require secure backend cleanup.
- Test with **disposable accounts**. No live Firebase user, Firestore emulator, or Cloudinary service has been used in local validation.
