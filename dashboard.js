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
import { AVATAR_MIN_BYTES, AVATAR_MAX_BYTES, isAvatarUrl, optimizeAvatar, renderAvatar, uploadAvatar } from "./avatar.js";
import { selectAvatarCrop } from "./avatar-crop.js";
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
  const button = $("#portfolio-save"); button.disabled = true;
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
  const button = $("#save-profile"); button.disabled = true;
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
  finally { button.disabled = false; }
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
  const button = $("#save-visibility"); button.disabled = true;
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
  } finally { button.disabled = false; }
}
async function loadFreelancers() {
  const results = await getDocs(query(collection(db, "publicFreelancers"), where("published", "==", true), limit(80)));
  state.freelancers = results.docs.map(item => ({ ...item.data(), uid: item.id }));
  state.directoryLoaded = true;
  setText("stat-freelancers", state.freelancers.length);
  renderFreelancers();
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
    wrap.append(emptyState(state.freelancers.length ? "No matches found" : "No published freelancers yet", state.freelancers.length ? "Try another skill or remove the category filter." : "Freelancers will appear here once they publish their profiles from Settings."));
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
  try {
    if (file.size < AVATAR_MIN_BYTES || file.size > AVATAR_MAX_BYTES) throw new Error("Choose a photo between 10 KB and 200 KB.");
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
}
async function onUploadPhoto() {
  if (!state.photoBlob) return;
  const upload = $("#photo-upload");
  const remove = $("#photo-remove");
  upload.disabled = true; remove.disabled = true;
  $("#photo-status").textContent = "Uploading your photo…";
  try {
    const url = await uploadAvatar(state.photoBlob);
    await updateAvatarURL(url);
    clearPhotoSelection();
    $("#photo-status").textContent = "Photo saved successfully.";
    notify("Profile photo updated.", true);
  } catch (error) {
    $("#photo-status").textContent = error.message || "Could not upload your photo.";
    upload.disabled = false;
    remove.disabled = !isAvatarUrl(state.profile.avatarURL);
  }
}
async function onRemovePhoto() {
  if (!state.profile.avatarURL) return;
  const button = $("#photo-remove"); button.disabled = true;
  try {
    await updateAvatarURL("");
    clearPhotoSelection();
    $("#photo-status").textContent = "Photo removed from your FreeLanzo profile.";
    notify("Profile photo removed.", true);
  } catch (error) {
    $("#photo-status").textContent = readableError(error);
    button.disabled = false;
  }
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
    }
    const remove = node("button", "btn-save-freelancer", "★ Remove from saved");
    remove.type = "button";
    remove.dataset.saveFreelancer = item.uid;
    card.append(remove);
    target.append(card);
  }
}
async function onSavedAction(event) {
  const button = event.target.closest("[data-save-freelancer]");
  if (!button || ROLE !== "client") return;
  const uid = button.dataset.saveFreelancer;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return;
  button.disabled = true;
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
  } catch (err) { notify(readableError(err)); button.disabled = false; }
}

async function deleteCollectionInPages(ref) {
  // Delete child documents before deleting the parent. Firestore does not
  // cascade subcollections when a parent is deleted.
  while (true) {
    const found = await getDocs(query(ref, limit(100)));
    if (found.empty) break;
    const batch = writeBatch(db);
    found.docs.forEach(item => batch.delete(item.ref));
    await batch.commit();
    if (found.size < 100) break;
  }
}
async function permanentlyDeleteAccount() {
  const button = $("#delete-account");
  const status = $("#delete-account-status");
  if ($("#delete-confirm").value.trim() !== "DELETE") {
    status.textContent = "Type DELETE exactly before deleting your account.";
    return;
  }
  if (!confirm("Permanently delete your FreeLanzo account and associated Firestore data? This cannot be undone.")) return;
  button.disabled = true;
  status.textContent = "Verifying your identity…";
  try {
    if (state.profile.provider === "google.com") {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({prompt: "select_account"});
      await reauthenticateWithPopup(state.user, provider);
    } else {
      const password = $("#delete-password").value;
      if (!password) throw new Error("Enter your current password before deleting your account.");
      await reauthenticateWithCredential(state.user,
        EmailAuthProvider.credential(state.user.email, password));
    }
    status.textContent = "Deleting stored FreeLanzo data…";
    await deleteCollectionInPages(portfolioCollection());
    await deleteCollectionInPages(savedCollection());
    await deleteCollectionInPages(publicProjectsCollection());
    const batch = writeBatch(db);
    if (ROLE === "freelancer") batch.delete(publicDocument());
    batch.delete(userDocument());
    await batch.commit();
    status.textContent = "Removing Firebase sign-in…";
    // Do not delete Auth identity until Firestore owner-owned data is removed.
    state.deletingAccount = true;
    await deleteUser(state.user);
    location.replace("index.html");
  } catch (error) {
    state.deletingAccount = false;
    console.error("Account deletion did not finish:", error);
    status.textContent = error?.message || readableError(error);
    if (error?.code === "auth/requires-recent-login") {
      status.textContent = "Authentication expired. Please sign in again and retry account deletion.";
    }
    button.disabled = false;
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
  $("#delete-account").addEventListener("click", permanentlyDeleteAccount);
  $("#delete-password-wrap").hidden = state.profile.provider === "google.com";
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
  if (!user) { if (!state.deletingAccount) location.replace("login.html"); return; }
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || !["freelancer", "client"].includes(snap.data().role)) {
      $("#page-status").textContent = "No valid FreeLanzo profile was found. Contact the project team.";
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
    if (ROLE === "client") {
      try { await loadSavedIds(); } catch (err) { notify(readableError(err)); }
    }
    $("#page-status").hidden = true;
    $("#workspace").hidden = false;
    if (ROLE === "freelancer") {
      try { await Promise.all([loadVisibility(), loadPortfolios()]); }
      catch (err) { notify(readableError(err)); }
    }
    await openView(getCurrentView());
  } catch (err) { $("#page-status").textContent = readableError(err); }
}, () => { $("#page-status").textContent = "Unable to check your login. Refresh the page or try again."; });
