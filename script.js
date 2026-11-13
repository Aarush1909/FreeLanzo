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
  menuToggle.setAttribute("aria-label", opened ? "Close navigation menu" : "Open navigation menu");
});

navLinks.forEach(link => link.addEventListener("click", closeMenu));
window.addEventListener("resize", () => {
  if (window.innerWidth > 900) closeMenu();
});

document.addEventListener("click", event => {
  if (mainNav.classList.contains("is-open") && !event.target.closest(".site-header")) closeMenu();
});

function normalize(text) {
  return text.toLocaleLowerCase().trim();
}

function filterCategories(searchText) {
  const query = normalize(searchText);
  // Support a two-word search such as "app development" without extra tooling.
  const terms = query.split(/\s+/).filter(Boolean);
  let visibleCount = 0;

  categoryCards.forEach(card => {
    const searchable = normalize(card.dataset.category + " " + card.querySelector("h3").textContent);
    const visible = terms.every(term => searchable.includes(term));
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  noResults.hidden = visibleCount !== 0;
  categoryCount.textContent = query
    ? `Showing ${visibleCount} of ${categoryCards.length} categories`
    : `Showing all ${categoryCards.length} categories`;
}

categorySearch.addEventListener("input", () => filterCategories(categorySearch.value));
heroSearchForm.addEventListener("submit", event => {
  event.preventDefault();
  categorySearch.value = heroSearchInput.value;
  filterCategories(categorySearch.value);
  document.getElementById("categories").scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
});
clearSearch.addEventListener("click", () => {
  categorySearch.value = "";
  heroSearchInput.value = "";
  filterCategories("");
  categorySearch.focus();
});


document.getElementById("current-year").textContent = new Date().getFullYear();
