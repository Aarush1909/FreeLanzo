// Show the profile button in the original FreeLanzo header after sign-in.
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

function initials(name) {
  return (name || "FL").trim().split(/\s+/).slice(0, 2).map(part => part.slice(0, 1).toUpperCase()).join("");
}

onAuthStateChanged(auth, async user => {
  document.querySelectorAll('[data-auth="login"], [data-auth="signup"]').forEach(link => {
    link.hidden = !!user;
  });
  const profile = document.querySelector('[data-user-profile]');
  if (!profile) return;
  profile.hidden = !user;
  if (!user) return;
  const nameNode = profile.querySelector('[data-user-name]');
  const avatarNode = profile.querySelector('[data-user-initials]');
  const fallbackName = user.displayName || "My dashboard";
  nameNode.textContent = fallbackName;
  avatarNode.textContent = initials(fallbackName);
  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    // The user might have logged out while this read was in flight.
    if (auth.currentUser?.uid !== user.uid) return;
    if (snapshot.exists()) {
      const name = snapshot.data().displayName || fallbackName;
      nameNode.textContent = name;
      avatarNode.textContent = initials(name);
    }
  } catch (error) {
    // Navigation remains usable if Firestore is temporarily unavailable.
    console.warn("FreeLanzo could not load the header profile name.", error);
  }
}, () => {});
