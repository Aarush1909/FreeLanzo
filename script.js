
"use strict";

// FreeLanzo: landing-page navigation and category search.
// Authentication now lives in login.html / signup.html.

const menuToggle = document.getElementById("menu-toggle");
const mainNav = document.getElementById("main-nav");
const navLinks = document.querySelectorAll(".site-nav a[href^='#']");
const categorySearch = document.getElementById("category-search-input");
const heroSearchForm = document.getElementById("hero-search-form");
const heroSearchInput = document.getElementById("hero-search-input");
const categoryCards = Array.from(document.querySelectorAll(".category-card"));
const noResults = document.getElementById("no-results");
const categoryCount = document.getElementById("category-count");
const clearSearch = document.getElementById("clear-search");

function closeMenu() {
  mainNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation menu");
}

menuToggle.addEventListener("click", () => {
  const opened = mainNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(opened));
  menuToggle.setAttribute(
    "aria-label",
    opened ? "Close navigation menu" : "Open navigation menu"
  );
});

navLinks.forEach(link => link.addEventListener("click", closeMenu));

window.addEventListener("resize", () => {
  if (window.innerWidth > 900) closeMenu();
});

document.addEventListener("click", event => {
  if (
    mainNav.classList.contains("is-open") &&
    !event.target.closest(".site-header")
  ) {
    closeMenu();
  }
});

function normalize(text) {
  return text.toLocaleLowerCase().trim();
}

function filterCategories(searchText) {
  const query = normalize(searchText);
  const terms = query.split(/\s+/).filter(Boolean);
  let visibleCount = 0;

  categoryCards.forEach(card => {
    const searchable = normalize(
      card.dataset.category + " " +
      card.querySelector("h3").textContent
    );

    const visible = terms.every(term => searchable.includes(term));
    card.hidden = !visible;

    if (visible) visibleCount += 1;
  });

  noResults.hidden = visibleCount !== 0;

  categoryCount.textContent = query
    ? `Showing ${visibleCount} of ${categoryCards.length} categories`
    : `Showing all ${categoryCards.length} categories`;
}

categorySearch.addEventListener("input", () => {
  filterCategories(categorySearch.value);
});

heroSearchForm.addEventListener("submit", event => {
  event.preventDefault();

  categorySearch.value = heroSearchInput.value;
  filterCategories(categorySearch.value);

  document.getElementById("categories").scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start"
  });
});

clearSearch.addEventListener("click", () => {
  categorySearch.value = "";
  heroSearchInput.value = "";
  filterCategories("");
  categorySearch.focus();
});

document.getElementById("current-year").textContent =
  new Date().getFullYear();


// =======================================
// PHASE 3.2: CATEGORY NAVIGATION
// =======================================

const categoryNotice =
  document.getElementById("category-auth-notice");

const categoryNoticeHeading =
  document.getElementById("category-auth-heading");

const categoryNoticeLogin =
  document.getElementById("category-auth-login");

const categoryNoticeSignup =
  document.getElementById("category-auth-signup");

const categoryNoticeClose =
  document.getElementById("category-auth-close");

const allowedCategoryNames = new Set(
  categoryCards
    .map(card => card.querySelector("h3")?.textContent.trim())
    .filter(Boolean)
);

const categoryAuthState = {
  ready: false,
  signedIn: false,
  pending: null
};

function categoryLink(filename, category) {
  const url = new URL(filename, location.href);

  url.searchParams.set("category", category);

  if (filename === "dashboard.html") {
    url.searchParams.set("view", "explore");
  }

  return url.href;
}

function showCategoryLoginNotice(category) {
  if (!allowedCategoryNames.has(category)) return;

  categoryNoticeHeading.textContent =
    `Sign up or log in to see ${category} freelancers.`;

  categoryNoticeLogin.href =
    categoryLink("login.html", category);

  categoryNoticeSignup.href =
    categoryLink("signup.html", category);

  categoryNotice.hidden = false;

  categoryNotice.scrollIntoView({
    behavior: window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches ? "auto" : "smooth",
    block: "nearest"
  });

  categoryNoticeHeading.focus({
    preventScroll: true
  });
}

function navigateToCategory(category) {
  if (!allowedCategoryNames.has(category)) return;

  window.location.assign(
    categoryLink("dashboard.html", category)
  );
}

// Firebase reports the authentication state.
window.addEventListener(
  "freelanzo:category-auth-state",
  event => {
    categoryAuthState.ready = true;

    categoryAuthState.signedIn =
      event.detail?.signedIn === true;

    if (
      categoryAuthState.signedIn &&
      categoryAuthState.pending
    ) {
      navigateToCategory(categoryAuthState.pending);
    }
  }
);

// Handle category card clicks.
categoryCards.forEach(card => {
  card.addEventListener("click", event => {

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();

    const category =
      card.querySelector("h3")?.textContent.trim();

    if (!allowedCategoryNames.has(category)) return;

    categoryAuthState.pending = category;

    if (categoryAuthState.signedIn) {
      navigateToCategory(category);
    } else {
      showCategoryLoginNotice(category);
    }
  });
});

// Close the login/signup notification.
categoryNoticeClose?.addEventListener("click", () => {
  categoryAuthState.pending = null;
  categoryNotice.hidden = true;
});

// Handle category links opened in new tabs.
const requestedCategoryParams =
  new URLSearchParams(location.search);

const requestedCategory =
  requestedCategoryParams.get("category");

if (
  requestedCategoryParams.get("authNotice") === "1" &&
  allowedCategoryNames.has(requestedCategory)
) {
  categoryAuthState.pending = requestedCategory;

  showCategoryLoginNotice(requestedCategory);
}
