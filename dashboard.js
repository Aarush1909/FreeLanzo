/* FreeLanzo Phase 3 workspace. Real Firebase data, no demo accounts/messages. */
import {
  onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup,
  reauthenticateWithCredential, GoogleAuthProvider, EmailAuthProvider,
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, startAfter,
  serverTimestamp, setDoc, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { AVATAR_MIN_BYTES, AVATAR_MAX_BYTES, AVATAR_ORIGINAL_MAX_BYTES, isAvatarUrl, optimizeAvatar, renderAvatar, uploadAvatar } from "./avatar.js";
import { selectAvatarCrop } from "./avatar-crop.js";
import { initializeMessaging, activateMessaging, beginChatWithFreelancer } from "./messaging.js";
const ROLE = document.body.dataset.role;
const VALID_VIEWS = new Set(ROLE === "freelancer"
  ? ["home", "profile", "portfolios", "explore", "messages", "settings"]
  : ["home", "profile", "explore", "saved", "messages", "settings"]);
// Remove typical email and telephone patterns before writing PUBLIC copies.
// Private saved text is not modified; don't treat this as a full PII detection system.
function hideContactDetails(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact hidden]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[contact hidden]");
}
function safePublicProjectUrl(url) {
  const value = String(url || "");
  return hideContactDetails(value) === value ? value : "";
}
const categories = ["Web Development", "Graphic Design", "Mobile App Development", "Digital Marketing", "Video Editing", "Writing & Translation", "Data Science & Analytics", "AI & Machine Learning", "UI/UX Design", "Photography", "Cybersecurity", "3D Design & Animation", "Virtual Assistance", "Business & Consulting", "Education & Tutoring"];
const $ = selector => document.querySelector(selector);
const userDocument = () => doc(db, "users", state.user.uid);
const publicDocument = () => doc(db, "publicFreelancers", state.user.uid);
const portfolioCollection = () => collection(db, "users", state.user.uid, "portfolios");
const publicProjectsCollection = () => collection(db, "publicFreelancers", state.user.uid, "projects");
const publicProjectRef = id => doc(db, "publicFreelancers", state.user.uid, "projects", id);
const savedCollection = () => collection(db, "users", state.user.uid, "savedFreelancers");
const savedRef = freelancerUid => doc(db, "users", state.user.uid, "savedFreelancers", freelancerUid);
const state = { deletingAccount: false, user: null, profile: null, published: false, portfolios: [], freelancers: [], directoryLoaded: false, portfoliosLoaded: false, editId: null, loaded: false, photoBlob: null, photoObjectUrl: null, savedIds: new Set(), savedLoaded: false, savedFreelancers: [] };
// Landing-category deep links: validate against the same options used by Explore.
const incomingCategory = new URLSearchParams(location.search).get("category");
const selectedCategory = categories.includes(incomingCategory) ? incomingCategory : "";
let noticeTimer;

