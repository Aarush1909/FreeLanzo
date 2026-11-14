// Show the profile button in the original FreeLanzo header after sign-in.
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { initials, renderAvatar } from "./avatar.js";

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
  renderAvatar(avatarNode, "", fallbackName);
  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    // The user might have logged out while this read was in flight.
    if (auth.currentUser?.uid !== user.uid) return;
    if (snapshot.exists()) {
      const name = snapshot.data().displayName || fallbackName;
      nameNode.textContent = name;
      renderAvatar(avatarNode, snapshot.data().avatarURL, name);
    }
  } catch (error) {
    // Navigation remains usable if Firestore is temporarily unavailable.
    console.warn("FreeLanzo could not load the header profile name.", error);
  }
}, () => {});
