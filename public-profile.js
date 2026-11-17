import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { renderAvatar } from "./avatar.js";

const $ = selector => document.querySelector(selector);
const text = (selector, value) => { const el = $(selector); if (el) el.textContent = value || ""; };
const element = (tag, className = "", label = "") => {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = label;
  return result;
};
function externalLink(url) {
  try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
}
function displayUnavailable(message) {
  const status = $("#public-status");
  status.textContent = message;
  status.hidden = false;
  $("#public-content").hidden = true;
}
function showProject(project) {
  const card = element("article", "public-project-card");
  card.append(element("span", "card-category", project.category || "PROJECT"),
    element("h3", "", project.title || "Untitled"), element("p", "", project.description || ""));
  const url = externalLink(project.projectUrl);
  if (url) {
    const link = element("a", "public-project-link", "Visit project ↗");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }
  return card;
}
function showProfile(profile, projects) {
  const name = profile.displayName || "Freelancer";
  document.title = `${name} — FreeLanzo`;
  text("#public-name", name);
  text("#public-headline", profile.headline || "Independent creative professional");
  text("#public-category", profile.category || "Freelancer");
  text("#public-location", profile.location || "Location not specified");
  text("#public-bio", profile.bio || "This freelancer hasn't written a bio yet.");
  renderAvatar($("#public-avatar"), profile.avatarURL || "", name);
  const skills = $("#public-skills");
  skills.replaceChildren();
  (profile.skills || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8)
    .forEach(skill => skills.append(element("span", "", skill)));
  text("#public-project-count", `${projects.length} PROJECT${projects.length === 1 ? "" : "S"}`);
  const list = $("#public-projects");
  list.replaceChildren();
  if (!projects.length) {
    const empty = element("div", "empty-card", "This freelancer hasn't published any projects yet.");
    list.append(empty);
  } else projects.forEach(project => list.append(showProject(project)));
  $("#public-status").hidden = true;
  $("#public-content").hidden = false;
}
$("#menu-toggle").addEventListener("click", () => {
  const open = $("#main-nav").classList.toggle("is-open");
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
});
const profileId = new URLSearchParams(location.search).get("id") || "";
let loaded = false;
onAuthStateChanged(auth, async viewer => {
  if (!viewer) { location.replace("login.html"); return; }
  if (loaded) return;
  loaded = true;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(profileId)) {
    displayUnavailable("Invalid freelancer profile link."); return;
  }
  try {
    // This is the signed-in viewer's PRIVATE document, used for navigation only.
    const viewerSnap = await getDoc(doc(db, "users", viewer.uid));
    if (viewerSnap.exists()) {
      const me = viewerSnap.data();
      text("#header-name", me.displayName || "Dashboard home");
      renderAvatar($("#header-avatar"), me.avatarURL || "", me.displayName || "Member");
      if (["client", "freelancer"].includes(me.role)) {
        $("#back-to-explore").href = `${me.role}-dashboard.html?view=explore`;
      }
      if (me.role === "client" && profileId !== viewer.uid) {
        const contact = $("#public-contact");
        contact.href = `client-dashboard.html?view=messages&with=${encodeURIComponent(profileId)}`;
        contact.hidden = false;
      }
    }
    // Strictly public collection; never fetch the freelancer's users/{uid} record.
    const profileDoc = await getDoc(doc(db, "publicFreelancers", profileId));
    if (!profileDoc.exists() || profileDoc.data().published !== true) {
      displayUnavailable("This freelancer profile is not currently published."); return;
    }
    const projects = await getDocs(query(collection(db, "publicFreelancers", profileId, "projects"), limit(90)));
    showProfile(profileDoc.data(), projects.docs.map(item => item.data()));
  } catch (error) {
    console.error("Could not read published profile", error);
    displayUnavailable("We couldn't load this profile. Check your connection or published Firestore rules.");
  }
});
