/* FreeLanzo Phase 4.1: private realtime text messages, unread counts and work offers.
 * Chat and signed work offers live in Cloud Firestore; no chat media uploads.
 * The optional small client signature image is stored in its private offer record.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, startAfter,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { db } from "./firebase.js";

const SIGNATURE_MAX = 30000; // 30 decimal KB
const SIGNATURE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const $ = selector => document.querySelector(selector);
const ui = text => window.FreeLanzoPreferences?.t?.(text) || text;
const el = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
};
const validUid = value => typeof value === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(value);
const formatTime = timestamp => {
  const date = timestamp?.toDate?.();
  return date ? new Intl.DateTimeFormat(({hi:"hi-IN",mr:"mr-IN"})[document.documentElement.lang] || "en-IN", { dateStyle: "short", timeStyle: "short" }).format(date) : "Sending…";
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
let blockedByMe = false;
let pendingSend = null;
let oldestPageCursor = null;
let moreMessages = false;
let olderMessages = new Map();
let loadingOlder = false;
const PAGE_SIZE = 100;
const MSG_KINDS = new Set(["text", "contract"]);
function otherUid(convo = activeConversation) {
  return !convo ? "" : (convo.clientUid === me?.uid ? convo.freelancerUid : convo.clientUid);
}
function conversationClosed(convo = activeConversation) {
  return Boolean(convo && (convo.clientActive === false || convo.freelancerActive === false));
}
function cannotSend() { return !activeConversation || conversationClosed() || blockedByMe; }
function availabilityNotice() {
  return conversationClosed() ? "This conversation is closed because an account was deleted." :
    blockedByMe ? "You blocked this user. Unblock them to send messages or offers." : "";
}
function syncChatControls() {
  const disabled = cannotSend();
  const send = $("#chat-send");
  if (send) send.disabled = busy || disabled;
  const offer = $("#chat-offer-button");
  if (offer) offer.disabled = busy || disabled || me?.role !== "client";
  const block = $("#chat-block");
  if (block) { block.disabled = !activeConversation || conversationClosed(); block.textContent = blockedByMe ? ui("Unblock user") : ui("Block user"); }
  const composer = $("#chat-text");
  if (composer) composer.disabled = disabled;
  const contractSend = $("#contract-send");
  if (contractSend) contractSend.disabled = busy || disabled || me?.role !== "client";
  const retry = $("#chat-retry");
  if (retry) retry.hidden = !pendingSend || pendingSend.conversationId !== activeConversation?.id || disabled;
  if (disabled && activeConversation) status(availabilityNotice(), true);
}
async function refreshMyBlock() {
  const selectedId = activeConversation?.id;
  blockedByMe = false;
  syncChatControls();
  if (!selectedId) return;
  try {
    const snap = await getDoc(doc(db, "users", me.uid, "blocked", otherUid()));
    if (activeConversation?.id === selectedId) { blockedByMe = snap.exists(); syncChatControls(); }
  } catch (error) { if (activeConversation?.id === selectedId) status(textError(error), true); }
}
async function toggleBlock() {
  if (!activeConversation || conversationClosed()) return;
  const target = otherUid();
  if (!window.confirm(blockedByMe ? "Unblock this account and allow new chat messages?" : "Block this account? Neither person will be able to send messages or work offers while blocked.")) return;
  const control = $("#chat-block"); control.disabled = true;
  try {
    const ref = doc(db, "users", me.uid, "blocked", target);
    if (blockedByMe) await deleteDoc(ref);
    else await setDoc(ref, { blockedUid: target, createdAt: serverTimestamp() });
    blockedByMe = !blockedByMe;
    status(blockedByMe ? "Account blocked. New messages and work offers are disabled." : "Account unblocked.");
  } catch (error) { status(textError(error), true); }
  finally { syncChatControls(); }
}

const markingRead = new Set();
const actingOnOffer = new Set();
const PAYMENT_LABELS = {
  completion: "On project completion",
  milestones: "In agreed milestones",
  weekly: "Weekly payments",
  upfront: "Before work begins"
};
const UNREAD_FIELDS = { client: "clientUnread", freelancer: "freelancerUnread" };
function todayLocal() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function myUnread(convo) {
  const value = Number(convo?.[UNREAD_FIELDS[me?.role]] || 0);
  return Number.isFinite(value) && value > 0 ? Math.min(9999, Math.floor(value)) : 0;
}
function markConversationRead(convo) {
  if (!convo || convo.id !== activeConversation?.id || !myUnread(convo) || markingRead.has(convo.id)) return;
  markingRead.add(convo.id);
  updateDoc(doc(db, "conversations", convo.id), { [UNREAD_FIELDS[me.role]]: 0 })
    .catch(error => status(`Could not mark messages read: ${textError(error)}`, true))
    .finally(() => markingRead.delete(convo.id));
}


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
  syncChatControls();
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
  syncChatControls();
}
function renderInbox() {
  const holder = $("#chat-inbox-list");
  if (!holder) return;
  holder.replaceChildren();
  const totalUnread = conversations.reduce((sum, convo) => sum + myUnread(convo), 0);
  const totalLabel = $("#chat-unread-total");
  if (totalLabel) totalLabel.textContent = ui(totalUnread ? `${totalUnread} unread` : "All read");
  const ordered = [...conversations].sort((a,b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  if (!ordered.length) {
    holder.append(el("p", "chat-inbox-empty", "No conversations yet. Clients can start a chat from Explore Freelancers."));
    return;
  }
  for (const convo of ordered) {
    const unread = myUnread(convo);
    const btn = el("button", "chat-inbox-item");
    btn.type = "button";
    btn.classList.toggle("is-active", activeConversation?.id === convo.id);
    btn.classList.toggle("has-unread", unread > 0);
    const name = me.role === "client" ? convo.freelancerName : convo.clientName;
    const nameRow = el("span", "chat-inbox-name-row");
    nameRow.append(el("strong", "", name || "FreeLanzo member"));
    if (unread) {
      const count = el("b", "chat-unread-badge", unread > 99 ? "99+" : String(unread));
      count.setAttribute("aria-label", ui(`${unread} unread messages`));
      nameRow.append(count);
    }
    btn.append(nameRow);
    btn.append(el("span", "chat-inbox-preview", convo.lastMessage || "Start your conversation"));
    btn.append(el("small", "", formatTime(convo.updatedAt)));
    btn.addEventListener("click", () => selectConversation(convo));
    holder.append(btn);
  }
}

function printOffer(offer) {
  if (!offer) return;
  const old = document.getElementById("freelanzo-print-sheet"); old?.remove();
  const sheet = el("section", "print-contract-sheet"); sheet.id = "freelanzo-print-sheet";
  sheet.append(el("h1", "", "FreeLanzo — Recorded Work Offer"));
  sheet.append(el("p", "", "This printout records user-submitted terms and status; it is not a verified electronic signature or proof of payment."));
  for (const [label, value] of [
    ["Client / company", offer.companyName], ["Payment amount", formatMoney(offer.amount, offer.currency)],
    ["Working days", (offer.days || []).join(", ")], ["Working hours", `${offer.startTime}–${offer.endTime} (${offer.timezone})`],
    ["Work description", offer.workDescription], ["Deadline", offer.deadline],
    ["Payment terms", PAYMENT_LABELS[offer.paymentTerms] || offer.paymentTerms],
    ["Payment schedule", offer.paymentDetails || "—"], ["Status", offer.status],
    ["Created", formatTime(offer.createdAt)], ["Responded", offer.respondedAt ? formatTime(offer.respondedAt) : "Pending"]
  ]) {
    const row = el("div", "print-contract-row");
    row.append(el("strong", "", label), el("p", "", String(value || "—"))); sheet.append(row);
  }
  if (typeof offer.signatureData === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(offer.signatureData)) {
    const label = el("h2", "", "Client-provided signature image");
    const img = el("img"); img.src = offer.signatureData; img.alt = "Unverified client-provided signature image";
    sheet.append(label, img);
  }
  document.body.append(sheet);
  window.addEventListener("afterprint", () => sheet.remove(), { once: true });
  window.print();
}

function contractCard(offer) {
  const card = el("article", "chat-contract");
  card.append(el("span", "chat-contract-eyebrow", ui("WORK OFFER / RECORDED IN FREELANZO")));
  if (!offer) {
    card.append(el("p", "", "Loading work offer…"));
    return card;
  }
  card.append(el("h3", "", ui("Work offer")));
  const rows = [
    ["Client/company", offer.companyName],
    ["Payment", formatMoney(offer.amount, offer.currency)],
    ["Working days", (offer.days || []).join(", ")],
    ["Working hours", `${offer.startTime}–${offer.endTime} (${offer.timezone || "local time"})`]
  ];
  if (offer.deadline) rows.push(["Project deadline", offer.deadline]);
  if (offer.paymentTerms) rows.push(["Payment terms", PAYMENT_LABELS[offer.paymentTerms] || offer.paymentTerms]);
  if (offer.paymentDetails) rows.push(["Payment schedule", offer.paymentDetails]);
  for (const [label, value] of rows) {
    const row = el("div", "chat-contract-row");
    row.append(el("span", "", ui(label)), el("strong", "", String(value || "—")));
    card.append(row);
  }
  if (offer.workDescription) {
    const details = el("div", "chat-contract-description");
    details.append(el("span", "", ui("WORK DESCRIPTION / DELIVERABLES")));
    details.append(el("p", "", offer.workDescription));
    card.append(details);
  }
  const signature = el("div", "chat-signature-record");
  signature.append(el("span", "", ui("CLIENT SIGNATURE IMAGE")));
  const img = el("img");
  img.src = offer.signatureData;
  img.alt = "Signature image supplied by the client";
  img.loading = "lazy";
  signature.append(img);
  card.append(signature);
  const labels = { pending: "Pending freelancer response", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled by client" };
  card.append(el("p", `chat-offer-state status-${offer.status}`, `${ui("Status")}: ${ui(labels[offer.status] || offer.status)}`));
  const printButton = el("button", "btn btn-outline chat-print-button", ui("Print offer"));
  printButton.type = "button";
  printButton.addEventListener("click", () => printOffer(offer));
  card.append(printButton);
  if (offer.respondedAt) {
    card.append(el("small", "", `${ui(offer.status === "cancelled" ? "Cancelled" : "Responded")} ${formatTime(offer.respondedAt)}`));
  }
  if (offer.status === "pending" && !conversationClosed() && !blockedByMe && me.role === "freelancer" && offer.freelancerUid === me.uid) {
    const actions = el("div", "chat-offer-actions");
    for (const [decision, label] of [["accepted", "Accept offer"], ["declined", "Decline offer"]]) {
      const btn = el("button", decision === "accepted" ? "btn btn-primary" : "btn btn-outline", ui(label));
      btn.type = "button";
      btn.addEventListener("click", () => updateOfferStatus(offer.id, decision, btn));
      actions.append(btn);
    }
    card.append(actions);
  }
  if (offer.status === "pending" && !conversationClosed() && !blockedByMe && me.role === "client" && offer.clientUid === me.uid) {
    const actions = el("div", "chat-offer-actions");
    const btn = el("button", "btn btn-outline", ui("Cancel pending offer"));
    btn.type = "button";
    btn.addEventListener("click", () => updateOfferStatus(offer.id, "cancelled", btn));
    actions.append(btn);
    card.append(actions);
  }
  return card;
}
async function updateOfferStatus(offerId, decision, button) {
  if (busy || cannotSend() || actingOnOffer.has(offerId)) return;
  const allowed = me.role === "freelancer" ? ["accepted", "declined"] : ["cancelled"];
  if (!allowed.includes(decision)) return;
  const action = decision === "accepted" ? "accept" : decision === "declined" ? "decline" : "cancel";
  if (!window.confirm(`Are you sure you want to ${action} this work offer? This action cannot be undone. The offer terms will remain recorded.`)) return;
  const convoId = activeConversation.id;
  const original = button.textContent;
  actingOnOffer.add(offerId);
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await runTransaction(db, async transaction => {
      const offerRef = doc(db, "conversations", convoId, "contracts", offerId);
      const snapshot = await transaction.get(offerRef);
      if (!snapshot.exists() || snapshot.data().status !== "pending") {
        throw new Error("This offer has already been answered or is unavailable.");
      }
      const data = snapshot.data();
      if (me.role === "freelancer" && data.freelancerUid !== me.uid) throw new Error("Only the addressed freelancer can respond.");
      if (me.role === "client" && data.clientUid !== me.uid) throw new Error("Only the sending client can cancel this offer.");
      transaction.update(offerRef, { status: decision, respondedAt: serverTimestamp() });
    });
    status(`Offer ${decision}.`, false);
  } catch (error) { status(textError(error), true); }
  finally { actingOnOffer.delete(offerId); button.disabled = false; button.textContent = original; }
}

function renderMessages() {
  const list = $("#chat-message-list");
  if (!list || !activeConversation) return;
  list.replaceChildren();
  if (!messages.length) {
    list.append(el("p", "chat-no-messages", "No messages yet. Say hello to start the conversation."));
    return;
  }
  const allMessages = new Map([...olderMessages, ...messages.map(m => [m.id, m])]);
  const orderedMessages = [...allMessages.values()].sort((a, b) =>
    (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0) || a.id.localeCompare(b.id));
  let previousDay = "";
  for (const message of orderedMessages) {
    const date = message.createdAt?.toDate?.();
    if (date) {
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (dayKey !== previousDay) {
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const sameDay = d => d && d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
        const label = sameDay(today) ? ui("Today") : sameDay(yesterday) ? ui("Yesterday") :
          new Intl.DateTimeFormat(({ hi: "hi-IN", mr: "mr-IN" })[document.documentElement.lang] || "en-IN", { dateStyle: "medium" }).format(date);
        const separator = el("div", "chat-date-separator", label); separator.setAttribute("role", "separator");
        list.append(separator); previousDay = dayKey;
      }
    }
    const item = el("article", message.senderUid === me.uid ? "chat-message is-mine" : "chat-message is-theirs");
    item.append(el("span", "chat-message-author", ui(message.senderUid === me.uid ? "You" : "Other participant")));
    if (message.kind === "contract") {
      item.append(contractCard(contracts.get(message.contractId)));
    } else if (message.kind === "text") {
      item.append(el("p", "chat-message-text", message.text || ""));
    } else {
      // Display a harmless note for any old file-type messages already in Firestore.
      // The text-only version no longer downloads, previews or sends chat media.
      item.append(el("p", "chat-message-text", "Attachment unavailable in this text-only chat version."));
    }
    const timeTag = el("time", "chat-message-time", formatTime(message.createdAt));
    const sentDate = message.createdAt?.toDate?.();
    if (sentDate) timeTag.dateTime = sentDate.toISOString();
    item.append(timeTag);
    list.append(item);
  }
  // Preserve position when the user explicitly loads older messages.
  if (!loadingOlder) list.scrollTop = list.scrollHeight;
}
function detachConversation() {
  messagesUnsub?.(); contractsUnsub?.();
  messagesUnsub = null; contractsUnsub = null;
  messages = []; contracts = new Map(); olderMessages = new Map();
  oldestPageCursor = null; moreMessages = false; loadingOlder = false;
  const older = $("#chat-load-older"); if (older) older.hidden = true;
}
function selectConversation(convo) {
  if (!convo || (convo.id === activeConversation?.id && messagesUnsub)) return;
  detachConversation();
  activeConversation = convo;
  blockedByMe = false; pendingSend = null; 
  showConversationHeader();
  refreshMyBlock();
  renderInbox();
  $("#chat-message-list").replaceChildren(el("p", "chat-no-messages", "Loading messages…"));
  messagesUnsub = onSnapshot(
    query(collection(db, "conversations", convo.id, "messages"), orderBy("createdAt", "desc"), limit(100)),
    snapshot => {
      if (activeConversation?.id !== convo.id) return;
      messages = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (!oldestPageCursor) oldestPageCursor = snapshot.docs.at(-1) || null;
      if (!olderMessages.size) moreMessages = snapshot.docs.length === PAGE_SIZE;
      $("#chat-load-older").hidden = !moreMessages;
      renderMessages();
      markConversationRead(activeConversation);
    },
    error => status(textError(error), true)
  );
  contractsUnsub = onSnapshot(
    query(collection(db, "conversations", convo.id, "contracts"), limit(100)),
    snapshot => {
      if (activeConversation?.id !== convo.id) return;
      const latest = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]));
      // Keep offers fetched for paginated history; live records take precedence.
      contracts = new Map([...contracts, ...latest]);
      renderMessages();
    },
    error => status(textError(error), true)
  );
  $("#chat-compose").reset();
  chatBusy(false);
  closeContractForm();
  markConversationRead(convo);
  status("Messages are private to the two registered participants.");
}

async function loadOlderMessages() {
  if (loadingOlder || !moreMessages || !oldestPageCursor || !activeConversation) return;
  const id = activeConversation.id;
  const control = $("#chat-load-older"); control.disabled = true;
  const list = $("#chat-message-list");
  const height = list.scrollHeight, top = list.scrollTop;
  loadingOlder = true; $("#chat-history-hint").textContent = ui("Loading earlier messages…");
  try {
    const snapshot = await getDocs(query(collection(db, "conversations", id, "messages"),
      orderBy("createdAt", "desc"), startAfter(oldestPageCursor), limit(PAGE_SIZE)));
    if (activeConversation?.id !== id) return;
    for (const item of snapshot.docs) olderMessages.set(item.id, { id: item.id, ...item.data() });
    if (snapshot.docs.length) oldestPageCursor = snapshot.docs.at(-1);
    moreMessages = snapshot.docs.length === PAGE_SIZE;
    // Contracts outside the live 100-offer window are fetched individually by authorized members.
    const missing = snapshot.docs.map(item => item.data()).filter(m => m.kind === "contract" && m.contractId && !contracts.has(m.contractId));
    for (const m of missing) {
      const offer = await getDoc(doc(db, "conversations", id, "contracts", m.contractId));
      if (offer.exists()) contracts.set(offer.id, { id: offer.id, ...offer.data() });
    }
    renderMessages();
    list.scrollTop = list.scrollHeight - height + top;
    $("#chat-history-hint").textContent = snapshot.empty ? ui("You reached the beginning of this conversation.") : ui(`${snapshot.size} earlier messages loaded.`);
  } catch (error) { status(textError(error), true); }
  finally {
    loadingOlder = false; control.disabled = false;
    control.hidden = !moreMessages;
  }
}

async function sendMessage(text, conversationId, messageId) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText || trimmedText.length > 2000) throw new Error("Enter a text message of at most 2,000 characters.");
  if (activeConversation?.id !== conversationId) throw new Error("Conversation changed before the message was sent.");
  const msgRef = doc(db, "conversations", conversationId, "messages", messageId);
  // A retry uses the SAME message ID, preventing duplicate messages after an uncertain acknowledgement.
  const prior = await getDoc(msgRef);
  if (prior.exists()) {
    if (prior.data().senderUid === me.uid && prior.data().text === trimmedText) return;
    throw new Error("The message ID is already used. Please compose a new message.");
  }
  const batch = writeBatch(db);
  batch.set(msgRef, {
    senderUid: me.uid, kind: "text", text: trimmedText,
    contractId: "", createdAt: serverTimestamp()
  });
  batch.update(doc(db, "conversations", conversationId), {
    lastMessage: trimmedText.slice(0, 140),
    lastMessageId: msgRef.id,
    lastSenderUid: me.uid,
    updatedAt: serverTimestamp(),
    [me.role === "client" ? "freelancerUnread" : "clientUnread"]: increment(1)
  });
  try { await batch.commit(); }
  catch (error) {
    // The server may have committed before the client lost its acknowledgement.
    try {
      const confirmed = await getDoc(msgRef);
      if (confirmed.exists() && confirmed.data().senderUid === me.uid && confirmed.data().text === trimmedText) return;
    } catch { /* Keep pending ID for safe retry */ }
    throw error;
  }
}

