/* FreeLanzo Phase 4: real one-to-one TEXT messages and client work offers.
 * Chat and signed work offers live in Cloud Firestore; no chat media uploads.
 * The optional small client signature image is stored in its private offer record.
 */
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { db } from "./firebase.js";

const SIGNATURE_MAX = 30000; // 30 decimal KB
const SIGNATURE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const $ = selector => document.querySelector(selector);
const el = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
};
const validUid = value => typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);
const formatTime = timestamp => {
  const date = timestamp?.toDate?.();
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date) : "Sending…";
};
const formatMoney = (amount, currency = "INR") => {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount}`; }
};
const textError = error => error?.code === "permission-denied"
  ? "Access denied. Publish the Phase 4 Firestore rules and check your conversation membership."
  : error?.message || "Unable to complete this action. Check your internet connection and try again.";

let me = null;
let inboxUnsub = null;
let messagesUnsub = null;
let contractsUnsub = null;
let activeConversation = null;
let conversations = [];
let messages = [];
let contracts = new Map();
let active = false;
let busy = false;
let signatureFile = null;
let liveOfferUrl = null;

function status(message, isError = false) {
  const target = $("#chat-status");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}
function contractStatus(message, isError = false) {
  const target = $("#contract-status");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}
function chatBusy(value, label = "Sending…") {
  busy = value;
  for (const id of ["#chat-send", "#contract-send", "#chat-offer-button"]) {
    const control = $(id);
    if (control) control.disabled = value || !activeConversation || (id === "#chat-offer-button" && me?.role !== "client");
  }
  const btn = $("#chat-send");
  if (btn) btn.textContent = value ? label : "Send ↗";
  const contractBtn = $("#contract-send");
  if (contractBtn) contractBtn.textContent = value ? label : "Send work offer ↗";
}
function showConversationHeader() {
  const title = $("#chat-person-name");
  if (!title) return;
  if (!activeConversation) {
    title.textContent = "Choose a conversation";
    $("#chat-person-detail").textContent = "Select a chat, or start one from Explore Freelancers.";
    $("#chat-empty").hidden = false;
    $("#chat-content").hidden = true;
    return;
  }
  title.textContent = me.role === "client" ? activeConversation.freelancerName : activeConversation.clientName;
  $("#chat-person-detail").textContent = "One-to-one conversation · Only the two participants can access this chat.";
  $("#chat-empty").hidden = true;
  $("#chat-content").hidden = false;
  $("#chat-offer-button").hidden = me.role !== "client";
  $("#chat-offer-button").disabled = busy || me.role !== "client";
}
function renderInbox() {
  const holder = $("#chat-inbox-list");
  if (!holder) return;
  holder.replaceChildren();
  const ordered = [...conversations].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  if (!ordered.length) {
    holder.append(el("p", "chat-inbox-empty", "No conversations yet. Clients can start a chat from Explore Freelancers."));
    return;
  }
  for (const convo of ordered) {
    const btn = el("button", "chat-inbox-item");
    btn.type = "button";
    btn.classList.toggle("is-active", activeConversation?.id === convo.id);
    const name = me.role === "client" ? convo.freelancerName : convo.clientName;
    btn.append(el("strong", "", name || "FreeLanzo member"));
    btn.append(el("span", "", convo.lastMessage || "Start your conversation"));
    btn.append(el("small", "", formatTime(convo.updatedAt)));
    btn.addEventListener("click", () => selectConversation(convo));
    holder.append(btn);
  }
}

function contractCard(offer) {
  const card = el("article", "chat-contract");
  card.append(el("span", "chat-contract-eyebrow", "WORK OFFER / RECORDED IN FREELANZO"));
  if (!offer) {
    card.append(el("p", "", "Loading work offer…"));
    return card;
  }
  card.append(el("h3", "", "Work offer"));
  const rows = [
    ["Client/company", offer.companyName],
    ["Payment", formatMoney(offer.amount, offer.currency)],
    ["Working days", (offer.days || []).join(", ")],
    ["Working hours", `${offer.startTime}–${offer.endTime} (${offer.timezone || "local time"})`]
  ];
  for (const [label, value] of rows) {
    const row = el("div", "chat-contract-row");
    row.append(el("span", "", label), el("strong", "", value));
    card.append(row);
  }
  const signature = el("div", "chat-signature-record");
  signature.append(el("span", "", "CLIENT SIGNATURE"));
  const img = el("img");
  img.src = offer.signatureData;
  img.alt = "Signature image supplied by the client";
  img.loading = "lazy";
  signature.append(img);
  card.append(signature);
  card.append(el("p", `chat-offer-state status-${offer.status}`, `Status: ${offer.status === "accepted" ? "Accepted" : offer.status === "declined" ? "Declined" : "Pending freelancer response"}`));
  if (offer.respondedAt) card.append(el("small", "", `Responded ${formatTime(offer.respondedAt)}`));
  if (offer.status === "pending" && me.role === "freelancer") {
    const actions = el("div", "chat-offer-actions");
    for (const [decision, label] of [["accepted", "Accept offer"], ["declined", "Decline offer"]]) {
      const btn = el("button", decision === "accepted" ? "btn btn-primary" : "btn btn-outline", label);
      btn.type = "button";
      btn.addEventListener("click", () => respondToOffer(offer.id, decision, btn));
      actions.append(btn);
    }
    card.append(actions);
  }
  return card;
}
async function respondToOffer(offerId, decision, button) {
  if (busy || !activeConversation || me.role !== "freelancer") return;
  const convoId = activeConversation.id;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await runTransaction(db, async transaction => {
      const offerRef = doc(db, "conversations", convoId, "contracts", offerId);
      const snapshot = await transaction.get(offerRef);
      if (!snapshot.exists() || snapshot.data().status !== "pending") {
        throw new Error("This offer has already been answered or is unavailable.");
      }
      if (snapshot.data().freelancerUid !== me.uid) throw new Error("Only the addressed freelancer can respond.");
      transaction.update(offerRef, { status: decision, respondedAt: serverTimestamp() });
    });
    status(`Offer ${decision}.`, false);
  } catch (error) { status(textError(error), true); }
  finally { button.disabled = false; button.textContent = original; }
}

function renderMessages() {
  const list = $("#chat-message-list");
  if (!list || !activeConversation) return;
  list.replaceChildren();
  if (!messages.length) {
    list.append(el("p", "chat-no-messages", "No messages yet. Say hello to start the conversation."));
    return;
  }
  for (const message of [...messages].reverse()) {
    const item = el("article", message.senderUid === me.uid ? "chat-message is-mine" : "chat-message is-theirs");
    item.append(el("span", "chat-message-author", message.senderUid === me.uid ? "You" : "Other participant"));
    if (message.kind === "contract") {
      item.append(contractCard(contracts.get(message.contractId)));
    } else if (message.kind === "text") {
      item.append(el("p", "chat-message-text", message.text || ""));
    } else {
      // Display a harmless note for any old file-type messages already in Firestore.
      // The text-only version no longer downloads, previews or sends chat media.
      item.append(el("p", "chat-message-text", "Attachment unavailable in this text-only chat version."));
    }
    item.append(el("time", "chat-message-time", formatTime(message.createdAt)));
    list.append(item);
  }
  list.scrollTop = list.scrollHeight;
}
function detachConversation() {
  messagesUnsub?.(); contractsUnsub?.();
  messagesUnsub = null; contractsUnsub = null;
  messages = []; contracts = new Map();
}
function selectConversation(convo) {
  if (!convo || (convo.id === activeConversation?.id && messagesUnsub)) return;
  detachConversation();
  activeConversation = convo;
  showConversationHeader();
  renderInbox();
  $("#chat-message-list").replaceChildren(el("p", "chat-no-messages", "Loading messages…"));
  messagesUnsub = onSnapshot(
    query(collection(db, "conversations", convo.id, "messages"), orderBy("createdAt", "desc"), limit(100)),
    snapshot => { messages = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); renderMessages(); },
    error => status(textError(error), true)
  );
  contractsUnsub = onSnapshot(
    query(collection(db, "conversations", convo.id, "contracts"), limit(100)),
    snapshot => { contracts = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }])); renderMessages(); },
    error => status(textError(error), true)
  );
  $("#chat-compose").reset();
  chatBusy(false);
  closeContractForm();
  status("Messages are private to the two registered participants.");
}

async function sendMessage(text, conversationId) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText || trimmedText.length > 2000) {
    throw new Error("Enter a text message of at most 2,000 characters.");
  }
  if (activeConversation?.id !== conversationId) {
    throw new Error("Conversation changed before the message was sent.");
  }
  const msgRef = doc(collection(db, "conversations", conversationId, "messages"));
  const batch = writeBatch(db);
  batch.set(msgRef, {
    senderUid: me.uid,
    kind: "text",
    text: trimmedText,
    contractId: "",
    createdAt: serverTimestamp()
  });
  batch.update(doc(db, "conversations", conversationId), {
    lastMessage: trimmedText.slice(0, 140),
    lastSenderUid: me.uid,
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}

async function onSend(event) {
  event.preventDefault();
  if (!activeConversation || busy) return;
  const text = $("#chat-text").value.trim();
  if (!text) {
    status("Write a message before sending.", true);
    return;
  }
  const conversationId = activeConversation.id;
  chatBusy(true);
  try {
    await sendMessage(text, conversationId);
    // A user can switch conversations while a request is in flight.
    // Never clear a draft they typed in the newly selected chat.
    if (activeConversation?.id === conversationId) {
      $("#chat-text").value = "";
      status("Message sent.");
    }
  } catch (error) {
    status(textError(error), true);
  } finally {
    chatBusy(false);
  }
}

function closeContractForm() {
  const panel = $("#contract-panel");
  if (panel) panel.hidden = true;
  signatureFile = null;
  if (liveOfferUrl) URL.revokeObjectURL(liveOfferUrl);
  liveOfferUrl = null;
  const preview = $("#contract-signature-preview");
  if (preview) { preview.removeAttribute("src"); preview.hidden = true; }
  contractStatus("Client signatures are stored privately with the offer, not published to the freelancer directory.");
}
function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The signature image could not be read."));
    reader.readAsDataURL(file);
  });
}
async function onSendContract(event) {
  event.preventDefault();
  if (busy || !activeConversation || me.role !== "client") return;
  const form = $("#contract-form");
  if (!form.reportValidity()) return;
  const companyName = $("#contract-company").value.trim();
  const amount = Number($("#contract-amount").value);
  const days = [...form.querySelectorAll('[name="contract-day"]:checked')].map(input => input.value);
  const startTime = $("#contract-start").value;
  const endTime = $("#contract-end").value;
  const timezone = $("#contract-timezone").value.trim();
  if (companyName.length < 2 || companyName.length > 100) return contractStatus("Enter a client/company name (2–100 characters).", true);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) return contractStatus("Enter a valid positive payment amount.", true);
  if (!days.length || days.some(day => !DAYS.includes(day))) return contractStatus("Select at least one working day.", true);
  if (!startTime || !endTime || startTime >= endTime) return contractStatus("Choose a start time earlier than the end time.", true);
  if (!timezone || timezone.length > 50) return contractStatus("Specify the time zone for the working hours.", true);
  if (!signatureFile || !SIGNATURE_MIMES.has(signatureFile.type) || signatureFile.size === 0 || signatureFile.size > SIGNATURE_MAX) {
    return contractStatus("Choose a JPG, PNG, or WebP signature image up to 30 KB.", true);
  }
  chatBusy(true, "Sending…");
  try {
    const signatureData = await dataUrlFromFile(signatureFile);
    if (signatureData.length > 41000) throw new Error("Signature encoding exceeds the allowed size.");
    const convo = activeConversation;
    const contractRef = doc(collection(db, "conversations", convo.id, "contracts"));
    const messageRef = doc(collection(db, "conversations", convo.id, "messages"));
    const batch = writeBatch(db);
    batch.set(contractRef, {
      clientUid: me.uid, freelancerUid: convo.freelancerUid,
      companyName, amount, currency: "INR", days,
      startTime, endTime, timezone,
      signatureMime: signatureFile.type, signatureSize: signatureFile.size, signatureData,
      status: "pending", createdAt: serverTimestamp(), respondedAt: null
    });
    batch.set(messageRef, {
      senderUid: me.uid, kind: "contract", text: "Work offer",
      contractId: contractRef.id, createdAt: serverTimestamp()
    });
    batch.update(doc(db, "conversations", convo.id), {
      lastMessage: "📋 Work offer sent", lastSenderUid: me.uid, updatedAt: serverTimestamp()
    });
    await batch.commit();
    form.reset(); closeContractForm();
    status("Offer sent. The freelancer can accept or decline it.");
  } catch (error) { contractStatus(textError(error), true); }
  finally { chatBusy(false); }
}

export function initializeMessaging({ uid, role, displayName }) {
  if (active) return;
  if (!validUid(uid) || !["client", "freelancer"].includes(role)) return;
  active = true;
  me = { uid, role, displayName: String(displayName || "Member").slice(0, 80) };
  $("#chat-compose")?.addEventListener("submit", onSend);
  $("#contract-form")?.addEventListener("submit", onSendContract);
  $("#chat-offer-button")?.addEventListener("click", () => {
    const panel = $("#contract-panel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $("#contract-company").focus();
  });
  $("#contract-cancel")?.addEventListener("click", closeContractForm);
  $("#contract-signature")?.addEventListener("change", event => {
    const file = event.currentTarget.files?.[0];
    signatureFile = null;
    const preview = $("#contract-signature-preview");
    if (liveOfferUrl) URL.revokeObjectURL(liveOfferUrl);
    preview.hidden = true;
    if (!file) return;
    if (!SIGNATURE_MIMES.has(file.type) || file.size === 0 || file.size > SIGNATURE_MAX) {
      event.currentTarget.value = "";
      contractStatus("Signature must be JPG, PNG, or WebP and no more than 30 KB.", true);
      return;
    }
    signatureFile = file;
    liveOfferUrl = URL.createObjectURL(file);
    preview.src = liveOfferUrl;
    preview.hidden = false;
    contractStatus(`Signature ready: ${(file.size / 1000).toFixed(1)} KB.`);
  });
  $("#chat-inbox-search")?.addEventListener("input", () => {
    const filter = $("#chat-inbox-search").value.trim().toLowerCase();
    for (const button of $("#chat-inbox-list").querySelectorAll(".chat-inbox-item")) {
      button.hidden = !button.textContent.toLowerCase().includes(filter);
    }
  });
  showConversationHeader();
  inboxUnsub = onSnapshot(
    query(collection(db, "conversations"), where("memberUids", "array-contains", uid), limit(70)),
    snapshot => {
      conversations = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      const freshActive = conversations.find(item => item.id === activeConversation?.id);
      if (freshActive) activeConversation = freshActive;
      renderInbox();
      const filter = $("#chat-inbox-search")?.value.trim().toLowerCase() || "";
      if (filter) for (const button of $("#chat-inbox-list").querySelectorAll(".chat-inbox-item")) {
        button.hidden = !button.textContent.toLowerCase().includes(filter);
      }
      if (freshActive) showConversationHeader();
    },
    error => status(textError(error), true)
  );
}
export async function beginChatWithFreelancer(freelancerUid) {
  if (me?.role !== "client") throw new Error("Only clients can start new freelancer conversations.");
  if (!validUid(freelancerUid) || freelancerUid === me.uid) throw new Error("Invalid freelancer account.");
  const publicSnap = await getDoc(doc(db, "publicFreelancers", freelancerUid));
  if (!publicSnap.exists() || publicSnap.data().published !== true) throw new Error("This freelancer is no longer available in Explore.");
  const conversationId = `${me.uid}_${freelancerUid}`;
  const reference = doc(db, "conversations", conversationId);
  let snapshot = await getDoc(reference);
  if (!snapshot.exists()) {
    try {
      await setDoc(reference, {
        clientUid: me.uid, freelancerUid,
        memberUids: [me.uid, freelancerUid],
        clientName: me.displayName,
        freelancerName: String(publicSnap.data().displayName || "Freelancer").slice(0, 80),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        lastMessage: "", lastSenderUid: ""
      });
    } catch (error) {
      // A parallel tab may have created the same deterministic conversation.
      snapshot = await getDoc(reference);
      if (!snapshot.exists()) throw error;
    }
    snapshot = await getDoc(reference);
  }
  const data = snapshot.data();
  if (!data || data.clientUid !== me.uid || data.freelancerUid !== freelancerUid) {
    throw new Error("Conversation participant validation failed.");
  }
  selectConversation({ id: snapshot.id, ...data });
  return snapshot.id;
}
export async function activateMessaging(freelancerUid = "") {
  if (!active) return;
  if (freelancerUid && me.role === "client") {
    status("Opening your conversation…");
    try { await beginChatWithFreelancer(freelancerUid); }
    catch (error) { status(textError(error), true); }
  }
}
