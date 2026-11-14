// Landing page category navigation: signed-in users see the matching directory;
// guests remain on the landing page with optional Login / Sign Up actions.
import { auth } from "./firebase.js";

const notice = document.getElementById("category-auth-notice");
const signupLink = document.getElementById("category-auth-signup");
const loginLink = document.getElementById("category-auth-login");
const closeNotice = document.getElementById("category-auth-close");
const noticeHeading = document.getElementById("category-auth-heading");
const categoryCards = [...document.querySelectorAll(".category-card")];
const validCategories = new Set(categoryCards.map(card => card.querySelector("h3")?.textContent?.trim()).filter(Boolean));
let navigating = false;

function categoryUrl(category, file) {
  const target = new URL(file, location.href);
  target.searchParams.set("category", category);
  if (file === "dashboard.html") target.searchParams.set("view", "explore");
  return target.href;
}

function showGuestNotice(category) {
  if (!validCategories.has(category)) return;
  // Use textContent, not innerHTML, to keep categories safe to display.
  noticeHeading.textContent = `Sign up or log in to see ${category} freelancers.`;
  signupLink.href = categoryUrl(category, "signup.html");
  loginLink.href = categoryUrl(category, "login.html");
  notice.hidden = false;
  notice.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  noticeHeading.focus({ preventScroll: true });
}

closeNotice?.addEventListener("click", () => { notice.hidden = true; });

categoryCards.forEach(card => {
  card.addEventListener("click", async event => {
    // Preserve browser shortcuts (open in new tab etc.). The dashboard router
    // sends unauthenticated category visitors back to this landing notice.
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (navigating) return;
    const category = card.querySelector("h3")?.textContent?.trim();
    if (!validCategories.has(category)) return;
    navigating = true;
    try {
      await auth.authStateReady();
      if (auth.currentUser) {
        location.assign(categoryUrl(category, "dashboard.html"));
        return;
      }
    } catch (error) {
      console.warn("Could not confirm FreeLanzo session.", error);
      // Never grant anonymous access when session verification fails.
    } finally {
      navigating = false;
    }
    showGuestNotice(category); // No forced redirect: guests choose what to do.
  });
});

// Handles opening an Explore category link in a new tab while signed out.
// The dashboard router safely returns that visitor to the landing page.
const incoming = new URLSearchParams(location.search);
const incomingCategory = incoming.get("category");
if (incoming.get("authNotice") === "1" && validCategories.has(incomingCategory)) {
  auth.authStateReady().then(() => {
    if (auth.currentUser) location.replace(categoryUrl(incomingCategory, "dashboard.html"));
    else showGuestNotice(incomingCategory);
  }).catch(() => showGuestNotice(incomingCategory));
}
