import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
const status = document.getElementById("route-status");
onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("login.html"); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    if (role === "freelancer" || role === "client") {
      location.replace(`${role}-dashboard.html?view=home`);
    } else status.textContent = "No valid account type found. Please contact the FreeLanzo team.";
  } catch (error) {
    console.error("Dashboard routing failed", error);
    status.textContent = "Could not read your account. Check that the latest Firestore rules are published and try reloading.";
  }
}, () => { status.textContent = "Unable to check your session. Check your connection and reload."; });