async function onSend(event, retry = false) {
  event?.preventDefault?.();
  if (cannotSend() || busy) return;
  const text = retry ? pendingSend?.text : $("#chat-text").value.trim();
  if (!text || text.length > 2000) return status("Enter a text message of at most 2,000 characters.", true);
  const conversationId = activeConversation.id;
  if (!retry || !pendingSend || pendingSend.text !== text || pendingSend.conversationId !== conversationId) {
    pendingSend = { conversationId, text, messageId: doc(collection(db, "conversations", conversationId, "messages")).id };
  }
  chatBusy(true, "Sending…"); status("Sending message…");
  try {
    await sendMessage(pendingSend.text, conversationId, pendingSend.messageId);
    if (activeConversation?.id === conversationId) {
      if ($("#chat-text").value.trim() === text) $("#chat-text").value = "";
      status("Message sent.");
      pendingSend = null;
    }
  } catch (error) {
    status(`Message not confirmed: ${textError(error)}. Use Retry if your connection failed.`, true);
  } finally { chatBusy(false); syncChatControls(); }
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
  if (busy || cannotSend() || me.role !== "client") return;
  const form = $("#contract-form");
  $("#contract-deadline").min = todayLocal();
  if (!form.reportValidity()) return;
  const companyName = $("#contract-company").value.trim();
  const amount = Number($("#contract-amount").value);
  const days = [...form.querySelectorAll('[name="contract-day"]:checked')].map(input => input.value);
  const startTime = $("#contract-start").value;
  const endTime = $("#contract-end").value;
  const timezone = $("#contract-timezone").value.trim();
  const workDescription = $("#contract-description").value.trim();
  const deadline = $("#contract-deadline").value;
  const paymentTerms = $("#contract-payment-terms").value;
  const paymentDetails = $("#contract-payment-details").value.trim();
  if (companyName.length < 2 || companyName.length > 100) return contractStatus("Enter a client/company name (2–100 characters).", true);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) return contractStatus("Enter a valid positive payment amount.", true);
  if (!days.length || days.some(day => !DAYS.includes(day))) return contractStatus("Select at least one working day.", true);
  if (!startTime || !endTime || startTime >= endTime) return contractStatus("Choose a start time earlier than the end time.", true);
  if (!timezone || timezone.length > 50) return contractStatus("Specify the time zone for the working hours.", true);
  if (workDescription.length < 10 || workDescription.length > 1600) return contractStatus("Describe the work and deliverables (10–1,600 characters).", true);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(deadline) || deadline < todayLocal()) return contractStatus("Choose today or a later date as the project deadline.", true);
  if (!Object.hasOwn(PAYMENT_LABELS, paymentTerms)) return contractStatus("Choose a payment schedule.", true);
  if (paymentDetails.length > 500 || (paymentTerms === "milestones" && paymentDetails.length < 5)) return contractStatus("Provide milestone payment details (at least 5 characters).", true);
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
      startTime, endTime, timezone, workDescription, deadline,
      paymentTerms, paymentDetails,
      signatureMime: signatureFile.type, signatureSize: signatureFile.size, signatureData,
      status: "pending", createdAt: serverTimestamp(), respondedAt: null
    });
    batch.set(messageRef, {
      senderUid: me.uid, kind: "contract", text: "Work offer",
      contractId: contractRef.id, createdAt: serverTimestamp()
    });
    batch.update(doc(db, "conversations", convo.id), {
      lastMessage: "📋 Work offer sent", lastMessageId: messageRef.id,
      lastSenderUid: me.uid, updatedAt: serverTimestamp(),
      freelancerUnread: increment(1)
    });
    await batch.commit();
    form.reset(); closeContractForm();
    status("Offer sent. The freelancer can accept or decline it. You can cancel it while pending.");
  } catch (error) { contractStatus(textError(error), true); }
  finally { chatBusy(false); }
}

