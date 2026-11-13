/* FreeLanzo Phase 3 workspace. Real Firebase data, no demo accounts/messages. */
import { onAuthStateChanged, signOut, updateProfile as updateAuthProfile } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const ROLE = document.body.dataset.role;
const VALID_VIEWS = new Set(ROLE === "freelancer"
  ? ["home", "profile", "portfolios", "explore", "messages", "settings"]
  : ["home", "profile", "explore", "messages", "settings"]);
const categories = ["Web Development", "Graphic Design", "Mobile App Development", "Digital Marketing", "Video Editing", "Writing & Translation", "Data Science & Analytics", "AI & Machine Learning", "UI/UX Design", "Photography", "Cybersecurity", "3D Design & Animation", "Virtual Assistance", "Business & Consulting", "Education & Tutoring"];
const $ = selector => document.querySelector(selector);
const userDocument = () => doc(db, "users", state.user.uid);
const publicDocument = () => doc(db, "publicFreelancers", state.user.uid);
const portfolioCollection = () => collection(db, "users", state.user.uid, "portfolios");
const state = { user: null, profile: null, published: false, portfolios: [], freelancers: [], directoryLoaded: false, portfoliosLoaded: false, editId: null, loaded: false };
let noticeTimer;

function readableError(error) {
  console.error("FreeLanzo dashboard operation failed:", error);
  if (error?.code === "permission-denied") return "Permission denied. Publish the Phase 3 Firestore rules in Firebase Console, then try again.";
  if (error?.code === "unavailable" || error?.code === "auth/network-request-failed") return "Firebase is temporarily unavailable. Check your connection and try again.";
  if (error?.code === "failed-precondition") return "A Firestore index may be missing. Check the Firebase console error for an index link.";
  return "This action could not be completed. Please try again and check the browser console if it continues.";
}
function notify(message, success = false) {
  const bar = $("#dashboard-notice");
  bar.textContent = message;
  bar.classList.toggle("is-success", success);
  bar.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { bar.hidden = true; }, 6500);
}
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function initials(text) { return (text || "FL").trim().split(/\s+/).slice(0, 2).map(s => s.slice(0, 1).toUpperCase()).join("") || "FL"; }
function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}
function node(tag, className = "", content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = String(content);
  return el;
}
function emptyState(title, message) {
  const wrap = node("div", "empty-card");
  wrap.append(node("h3", "", title), node("p", "", message));
  return wrap;
}
function getCurrentView() {
  const name = new URLSearchParams(location.search).get("view") || "home";
  return VALID_VIEWS.has(name) ? name : "home";
}
function drawName() {
  const name = state.profile.displayName || state.user.displayName || "FreeLanzo member";
  const avatar = initials(name);
  setText("header-name", name);
  setText("header-avatar", avatar);
  setText("sidebar-name", name);
  setText("sidebar-avatar", avatar);
  setText("welcome-name", name.split(/\s+/)[0]);
  setText("preview-name", name);
  setText("preview-avatar", avatar);
  setText("preview-headline", state.profile.headline || "Your headline goes here.");
  setText("settings-email", state.user.email || state.profile.email || "—");
}
function populateProfile() {
  const form = $("#profile-form");
  for (const key of ["displayName", "headline", "bio", "location", "skills", "category"]) {
    if (form.elements[key]) form.elements[key].value = state.profile[key] || "";
  }
  drawName();
}
function publicData() {
  const p = state.profile;
  return {
    uid: state.user.uid,
    displayName: (p.displayName || "Freelancer").trim(),
    headline: p.headline || "",
    bio: p.bio || "",
    skills: p.skills || "",
    category: p.category || "",
    location: p.location || "",
    published: true,
    updatedAt: serverTimestamp()
  };
}
async function loadVisibility() {
  if (ROLE !== "freelancer") return;
  const snap = await getDoc(publicDocument());
  state.published = snap.exists() && snap.data().published === true;
  if ($("#settings-published")) $("#settings-published").checked = state.published;
  setText("stat-visibility", state.published ? "Visible" : "Hidden");
}
async function loadPortfolios() {
  if (ROLE !== "freelancer") return;
  const results = await getDocs(query(portfolioCollection(), limit(90)));
  state.portfolios = results.docs.map(item => ({ id: item.id, ...item.data() }));
  state.portfolios.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  state.portfoliosLoaded = true;
  setText("stat-portfolios", state.portfolios.length);
  setText("portfolio-count", state.portfolios.length);
  renderPortfolios();
}
function renderPortfolios() {
  const wrap = $("#portfolio-list");
  if (!wrap) return;
  wrap.replaceChildren();
  if (!state.portfolios.length) {
    wrap.append(emptyState("No projects yet", "Add your first real project using the form. Only you can edit these records."));
    return;
  }
  for (const item of state.portfolios) {
    const card = node("article", "portfolio-card");
    card.append(node("span", "card-category", item.category || "Project"), node("h3", "", item.title || "Untitled"), node("p", "", item.description || ""));
    const actions = node("div", "portfolio-actions");
    const edit = node("button", "", "Edit"); edit.type = "button"; edit.dataset.portfolioEdit = item.id;
    const remove = node("button", "delete-button", "Delete"); remove.type = "button"; remove.dataset.portfolioDelete = item.id;
    actions.append(edit, remove);
    const url = safeExternalUrl(item.projectUrl);
    if (url) {
      const link = node("a", "", "Open project ↗");
      link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
      actions.append(link);
    }
    card.append(actions);
    wrap.append(card);
  }
}
function resetPortfolioForm() {
  state.editId = null;
  $("#portfolio-form")?.reset();
  setText("portfolio-form-title", "Add a project");
  setText("portfolio-save", "Add project ↗");
  $("#portfolio-cancel").hidden = true;
}
async function savePortfolio(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const title = form.elements.title.value.trim();
  const description = form.elements.description.value.trim();
  const category = form.elements.category.value;
  const projectUrl = form.elements.projectUrl.value.trim();
  if (!title || !description || !categories.includes(category)) { notify("Enter a title, description, and valid category."); return; }
  if (projectUrl && !safeExternalUrl(projectUrl)) { notify("Project links must start with https:// or http://."); return; }
  const payload = { title, description, category, projectUrl, updatedAt: serverTimestamp() };
  const button = $("#portfolio-save"); button.disabled = true;
  try {
    if (state.editId) {
      await updateDoc(doc(portfolioCollection(), state.editId), payload);
      notify("Portfolio project updated.", true);
    } else {
      await addDoc(portfolioCollection(), { ...payload, createdAt: serverTimestamp() });
      notify("Portfolio project added.", true);
    }
    resetPortfolioForm();
    await loadPortfolios();
  } catch (err) { notify(readableError(err)); }
  finally { button.disabled = false; }
}
async function handlePortfolioClick(event) {
  const edit = event.target.closest("[data-portfolio-edit]");
  const remove = event.target.closest("[data-portfolio-delete]");
  if (!edit && !remove) return;
  const id = (edit || remove).dataset.portfolioEdit || (edit || remove).dataset.portfolioDelete;
  const found = state.portfolios.find(item => item.id === id);
  if (!found) return;
  if (edit) {
    state.editId = id;
    const form = $("#portfolio-form");
    for (const key of ["title", "description", "category", "projectUrl"]) form.elements[key].value = found[key] || "";
    setText("portfolio-form-title", "Edit project");
    setText("portfolio-save", "Save changes ↗");
    $("#portfolio-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.elements.title.focus();
  } else if (confirm(`Delete “${found.title}”? This cannot be undone.`)) {
    try {
      await deleteDoc(doc(portfolioCollection(), id));
      if (state.editId === id) resetPortfolioForm();
      notify("Portfolio project deleted.", true);
      await loadPortfolios();
    } catch (err) { notify(readableError(err)); }
  }
}
async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const displayName = form.elements.displayName.value.trim();
  const headline = form.elements.headline.value.trim();
  const bio = form.elements.bio.value.trim();
  const locationText = form.elements.location.value.trim();
  if (displayName.length < 2) { notify("Display name must have at least two characters."); return; }
  const updates = { displayName, headline, bio, location: locationText, updatedAt: serverTimestamp() };
  if (ROLE === "freelancer") {
    const skills = form.elements.skills.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
    const category = form.elements.category.value;
    if (category && !categories.includes(category)) { notify("Choose a valid category."); return; }
    if (skills.some(skill => skill.length > 40)) { notify("Keep each skill under 40 characters."); return; }
    updates.skills = skills.join(", ");
    updates.category = category;
  }
  const button = $("#save-profile"); button.disabled = true;
  try {
    if (state.published && ROLE === "freelancer") {
      // Keep the private profile and the published profile synchronized atomically.
      const batch = writeBatch(db);
      batch.update(userDocument(), updates);
      batch.set(publicDocument(), {
        uid: state.user.uid, displayName, headline, bio, location: locationText,
        skills: updates.skills, category: updates.category, published: true,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
    } else await updateDoc(userDocument(), updates);
    state.profile = { ...state.profile, ...updates };
    drawName();
    try { await updateAuthProfile(state.user, { displayName }); } catch (e) { console.warn("Auth display name update skipped", e); }
    notify("Profile saved successfully.", true);
    if (state.directoryLoaded && ROLE === "freelancer") state.directoryLoaded = false;
  } catch (err) { notify(readableError(err)); }
  finally { button.disabled = false; }
}
async function saveVisibility() {
  if (ROLE !== "freelancer") return;
  const shouldPublish = $("#settings-published").checked;
  const button = $("#save-visibility"); button.disabled = true;
  try {
    if (shouldPublish) await setDoc(publicDocument(), publicData());
    else await deleteDoc(publicDocument());
    state.published = shouldPublish;
    setText("stat-visibility", shouldPublish ? "Visible" : "Hidden");
    state.directoryLoaded = false;
    notify(shouldPublish ? "Your freelancer listing is now visible to signed-in members." : "Your listing has been removed from the directory.", true);
  } catch (err) {
    $("#settings-published").checked = state.published;
    notify(readableError(err));
  } finally { button.disabled = false; }
}
async function loadFreelancers() {
  const results = await getDocs(query(collection(db, "publicFreelancers"), where("published", "==", true), limit(80)));
  state.freelancers = results.docs.map(item => item.data());
  state.directoryLoaded = true;
  setText("stat-freelancers", state.freelancers.length);
  renderFreelancers();
}
function renderFreelancers() {
  const search = ($("#explore-search")?.value || "").trim().toLowerCase();
  const category = $("#explore-category")?.value || "";
  const matches = state.freelancers.filter(f => (!category || f.category === category) &&
    [f.displayName, f.headline, f.skills, f.bio, f.category].some(s => String(s || "").toLowerCase().includes(search)));
  setText("explore-count", `${matches.length} freelancer${matches.length === 1 ? "" : "s"} shown${state.freelancers.length === 80 ? " (first 80 published profiles)" : ""}`);
  const wrap = $("#freelancer-results"); if (!wrap) return;
  wrap.replaceChildren();
  if (!matches.length) {
    wrap.append(emptyState(state.freelancers.length ? "No matches found" : "No published freelancers yet", state.freelancers.length ? "Try another skill or remove the category filter." : "Freelancers will appear here once they publish their profiles from Settings."));
    return;
  }
  for (const freelancer of matches) {
    const card = node("article", "freelancer-card");
    const head = node("div", "freelancer-card-head");
    const icon = node("div", "freelancer-avatar", initials(freelancer.displayName));
    const nameBox = node("div");
    nameBox.append(node("h3", "", freelancer.displayName || "Freelancer"), node("span", "freelancer-category", freelancer.category || "CREATIVE FREELANCER"));
    head.append(icon, nameBox);
    card.append(head, node("p", "headline", freelancer.headline || "Open to creative work"));
    if (freelancer.bio) card.append(node("p", "bio", freelancer.bio));
    const skills = (freelancer.skills || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
    if (skills.length) {
      const tags = node("div", "skill-tags");
      skills.forEach(skill => tags.append(node("span", "", skill)));
      card.append(tags);
    }
    const foot = node("div", "freelancer-card-foot");
    foot.append(node("span", "", freelancer.location || "Location not specified"), node("span", "coming-soon", "MESSAGES / SOON"));
    card.append(foot);
    wrap.append(card);
  }
}
async function openView(view, push = false) {
  const name = VALID_VIEWS.has(view) ? view : "home";
  if (push) history.pushState(null, "", `${location.pathname}?view=${name}`);
  document.querySelectorAll("[data-view]").forEach(el => { el.hidden = el.dataset.view !== name; });
  document.querySelectorAll("[data-view-link]").forEach(link => {
    const current = link.dataset.viewLink === name;
    link.classList.toggle("is-current", current);
    if (current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  document.title = `${({ home: "Dashboard Home", profile: "My Profile", portfolios: "My Portfolios", explore: "Explore Freelancers", messages: "Messages", settings: "Settings" })[name]} — FreeLanzo`;
  $("#main-nav")?.classList.remove("is-open");
  $("#menu-toggle")?.setAttribute("aria-expanded", "false");
  if (name === "portfolios" && !state.portfoliosLoaded) {
    try { await loadPortfolios(); } catch (err) { notify(readableError(err)); }
  }
  if (name === "explore" && !state.directoryLoaded) {
    try { await loadFreelancers(); } catch (err) { notify(readableError(err)); }
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}
async function logout() {
  document.querySelectorAll("[data-signout]").forEach(button => button.disabled = true);
  try { await signOut(auth); location.replace("index.html"); }
  catch (err) {
    notify(readableError(err));
    document.querySelectorAll("[data-signout]").forEach(button => button.disabled = false);
  }
}
function attachEvents() {
  $("#menu-toggle")?.addEventListener("click", () => {
    const opened = $("#main-nav").classList.toggle("is-open");
    $("#menu-toggle").setAttribute("aria-expanded", String(opened));
  });
  document.querySelectorAll("[data-signout]").forEach(b => b.addEventListener("click", logout));
  $("#profile-form").addEventListener("submit", saveProfile);
  if (ROLE === "freelancer") {
    $("#portfolio-form").addEventListener("submit", savePortfolio);
    $("#portfolio-list").addEventListener("click", handlePortfolioClick);
    $("#portfolio-cancel").addEventListener("click", resetPortfolioForm);
    $("#save-visibility").addEventListener("click", saveVisibility);
  }
  $("#explore-search").addEventListener("input", renderFreelancers);
  $("#explore-category").addEventListener("change", renderFreelancers);
  $("#explore-refresh").addEventListener("click", async () => {
    try { await loadFreelancers(); notify("Directory refreshed.", true); }
    catch (err) { notify(readableError(err)); }
  });
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="?view="]');
    if (!link) return;
    const view = new URL(link.href).searchParams.get("view");
    if (!VALID_VIEWS.has(view)) return;
    event.preventDefault();
    openView(view, true);
  });
  window.addEventListener("popstate", () => openView(getCurrentView()));
}

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("login.html"); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || !["freelancer", "client"].includes(snap.data().role)) {
      $("#page-status").textContent = "No valid FreeLanzo profile was found. Contact the project team.";
      return;
    }
    if (snap.data().role !== ROLE) {
      location.replace(`${snap.data().role}-dashboard.html?view=home`);
      return;
    }
    if (state.loaded) return;
    state.user = user;
    state.profile = snap.data();
    state.loaded = true;
    populateProfile();
    attachEvents();
    $("#page-status").hidden = true;
    $("#workspace").hidden = false;
    if (ROLE === "freelancer") {
      try { await Promise.all([loadVisibility(), loadPortfolios()]); }
      catch (err) { notify(readableError(err)); }
    }
    await openView(getCurrentView());
  } catch (err) { $("#page-status").textContent = readableError(err); }
}, () => { $("#page-status").textContent = "Unable to check your login. Refresh the page or try again."; });
