import { onAuthStateChanged, reload, sendEmailVerification, signOut, getIdToken } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
const $ = id => document.getElementById(id);
let current = null;
let busy = false;
function status(text, error = false) {
  $("verify-status").textContent = text;
  $("verify-status").classList.toggle("error", error);
}
async function checkVerified() {
  if (!current) return;
  await reload(current);
  await getIdToken(current, true);
  const profile = await getDoc(doc(db, "users", current.uid));
  if (!profile.exists()) throw new Error("The FreeLanzo account profile was not found.");
  if (current.emailVerified || profile.data().verificationRequired !== true) {
    const destination = new URL("dashboard.html", location.href);
    const category = new URLSearchParams(location.search).get("category");
    const categories = new Set(['Web Development','Graphic Design','Mobile App Development','Digital Marketing','Video Editing','Writing & Translation','Data Science & Analytics','AI & Machine Learning','UI/UX Design','Photography','Cybersecurity','3D Design & Animation','Virtual Assistance','Business & Consulting','Education & Tutoring']);
    if (categories.has(category)) { destination.searchParams.set("view", "explore"); destination.searchParams.set("category", category); }
    location.replace(destination.href); return;
  }
  status("Your address is not verified yet. Open the email link, then try again.", true);
}
async function action(button, callback) {
  if (busy || !current) return;
  busy = true; button.disabled = true;
  try { await callback(); }
  catch (error) { status(error?.message || "Please try again.", true); }
  finally { busy = false; button.disabled = false; }
}
$("verify-continue").addEventListener("click", e => action(e.currentTarget, checkVerified));
$("verify-resend").addEventListener("click", e => action(e.currentTarget, async () => {
  await sendEmailVerification(current);
  status("Verification email sent. Check your inbox and spam folder.");
}));
$("verify-signout").addEventListener("click", e => action(e.currentTarget, async () => {
  await signOut(auth); location.replace("login.html");
}));
onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("login.html"); return; }
  current = user;
  $("verify-address").textContent = user.email || "your registered address";
  try { await checkVerified(); }
  catch (error) { status(error?.message || "Couldn't verify this account. Try reloading.", true); }
});