export function initializeMessaging({ uid, role, displayName }) {
  if (active) return;
  if (!validUid(uid) || !["client", "freelancer"].includes(role)) return;
  active = true;
  me = { uid, role, displayName: String(displayName || "Member").slice(0, 80) };
  $("#chat-compose")?.addEventListener("submit", onSend);
  $("#chat-retry")?.addEventListener("click", () => onSend(null, true));
  $("#chat-load-older")?.addEventListener("click", loadOlderMessages);
  $("#chat-block")?.addEventListener("click", toggleBlock);
  const deadlineInput = $("#contract-deadline");
  if (deadlineInput) deadlineInput.min = todayLocal();
  $("#contract-payment-terms")?.addEventListener("change", () => {
    const terms = $("#contract-payment-terms").value;
    const input = $("#contract-payment-details");
    input.required = terms === "milestones";
    input.placeholder = terms === "milestones"
      ? "e.g. 50% after the first draft and 50% on delivery"
      : "Optional notes about the payment schedule";
  });
  $("#contract-form")?.addEventListener("submit", onSendContract);
  $("#chat-offer-button")?.addEventListener("click", () => {
    const panel = $("#contract-panel");
    if (cannotSend()) return status(availabilityNotice(), true);
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
  window.addEventListener("freelanzo:language-change", () => {
    renderInbox();
    renderMessages();
  });
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
      if (freshActive) {
        showConversationHeader();
        markConversationRead(freshActive);
      }
    },
    error => status(textError(error), true)
  );
}
export async function beginChatWithFreelancer(freelancerUid) {
  if (me?.role !== "client") throw new Error("Only clients can start new freelancer conversations.");
  if (!validUid(freelancerUid) || freelancerUid === me.uid) throw new Error("Invalid freelancer account.");
  const myBlock = await getDoc(doc(db, "users", me.uid, "blocked", freelancerUid));
  if (myBlock.exists()) throw new Error("Unblock this freelancer before starting a conversation.");
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
        lastMessage: "", lastMessageId: "", lastSenderUid: "",
        clientUnread: 0, freelancerUnread: 0, clientActive: true, freelancerActive: true
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
  if (data.clientActive === false || data.freelancerActive === false) throw new Error("This conversation is closed.");
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
