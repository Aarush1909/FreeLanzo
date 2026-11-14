import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
const status = document.getElementById("route-status");
const incoming = new URLSearchParams(location.search);
function dashboardDestination(role) {
  const target = new URL(`${role}-dashboard.html`, location.href);
  const view = incoming.get("view");
  target.searchParams.set("view", ["home", "profile", "explore", "messages", "settings", "portfolios"].includes(view) ? view : "home");
  const category = incoming.get("category");
  if (view === "explore" && category && category.length <= 60) target.searchParams.set("category", category);
  return target.href;
}
onAuthStateChanged(auth, async user => {
  if (!user) {
    const category = incoming.get("category");
    if (incoming.get("view") === "explore" && category) {
      // A guest opening a category link in another tab should still see the
      // opt-in message on the home page, not a forced signup redirect.
      const home = new URL("index.html", location.href);
      home.searchParams.set("authNotice", "1");
      home.searchParams.set("category", category);
      home.hash = "categories";
      location.replace(home.href);
    } else location.replace("login.html");
    return;
  }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    if (role === "freelancer" || role === "client") {
      location.replace(dashboardDestination(role));
    } else status.textContent = "No valid account type found. Please contact the FreeLanzo team.";
  } catch (error) {
    console.error("Dashboard routing failed", error);
    status.textContent = "Could not read your account. Check that the latest Firestore rules are published and try reloading.";
  }
}, () => { status.textContent = "Unable to check your session. Check your connection and reload."; });
