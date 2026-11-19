// FreeLanzo category navigation. This is the ONLY click handler for category cards.
// Wait for Firebase to restore the auth session before deciding whether to
// open Explore or display the guest login/signup notice.
import { auth } from "./firebase.js";

const notice = document.getElementById("category-auth-notice");
const heading = document.getElementById("category-auth-heading");
const loginLink = document.getElementById("category-auth-login");
const signupLink = document.getElementById("category-auth-signup");
const closeNotice = document.getElementById("category-auth-close");
const cards = Array.from(document.querySelectorAll(".category-card"));

// Use stable URLs, not the translated text of the h3, as category identifiers.
function categoryOf(card) {
  return new URL(card.href, location.href).searchParams.get("category") || "";
}
const categories = new Set(cards.map(categoryOf).filter(Boolean));
let navigating = false;

function destination(filename, category) {
  const url = new URL(filename, location.href);
  url.searchParams.set("category", category);
  if (filename === "dashboard.html") url.searchParams.set("view", "explore");
  return url.href;
}

function showGuestNotice(category) {
  if (!categories.has(category) || !notice || !heading) return;
  heading.textContent = `Sign up or log in to see ${category} freelancers.`;
  if (loginLink) loginLink.href = destination("login.html", category);
  if (signupLink) signupLink.href = destination("signup.html", category);
  notice.hidden = false;
  notice.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "nearest"
  });
  heading.focus({ preventScroll: true });
}

closeNotice?.addEventListener("click", () => { notice.hidden = true; });

async function openCategory(category, replace = false) {
  if (!categories.has(category) || navigating) return;
  navigating = true;
  try {
    await auth.authStateReady();
    if (auth.currentUser) {
      const url = destination("dashboard.html", category);
      if (replace) location.replace(url);
      else location.assign(url);
      return;
    }
  } catch (error) {
    console.warn("FreeLanzo couldn't confirm the signed-in session.", error);
  } finally {
    navigating = false;
  }
  showGuestNotice(category);
}

cards.forEach(card => {
  card.addEventListener("click", event => {
    // Keep browser shortcuts like Ctrl/Command-click and Open in new tab.
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void openCategory(categoryOf(card));
  });
});

// Handles category links opened in new tabs from the regular href fallback.
const params = new URLSearchParams(location.search);
const incomingCategory = params.get("category");
if (params.get("authNotice") === "1" && categories.has(incomingCategory)) {
  void openCategory(incomingCategory, true);
}