// Phase 3.6: show reliable, accessible pending states without inserting HTML
// from user input or changing the underlying Firestore operations.
const activeActions = new Map();
function localized(en, hi = en, mr = en) {
  const lang = document.documentElement.lang;
  return lang === "hi" ? hi : lang === "mr" ? mr : en;
}
function renderActivity() {
  const indicator = $("#operation-status");
  if (!indicator) return;
  const messages = [...activeActions.values()].map(value => value.message);
  indicator.hidden = !messages.length;
  if (messages.length) indicator.querySelector("span").textContent = messages.at(-1);
}
function beginActivity(button, message, buttonLabel = "Working…") {
  const token = Symbol("active-action");
  if (button) {
    if (button.dataset.loading === "true") return null;
    button.dataset.loading = "true";
    button.dataset.originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const buttonLanguages = {
      "Saving…": ["सेव हो रहा है…", "सेव्ह होत आहे…"],
      "Deleting…": ["हटाया जा रहा है…", "हटवले जात आहे…"],
      "Removing…": ["हटाया जा रहा है…", "हटवले जात आहे…"],
      "Uploading…": ["अपलोड हो रहा है…", "अपलोड होत आहे…"],
      "Refreshing…": ["रीफ़्रेश हो रहा है…", "रीफ्रेश होत आहे…"],
      "Signing out…": ["साइन आउट हो रहा है…", "साइन आउट होत आहे…"]
    };
    button.textContent = buttonLanguages[buttonLabel]
      ? localized(buttonLabel, ...buttonLanguages[buttonLabel]) : buttonLabel;
  }
  activeActions.set(token, { button, message });
  renderActivity();
  return token;
}
function updateActivity(token, message) {
  const action = activeActions.get(token);
  if (!action) return;
  action.message = message;
  renderActivity();
}
function finishActivity(token) {
  if (!token) return;
  const action = activeActions.get(token);
  if (!action) return;
  const { button } = action;
  if (button) {
    button.textContent = button.dataset.originalLabel || button.textContent;
    delete button.dataset.originalLabel;
    delete button.dataset.loading;
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
  activeActions.delete(token);
  renderActivity();
}
// A browser-only deletion can fail after some Firestore records were removed.
// Keep a local recovery marker keyed by Firebase UID. It contains no credentials.
const deletionMarker = uid => `freelanzo_pending_account_deletion_${uid}`;
function readDeletionMarker(uid) {
  try {
    const marker = JSON.parse(localStorage.getItem(deletionMarker(uid)) || "null");
    return marker?.uid === uid && ["client", "freelancer"].includes(marker.role) ? marker : null;
  } catch { return null; }
}
function writeDeletionMarker(uid, role) {
  try {
    localStorage.setItem(deletionMarker(uid), JSON.stringify({uid, role, startedAt: Date.now()}));
    if (!readDeletionMarker(uid)) throw Error("Cannot verify deletion recovery marker.");
  } catch {
    throw new Error("Your browser cannot store recovery information. Enable local storage before deleting your account so interrupted deletion can be resumed.");
  }
}
function clearDeletionMarker(uid) {
  try { localStorage.removeItem(deletionMarker(uid)); } catch { /* already deleted on Firebase */ }
}
function accountUsesGoogle(user = state.user) {
  return user?.providerData?.some(item => item.providerId === "google.com") === true &&
    user?.providerData?.every(item => item.providerId !== "password");
}
function displayRecoveryPanel() {
  $("#page-status").hidden = true;
  $("#workspace").hidden = true;
  const panel = $("#deletion-recovery");
  panel.hidden = false;
  $("#recovery-password-wrap").hidden = accountUsesGoogle();
  if (panel.dataset.bound !== "true") {
    panel.dataset.bound = "true";
    $("#resume-delete").addEventListener("click", () => permanentlyDeleteAccount(true));
  }
}

function readableError(error) {
  console.error("FreeLanzo dashboard operation failed:", error);
  if (error?.code === "permission-denied") return "Permission denied. Publish the updated Phase 3.3 Firestore rules in Firebase Console, then try again.";
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
  const url = state.profile.avatarURL || "";
  setText("header-name", name);
  setText("sidebar-name", name);
  setText("welcome-name", name.split(/\s+/)[0]);
  setText("preview-name", name);
  setText("preview-headline", state.profile.headline || "Your headline goes here.");
  setText("settings-email", state.user.email || state.profile.email || "—");
  for (const id of ["header-avatar", "sidebar-avatar", "preview-avatar", "photo-preview"]) renderAvatar(document.getElementById(id), url, name);
  const remove = $("#photo-remove");
  if (remove) remove.disabled = !isAvatarUrl(url);
}
function populateProfile() {
  const form = $("#profile-form");
  // Prepopulate every editable field, including Phase 3.3 filter metadata.
  // Without these two fields a returning freelancer might accidentally clear
  // their experience/availability the next time they save another detail.
  for (const key of ["displayName", "headline", "bio", "location", "skills", "category", "experienceLevel", "availability"]) {
    if (form.elements[key]) form.elements[key].value = state.profile[key] || "";
  }
  drawName();
  updateCompletion();
}
function publicData(p = state.profile) {
  return {
    uid: state.user.uid,
    displayName: hideContactDetails((p.displayName || "Freelancer").trim()),
    headline: hideContactDetails(p.headline),
    bio: hideContactDetails(p.bio),
    skills: hideContactDetails(p.skills),
    category: p.category || "",
    location: hideContactDetails(p.location),
    avatarURL: isAvatarUrl(p.avatarURL) ? p.avatarURL : "",
    experienceLevel: p.experienceLevel || "",
    availability: p.availability || "",
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
  updateCompletion();
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
function publicProjectFields(item) {
  // Do not copy user IDs, email, phone, private profile fields, or permissions.
  return { title: hideContactDetails(item.title), category: item.category, description: hideContactDetails(item.description),
    projectUrl: safePublicProjectUrl(item.projectUrl), createdAt: item.createdAt, updatedAt: item.updatedAt };
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
  if (!state.editId && state.portfolios.length >= 90) { notify("For this project, you can display up to 90 portfolio items."); return; }
  const payload = { title, description, category, projectUrl, updatedAt: serverTimestamp() };
  const button = $("#portfolio-save");
  const activity = beginActivity(button, localized("Saving portfolio project…", "पोर्टफोलियो प्रोजेक्ट सेव हो रहा है…", "पोर्टफोलिओ प्रकल्प सेव्ह होत आहे…"), "Saving…");
  try {
    if (state.editId) {
      if (state.published) {
        const existing = state.portfolios.find(item => item.id === state.editId);
        if (!existing) throw new Error("Project not found. Refresh and try again.");
        const batch = writeBatch(db);
        batch.update(doc(portfolioCollection(), state.editId), payload);
        batch.set(publicProjectRef(state.editId), publicProjectFields({ ...payload, createdAt: existing.createdAt }));
        await batch.commit();
      } else await updateDoc(doc(portfolioCollection(), state.editId), payload);
      notify("Portfolio project updated.", true);
    } else {
      const newRef = doc(portfolioCollection());
      const fields = { ...payload, createdAt: serverTimestamp() };
      if (state.published) {
        const batch = writeBatch(db);
        batch.set(newRef, fields);
        batch.set(publicProjectRef(newRef.id), publicProjectFields(fields));
        await batch.commit();
      } else await setDoc(newRef, fields);
      notify("Portfolio project added.", true);
    }
    resetPortfolioForm();
    await loadPortfolios();
  } catch (err) { notify(err?.message === "Project not found. Refresh and try again." ? err.message : readableError(err)); }
  finally { finishActivity(activity); if (!state.editId) setText("portfolio-save", "Add project ↗"); }
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
    const activity = beginActivity(remove, localized("Deleting portfolio project…", "पोर्टफोलियो प्रोजेक्ट हटाया जा रहा है…", "पोर्टफोलिओ प्रकल्प हटवला जात आहे…"), "Deleting…");
    try {
      if (state.published) {
        const batch = writeBatch(db);
        batch.delete(doc(portfolioCollection(), id));
        batch.delete(publicProjectRef(id));
        await batch.commit();
      } else await deleteDoc(doc(portfolioCollection(), id));
      if (state.editId === id) resetPortfolioForm();
      notify("Portfolio project deleted.", true);
      await loadPortfolios();
    } catch (err) { notify(readableError(err)); }
    finally { finishActivity(activity); }
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
    const experienceLevel = form.elements.experienceLevel.value;
    const availability = form.elements.availability.value;
    if (!["", "Beginner", "Intermediate", "Expert"].includes(experienceLevel) ||
        !["", "Available", "Busy"].includes(availability)) {
      notify("Choose a valid experience level and availability."); return;
    }
    updates.experienceLevel = experienceLevel;
    updates.availability = availability;
  }
  const button = $("#save-profile");
  const activity = beginActivity(button, localized("Saving your profile…", "आपकी प्रोफ़ाइल सेव हो रही है…", "तुमचे प्रोफाइल सेव्ह होत आहे…"), "Saving…");
  try {
    if (state.published && ROLE === "freelancer") {
      // Keep the private profile and the published profile synchronized atomically.
      const batch = writeBatch(db);
      batch.update(userDocument(), updates);
      batch.set(publicDocument(), publicData({ ...state.profile, ...updates }));
      await batch.commit();
    } else await updateDoc(userDocument(), updates);
    state.profile = { ...state.profile, ...updates };
    drawName();
    updateCompletion();
    try { await updateAuthProfile(state.user, { displayName }); } catch (e) { console.warn("Auth display name update skipped", e); }
    notify("Profile saved successfully.", true);
    if (state.directoryLoaded && ROLE === "freelancer") state.directoryLoaded = false;
  } catch (err) { notify(readableError(err)); }
  finally { finishActivity(activity); }
}
async function getAllPublicProjects() {
  const docs = [];
  let cursor = null;
  while (true) {
    const q = cursor ? query(publicProjectsCollection(), startAfter(cursor), limit(90))
      : query(publicProjectsCollection(), limit(90));
    const result = await getDocs(q);
    docs.push(...result.docs);
    if (result.size < 90) break;
    cursor = result.docs[result.docs.length - 1];
  }
  return docs;
}
async function synchronizePublicProjects() {
  // Sync while profile is hidden, then publish the parent last. All projects remain
  // read-protected until that parent document is visible.
  await loadPortfolios();
  const current = new Map(state.portfolios.map(item => [item.id, item]));
  const existing = await getAllPublicProjects();
  const deletions = existing.filter(item => !current.has(item.id));
  const operations = [
    ...deletions.map(item => ({ type: "delete", ref: item.ref })),
    ...state.portfolios.map(item => ({ type: "set", ref: publicProjectRef(item.id), fields: publicProjectFields(item) }))
  ];
  for (let i = 0; i < operations.length; i += 10) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(i, i + 10)) {
      if (operation.type === "delete") batch.delete(operation.ref);
      else batch.set(operation.ref, operation.fields);
    }
    await batch.commit();
  }
}
async function saveVisibility() {
  if (ROLE !== "freelancer") return;
  const shouldPublish = $("#settings-published").checked;
  const button = $("#save-visibility");
  const activity = beginActivity(button, localized("Updating profile visibility…", "प्रोफ़ाइल दृश्यता अपडेट हो रही है…", "प्रोफाइल दृश्यमानता अपडेट होत आहे…"), "Saving…");
  try {
    if (shouldPublish) {
      await synchronizePublicProjects();
      await setDoc(publicDocument(), publicData());
    } else await deleteDoc(publicDocument());
    state.published = shouldPublish;
    setText("stat-visibility", shouldPublish ? "Visible" : "Hidden");
    state.directoryLoaded = false;
    notify(shouldPublish ? "Public profile and portfolio projects are now visible to signed-in members." : "Your public profile and portfolio projects are now hidden.", true);
  } catch (err) {
    $("#settings-published").checked = state.published;
    notify(readableError(err));
  } finally { finishActivity(activity); }
}
async function loadFreelancers() {
  const activity = beginActivity(null, localized("Loading freelancer directory…", "फ्रीलांसर डायरेक्टरी लोड हो रही है…", "फ्रीलान्सर निर्देशिका लोड होत आहे…"));
  try {
  const results = await getDocs(query(collection(db, "publicFreelancers"), where("published", "==", true), limit(80)));
  state.freelancers = results.docs.map(item => ({ ...item.data(), uid: item.id }));
  state.directoryLoaded = true;
  setText("stat-freelancers", state.freelancers.length);
  renderFreelancers();
  } finally { finishActivity(activity); }
}
function renderFreelancers() {
  const search = ($("#explore-search")?.value || "").trim().toLowerCase();
  const category = $("#explore-category")?.value || "";
  const skill = ($("#explore-skill")?.value || "").trim().toLowerCase();
  const experience = $("#explore-experience")?.value || "";
  const availability = $("#explore-availability")?.value || "";
  const matches = state.freelancers.filter(f => (!category || f.category === category) &&
    (!experience || f.experienceLevel === experience) &&
    (!availability || f.availability === availability) &&
    (!skill || String(f.skills || "").toLowerCase().includes(skill)) &&
    [f.displayName, f.headline, f.skills, f.bio, f.category].some(text => String(text || "").toLowerCase().includes(search)));
  setText("explore-count", `${matches.length} freelancer${matches.length === 1 ? "" : "s"} shown${state.freelancers.length === 80 ? " (first 80 published profiles)" : ""}`);
  const wrap = $("#freelancer-results"); if (!wrap) return;
  wrap.replaceChildren();
  if (!matches.length) {
    wrap.append(emptyState(state.freelancers.length ? "No matches found" : "No published freelancers yet", state.freelancers.length ? "Try another skill or remove the category filter." : "Freelancers will appear here once they publish their profiles from Dashboard Home."));
    return;
  }
  for (const freelancer of matches) {
    const card = node("article", "freelancer-card");
    const head = node("div", "freelancer-card-head");
    const icon = node("div", "freelancer-avatar");
    renderAvatar(icon, freelancer.avatarURL, freelancer.displayName);
    const nameBox = node("div");
    nameBox.append(node("h3", "", freelancer.displayName || "Freelancer"), node("span", "freelancer-category", freelancer.category || "CREATIVE FREELANCER"));
    head.append(icon, nameBox);
    card.append(head, node("p", "headline", freelancer.headline || "Open to creative work"));
    if (freelancer.bio) card.append(node("p", "bio", freelancer.bio));
    if (freelancer.experienceLevel || freelancer.availability) {
      const meta = node("p", "freelancer-meta", [freelancer.experienceLevel, freelancer.availability === "Available" ? "Available for work" : freelancer.availability === "Busy" ? "Currently busy" : ""].filter(Boolean).join(" · "));
      card.append(meta);
    }
    const skills = (freelancer.skills || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
    if (skills.length) {
      const tags = node("div", "skill-tags");
      skills.forEach(skill => tags.append(node("span", "", skill)));
      card.append(tags);
    }
    const foot = node("div", "freelancer-card-foot");
    const view = node("a", "view-public-profile", "View full profile ↗");
    view.href = `freelancer-profile.html?id=${encodeURIComponent(freelancer.uid)}`;
    foot.append(node("span", "", freelancer.location || "Location not specified"), view);
    if (ROLE === "client" && freelancer.uid !== state.user.uid) {
      const contact = node("button", "btn-save-freelancer", "✉ Message");
      contact.type = "button";
      contact.dataset.chatFreelancer = freelancer.uid;
      foot.append(contact);
      const save = node("button", "btn-save-freelancer", state.savedIds.has(freelancer.uid) ? "★ Saved" : "☆ Save");
      save.type = "button";
      save.dataset.saveFreelancer = freelancer.uid;
      save.setAttribute("aria-pressed", String(state.savedIds.has(freelancer.uid)));
      foot.append(save);
    }
    card.append(foot);
    wrap.append(card);
  }
}
async function updateAvatarURL(url) {
  if (url && !isAvatarUrl(url)) throw new Error("Not a valid Cloudinary image URL.");
  const updates = { avatarURL: url, updatedAt: serverTimestamp() };
  if (ROLE === "freelancer" && state.published) {
    const batch = writeBatch(db);
    batch.update(userDocument(), updates);
    // Rebuild the public allowlisted snapshot as well as updating the photo.
    // This migrates old Phase 3.1 published docs that predate Phase 3.3 fields
    // (experienceLevel / availability) expected by the new security rules.
    batch.set(publicDocument(), publicData({ ...state.profile, ...updates }));
    await batch.commit();
  } else await updateDoc(userDocument(), updates);
  state.profile = { ...state.profile, avatarURL: url };
  state.directoryLoaded = false;
  drawName();
  updateCompletion();
}
function clearPhotoSelection() {
  if (state.photoObjectUrl) URL.revokeObjectURL(state.photoObjectUrl);
  state.photoObjectUrl = null;
  state.photoBlob = null;
  $("#photo-upload").disabled = true;
  $("#photo-input").value = "";
  drawName();
}
async function onChoosePhoto(event) {
  const file = event.currentTarget.files?.[0];
  clearPhotoSelection();
  if (!file) return;
  const activity = beginActivity(null, localized("Preparing profile photo…", "प्रोफ़ाइल फोटो तैयार हो रही है…", "प्रोफाइल फोटो तयार होत आहे…"));
  try {
    if (file.size === 0 || file.size > AVATAR_ORIGINAL_MAX_BYTES) throw new Error("Choose an original photo up to 10 MB before cropping.");
    $("#photo-status").textContent = "Adjust your crop, then confirm to prepare the photo.";
    const crop = await selectAvatarCrop(file);
    if (!crop) {
      $("#photo-status").textContent = "Crop cancelled. Your saved photo was not changed.";
      return;
    }
    $("#photo-status").textContent = "Compressing your cropped photo…";
    const blob = await optimizeAvatar(file, crop);
    state.photoBlob = blob;
    state.photoObjectUrl = URL.createObjectURL(blob);
    const preview = $("#photo-preview");
    const img = node("img"); img.src = state.photoObjectUrl; img.alt = "Selected photo preview";
    preview.replaceChildren(img); preview.classList.add("has-avatar-image");
    $("#photo-upload").disabled = false;
    $("#photo-status").textContent = `Ready to upload: ${(blob.size / 1000).toFixed(1)} KB. Click Upload photo to save.`;
  } catch (error) { $("#photo-status").textContent = error.message; clearPhotoSelection(); }
  finally { finishActivity(activity); }
}
async function onUploadPhoto() {
  if (!state.photoBlob) return;
  const upload = $("#photo-upload");
  const remove = $("#photo-remove");
  const activity = beginActivity(upload, localized("Uploading profile photo to Cloudinary…", "Cloudinary पर प्रोफ़ाइल फोटो अपलोड हो रही है…", "Cloudinary वर प्रोफाइल फोटो अपलोड होत आहे…"), "Uploading…");
  remove.disabled = true;
  $("#photo-status").textContent = "Uploading your photo…";
  try {
    const url = await uploadAvatar(state.photoBlob);
    await updateAvatarURL(url);
    clearPhotoSelection();
    $("#photo-status").textContent = "Photo saved successfully.";
    notify("Profile photo updated.", true);
  } catch (error) {
    $("#photo-status").textContent = error.message || "Could not upload your photo.";
    remove.disabled = !isAvatarUrl(state.profile.avatarURL);
  } finally {
    finishActivity(activity);
    $("#photo-upload").disabled = !state.photoBlob;
  }
}
async function onRemovePhoto() {
  if (!state.profile.avatarURL) return;
  const button = $("#photo-remove");
  const activity = beginActivity(button, localized("Removing profile photo…", "प्रोफ़ाइल फोटो हट रही है…", "प्रोफाइल फोटो हटवला जात आहे…"), "Removing…");
  try {
    await updateAvatarURL("");
    clearPhotoSelection();
    $("#photo-status").textContent = "Photo removed from your FreeLanzo profile.";
    notify("Profile photo removed.", true);
  } catch (error) {
    $("#photo-status").textContent = readableError(error);
  } finally { finishActivity(activity); button.disabled = !isAvatarUrl(state.profile.avatarURL); }
}
// Phase 3.3 — profile completion uses real saved fields, not fabricated scores.
function updateCompletion() {
  if (!state.profile) return;
  const p = state.profile;
  const checks = [
    ["Display name", (p.displayName || "").trim().length >= 2],
    ["Headline", Boolean((p.headline || "").trim())],
    ["Location", Boolean((p.location || "").trim())],
    ["Bio", Boolean((p.bio || "").trim())],
    ["Profile photo", isAvatarUrl(p.avatarURL)]
  ];
  if (ROLE === "freelancer") checks.push(
    ["Skills", Boolean((p.skills || "").trim())],
    ["Category", categories.includes(p.category)],
    ["Experience level", Boolean(p.experienceLevel)],
    ["Availability", Boolean(p.availability)],
    ["At least one portfolio project", state.portfolios.length > 0]
  );
  const done = checks.filter(([,ok]) => ok).length;
  const percent = Math.round(100 * done / checks.length);
  setText("completion-percent", `${percent}%`);
  $("#completion-fill").style.width = `${percent}%`;
  $("#completion-bar").setAttribute("aria-valuenow", String(percent));
  const missing = checks.filter(([,ok]) => !ok).map(([label]) => label);
  setText("completion-hint", missing.length ? `Next: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` : "Your profile is complete!");
}

// Phase 3.3 — clients keep private saved freelancer IDs in Firestore.
async function loadSavedIds() {
  if (ROLE !== "client") return;
  const results = await getDocs(query(savedCollection(), limit(100)));
  state.savedIds = new Set(results.docs.map(item => item.id));
  state.savedLoaded = true;
  if (state.directoryLoaded) renderFreelancers();
}
async function loadSavedFreelancers() {
  if (ROLE !== "client") return;
  const activity = beginActivity(null, localized("Loading saved freelancers…", "सेव किए फ्रीलांसर लोड हो रहे हैं…", "जतन केलेले फ्रीलान्सर लोड होत आहेत…"));
  try {
  await loadSavedIds();
  const target = $("#saved-results");
  target.replaceChildren();
  if (!state.savedIds.size) {
    setText("saved-count", "0 saved freelancers");
    target.append(emptyState("No saved freelancers", "Visit Explore and select ☆ Save on a profile to bookmark it."));
    return;
  }
  const saved = await Promise.all([...state.savedIds].map(async uid => {
    try {
      const snap = await getDoc(doc(db, "publicFreelancers", uid));
      return snap.exists() && snap.data().published ? {uid, ...snap.data()} : {uid, unpublished: true};
    } catch { return {uid, unpublished: true}; }
  }));
  setText("saved-count", `${saved.length} saved freelancer${saved.length === 1 ? "" : "s"}`);
  for (const item of saved) {
    const card = node("article", "freelancer-card");
    if (item.unpublished) {
      card.append(node("h3", "", "Unavailable freelancer"), node("p", "", "This profile is hidden or has been removed."));
    } else {
      const row = node("div", "freelancer-card-head");
      const avatar = node("div", "freelancer-avatar");
      renderAvatar(avatar, item.avatarURL, item.displayName);
      row.append(avatar, node("h3", "", item.displayName || "Freelancer"));
      card.append(row, node("p", "", item.headline || item.category || "Freelancer"));
      const view = node("a", "view-public-profile", "View full profile ↗");
      view.href = `freelancer-profile.html?id=${encodeURIComponent(item.uid)}`;
      card.append(view);
      const contact = node("button", "btn-save-freelancer", "✉ Message");
      contact.type = "button";
      contact.dataset.chatFreelancer = item.uid;
      card.append(contact);
    }
    const remove = node("button", "btn-save-freelancer", "★ Remove from saved");
    remove.type = "button";
    remove.dataset.saveFreelancer = item.uid;
    card.append(remove);
    target.append(card);
  }
  } finally { finishActivity(activity); }
}
async function onSavedAction(event) {
  const button = event.target.closest("[data-save-freelancer]");
  if (!button || ROLE !== "client") return;
  const uid = button.dataset.saveFreelancer;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return;
  const activity = beginActivity(button, localized("Updating saved freelancers…", "सेव किए फ्रीलांसर अपडेट हो रहे हैं…", "जतन केलेले फ्रीलान्सर अपडेट होत आहेत…"), "Saving…");
  try {
    if (state.savedIds.has(uid)) {
      await deleteDoc(savedRef(uid));
      state.savedIds.delete(uid);
      notify("Freelancer removed from saved list.", true);
    } else {
      await setDoc(savedRef(uid), { freelancerUid: uid, createdAt: serverTimestamp() });
      state.savedIds.add(uid);
      notify("Freelancer saved.", true);
    }
    renderFreelancers();
    if (!$("[data-view='saved']").hidden) await loadSavedFreelancers();
  } catch (err) { notify(readableError(err)); }
  finally { finishActivity(activity); }
}

async function deleteCollectionInPages(ref, onProgress = () => {}) {
  // Deleting a Firestore parent does not delete its subcollections.
  let deleted = 0;
  for (;;) {
    const found = await getDocs(query(ref, limit(100)));
    if (found.empty) return deleted;
    const batch = writeBatch(db);
    found.docs.forEach(item => batch.delete(item.ref));
    await batch.commit();
    deleted += found.size;
    onProgress(deleted);
    // Keep querying until empty: don't assume no new docs appeared.
  }
}
async function permanentlyDeleteAccount(recovery = false) {
  if (state.deletingAccount) return;
  const button = $(recovery ? "#resume-delete" : "#delete-account");
  const status = $(recovery ? "#recovery-status" : "#delete-account-status");
  const confirmation = $(recovery ? "#recovery-confirm" : "#delete-confirm");
  const passwordInput = $(recovery ? "#recovery-password" : "#delete-password");
  if (confirmation.value.trim() !== "DELETE") {
    status.textContent = "Type DELETE exactly before deleting your account.";
    confirmation.focus();
    return;
  }
  if (!confirm("Permanently delete your FreeLanzo account and associated Firestore data? This cannot be undone.")) return;
  const activity = beginActivity(button, localized("Verifying your identity for account deletion…", "खाता हटाने के लिए पहचान सत्यापित की जा रही है…", "खाते हटवण्यासाठी ओळख तपासली जात आहे…"), "Deleting…");
  const progress = (en, hi = en, mr = en) => {
    status.textContent = localized(en, hi, mr);
    updateActivity(activity, localized(en, hi, mr));
  };
  const uid = state.user.uid;
  let phase = "authentication";
  try {
    progress("Step 1/5 — Confirming your identity…");
    if (accountUsesGoogle()) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await reauthenticateWithPopup(state.user, provider);
    } else {
      const password = passwordInput.value;
      if (!password) throw new Error("Enter your current password before deleting your account.");
      await reauthenticateWithCredential(state.user, EmailAuthProvider.credential(state.user.email, password));
    }
    // Must persist the recovery marker *before* modifying any Firestore data.
    // It permits recovery on this browser if Auth deletion fails after profile removal.
    writeDeletionMarker(uid, ROLE);
    phase = "data";
    // Prevent concurrent profile edits or portfolio writes while cleanup runs.
    state.deletingAccount = true;
    $("#workspace").inert = true;
    // When a previous attempt already removed the parent user document,
    // all known child collections were completed first. Trying to delete
    // public records again would fail rules that require that parent doc.
    // Finish only the remaining Auth deletion instead.
    const profileStillExists = (await getDoc(userDocument())).exists();
    if (!profileStillExists) {
      if (!readDeletionMarker(uid)) throw new Error("Deletion recovery could not be verified on this device.");
      phase = "auth";
      progress("Step 5/5 — Finishing Firebase sign-in deletion…");
      state.deletingAccount = true;
      await deleteUser(state.user);
      clearDeletionMarker(uid);
      progress("Your FreeLanzo account has been deleted. Redirecting…");
      location.replace("index.html");
      return;
    }
    if (ROLE === "freelancer") {
      progress("Step 2/5 — Hiding your public profile…");
      // Hide immediately so partial failures cannot expose stale profiles.
      await deleteDoc(publicDocument());
      progress("Step 3/5 — Removing public portfolio projects…");
      await deleteCollectionInPages(publicProjectsCollection(), count =>
        progress(`Step 3/5 — Removed ${count} public portfolio project(s)…`));
      progress("Step 3/5 — Removing private portfolio projects…");
      await deleteCollectionInPages(portfolioCollection(), count =>
        progress(`Step 3/5 — Removed ${count} private portfolio project(s)…`));
    } else {
      progress("Step 2/5 — Removing your saved freelancer bookmarks…");
      await deleteCollectionInPages(savedCollection(), count =>
        progress(`Step 2/5 — Removed ${count} saved freelancer bookmark(s)…`));
    }
    progress("Step 4/5 — Removing your FreeLanzo profile record…");
    await deleteDoc(userDocument());
    phase = "auth";
    progress("Step 5/5 — Removing your Firebase sign-in identity…");
    state.deletingAccount = true;
    await deleteUser(state.user);
    clearDeletionMarker(uid);
    progress("Your FreeLanzo account has been deleted. Redirecting…");
    location.replace("index.html");
  } catch (error) {
    state.deletingAccount = false;
    $("#workspace").inert = false;
    console.error("Account deletion did not finish:", error);
    const explanation = (error?.code === "auth/requires-recent-login")
      ? "Your login confirmation expired. Confirm your identity again and retry."
      : error?.code === "auth/wrong-password" || error?.code === "auth/invalid-credential"
      ? "Incorrect password. Your account has not been deleted; please try again."
      : error?.code === "auth/popup-closed-by-user"
      ? "Google verification was canceled. No additional data was deleted."
      : error?.code === "permission-denied" || error?.code === "unavailable"
      ? readableError(error)
      : error?.message || readableError(error);
    const interrupted = phase !== "authentication";
    status.textContent = interrupted
      ? `${explanation} Deletion was interrupted. Some records may already be removed. Keep this browser's data and choose Delete/Resume again to finish. Do not create another account with this email yet.`
      : explanation;
    // If the Firestore profile has been removed, the normal dashboard cannot
    // load on refresh. Reveal the recovery panel for a safe retry.
    if (interrupted) {
      try {
        const snap = await getDoc(userDocument());
        if (!snap.exists()) displayRecoveryPanel();
      } catch { /* retry from Settings or reload */ }
    }
  } finally {
    passwordInput.value = "";
    finishActivity(activity);
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
  document.title = `${({ home: "Dashboard Home", profile: "My Profile", portfolios: "My Portfolios", explore: "Explore Freelancers", saved: "Saved Freelancers", messages: "Messages", settings: "Settings" })[name]} — FreeLanzo`;
  $("#main-nav")?.classList.remove("is-open");
  $("#menu-toggle")?.setAttribute("aria-expanded", "false");
  if (name === "portfolios" && !state.portfoliosLoaded) {
    try { await loadPortfolios(); } catch (err) { notify(readableError(err)); }
  }
  if (name === "explore" && !state.directoryLoaded) {
    try { await loadFreelancers(); } catch (err) { notify(readableError(err)); }
  }
  if (name === "saved" && ROLE === "client") {
    try { await loadSavedFreelancers(); } catch (err) { notify(readableError(err)); }
  }
  if (name === "messages") {
    const withUid = !push ? new URLSearchParams(location.search).get("with") || "" : "";
    await activateMessaging(withUid);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}
async function logout(event) {
  const button = event?.currentTarget;
  const activity = beginActivity(button, localized("Signing out…", "साइन आउट हो रहा है…", "साइन आउट होत आहे…"), "Signing out…");
  try { await signOut(auth); location.replace("index.html"); }
  catch (err) { notify(readableError(err)); }
  finally { finishActivity(activity); }
}
function attachEvents() {
  $("#menu-toggle")?.addEventListener("click", () => {
    const opened = $("#main-nav").classList.toggle("is-open");
    $("#menu-toggle").setAttribute("aria-expanded", String(opened));
  });
  document.querySelectorAll("[data-signout]").forEach(b => b.addEventListener("click", logout));
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#photo-input").addEventListener("change", onChoosePhoto);
  $("#photo-upload").addEventListener("click", onUploadPhoto);
  $("#photo-remove").addEventListener("click", onRemovePhoto);
  if (ROLE === "freelancer") {
    $("#portfolio-form").addEventListener("submit", savePortfolio);
    $("#portfolio-list").addEventListener("click", handlePortfolioClick);
    $("#portfolio-cancel").addEventListener("click", resetPortfolioForm);
    $("#save-visibility").addEventListener("click", saveVisibility);
  }
  $("#explore-search").addEventListener("input", renderFreelancers);
  $("#explore-category").addEventListener("change", renderFreelancers);
  $("#explore-skill").addEventListener("input", renderFreelancers);
  $("#explore-experience").addEventListener("change", renderFreelancers);
  $("#explore-availability").addEventListener("change", renderFreelancers);
  $("#explore-clear").addEventListener("click", () => {
    for (const id of ["explore-search", "explore-category", "explore-skill", "explore-experience", "explore-availability"]) {
      $("#" + id).value = "";
    }
    renderFreelancers();
  });
  if (ROLE === "client") {
    $("#freelancer-results").addEventListener("click", onSavedAction);
    $("#saved-results").addEventListener("click", onSavedAction);
  }
  $("#delete-account").addEventListener("click", () => permanentlyDeleteAccount(false));
  $("#delete-password-wrap").hidden = state.profile.provider === "google.com";
  $("#explore-refresh").addEventListener("click", async event => {
    const activity = beginActivity(event.currentTarget, localized("Refreshing freelancer directory…", "फ्रीलांसर डायरेक्टरी अपडेट हो रही है…", "फ्रीलान्सर निर्देशिका अपडेट होत आहे…"), "Refreshing…");
    try { await loadFreelancers(); notify("Directory refreshed.", true); }
    catch (err) { notify(readableError(err)); }
    finally { finishActivity(activity); }
  });
  document.addEventListener("click", async event => {
    const contact = event.target.closest('[data-chat-freelancer]');
    if (contact && ROLE === "client") {
      if (contact.disabled) return;
      contact.disabled = true;
      try {
        await openView("messages", true);
        await beginChatWithFreelancer(contact.dataset.chatFreelancer);
      } catch (error) { notify(error?.message || readableError(error)); }
      finally { contact.disabled = false; }
      return;
    }
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
  if (!user) { if (!state.deletingAccount) location.replace("login.html"); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || !["freelancer", "client"].includes(snap.data().role)) {
      const marker = !snap.exists() ? readDeletionMarker(user.uid) : null;
      if (marker?.role === ROLE) {
        state.user = user;
        state.profile = { provider: accountUsesGoogle(user) ? "google.com" : "password" };
        displayRecoveryPanel();
      } else {
        $("#page-status").textContent = "No valid FreeLanzo profile was found. Contact the project team.";
      }
      return;
    }
    if (snap.data().role !== ROLE) {
      const target = new URL(`${snap.data().role}-dashboard.html`, location.href);
      target.searchParams.set("view", getCurrentView());
      if (selectedCategory && getCurrentView() === "explore") target.searchParams.set("category", selectedCategory);
      location.replace(target.href);
      return;
    }
    if (state.loaded) return;
    state.user = user;
    state.profile = snap.data();
    state.loaded = true;
    populateProfile();
    if (selectedCategory) $("#explore-category").value = selectedCategory;
    attachEvents();
    initializeMessaging({ uid: user.uid, role: ROLE, displayName: state.profile.displayName || user.displayName || "Member" });
    if (ROLE === "client") {
      try { await loadSavedIds(); } catch (err) { notify(readableError(err)); }
    }
    $("#page-status").hidden = true;
    $("#workspace").hidden = false;
    const initialization = beginActivity(null, localized("Loading your FreeLanzo workspace…", "आपका FreeLanzo डैशबोर्ड लोड हो रहा है…", "तुमचा FreeLanzo डॅशबोर्ड लोड होत आहे…"));
    try {
    if (ROLE === "freelancer") {
      try { await Promise.all([loadVisibility(), loadPortfolios()]); }
      catch (err) { notify(readableError(err)); }
    }
    await openView(getCurrentView());
    } finally { finishActivity(initialization); }
  } catch (err) { $("#page-status").textContent = readableError(err); }
}, () => { $("#page-status").textContent = "Unable to check your login. Refresh the page or try again."; });
