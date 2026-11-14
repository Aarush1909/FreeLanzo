
import {
  GoogleAuthProvider, browserLocalPersistence, browserSessionPersistence,
  createUserWithEmailAndPassword, deleteUser, getAdditionalUserInfo, onAuthStateChanged,
  sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword,
  signInWithPopup, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  doc, getDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const page = document.body.dataset.page;
const messageBox = document.getElementById("form-message");
const TERMS_VERSION = "2026-11-14";
const accountRoles = new Set(["freelancer", "client"]);
let busy = false;

function displayMessage(message, kind = "error") {
  if (!messageBox) return;
  messageBox.textContent = message;
  messageBox.className = `form-message ${kind}`;
  messageBox.hidden = false;
}

function clearMessage() {
  if (messageBox) messageBox.hidden = true;
}

function showLoading(button, loading) {
  if (!button) return;
  if (!button.dataset.defaultHtml) {
    button.dataset.defaultHtml = button.innerHTML;
  }
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  button.innerHTML = loading
    ? (button.dataset.loadingText || "Working…")
    : button.dataset.defaultHtml;
}

async function runAction(button, action) {
  if (busy) return;
  busy = true;
  clearMessage();
  showLoading(button, true);
  try {
    await action();
  } catch (error) {
    displayMessage(humanError(error));
  } finally {
    busy = false;
    showLoading(button, false);
  }
}

function humanError(error) {
  if (error?.userMessage) return error.userMessage;

  const messages = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "We couldn’t log you in. Check your email and password, or try Google sign-in.",
    "auth/wrong-password": "We couldn’t log you in. Check your email and password.",
    "auth/user-not-found": "We couldn’t log you in. Check your email and password.",
    "auth/email-already-in-use": "This email already has an account. Use the Log in page instead.",
    "auth/account-exists-with-different-credential": "An account already uses this email with another sign-in method. Log in using that method.",
    "auth/weak-password": "Please choose a stronger password.",
    "auth/operation-not-allowed": "This sign-in method is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase. Add it in Authentication → Settings → Authorized domains.",
    "auth/popup-blocked": "Your browser blocked Google's sign-in window. Allow pop-ups for this site and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled. You can try again.",
    "auth/cancelled-popup-request": "Another sign-in window was opened. Please try again.",
    "auth/network-request-failed": "Network issue. Check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please try again later or reset your password.",
    "permission-denied": "Firebase Firestore access was denied. Publish the supplied firestore.rules in Firebase Console before testing.",
    "unavailable": "Firebase is unavailable right now. Please try again."
  };

  return messages[error?.code] ||
    "Something went wrong. Please try again. If it continues, check Firebase setup and the browser console.";
}

function clientError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

function selectedRole() {
  const input = document.querySelector(
    'input[name="accountType"]:checked'
  );

  if (!input || !accountRoles.has(input.value)) {
    document.querySelector(
      '.role-fieldset input[type="radio"]'
    )?.focus();
    throw clientError("Choose Freelancer or Client to continue.");
  }

  return input.value;
}

function acceptedTerms() {
  const checkbox = document.querySelector('input[name="terms"]');

  if (checkbox && !checkbox.checked) {
    checkbox.focus();
    throw clientError(
      "Please agree to the Terms & Conditions and Privacy Notice to continue."
    );
  }
}

function formValid(form) {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  return true;
}

function cleanEmail(value) {
  return value.trim().toLowerCase();
}

// Preserve category selection through login/signup.
const CATEGORY_OPTIONS = new Set([
  "Web Development",
  "Graphic Design",
  "Mobile App Development",
  "Digital Marketing",
  "Video Editing",
  "Writing & Translation",
  "Data Science & Analytics",
  "AI & Machine Learning",
  "UI/UX Design",
  "Photography",
  "Cybersecurity",
  "3D Design & Animation",
  "Virtual Assistance",
  "Business & Consulting",
  "Education & Tutoring"
]);

const requestedCategory =
  new URLSearchParams(location.search).get("category");

const validRequestedCategory =
  CATEGORY_OPTIONS.has(requestedCategory)
    ? requestedCategory
    : "";

if (validRequestedCategory) {
  const switchLink = document.querySelector(
    '.switch-copy a[href^="login.html"], .switch-copy a[href^="signup.html"]'
  );

  if (switchLink) {
    const target = new URL(switchLink.href);
    target.searchParams.set("category", validRequestedCategory);
    switchLink.href = target.href;
  }
}

function redirectToDashboard() {
  const target = new URL("dashboard.html", location.href);

  if (validRequestedCategory) {
    target.searchParams.set("view", "explore");
    target.searchParams.set("category", validRequestedCategory);
  }

  window.location.assign(target.href);
}

// Create user profile in Firestore.
async function createAccountDocument(
  user,
  role,
  preferredName = "",
  provider = "password"
) {
  const ref = doc(db, "users", user.uid);
  const prior = await getDoc(ref);

  if (prior.exists()) {
    return {
      exists: true,
      profile: prior.data()
    };
  }

  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: (
      preferredName ||
      user.displayName ||
      "Member"
    ).trim().slice(0, 80),
    role,
    provider,
    photoURL: user.photoURL || "",
    createdAt: serverTimestamp(),
    termsAcceptedAt: serverTimestamp(),
    termsVersion: TERMS_VERSION
  };

  await setDoc(ref, profile);

  return {
    exists: false,
    profile
  };
}

async function readAccountDocument(user) {
  const snapshot = await getDoc(
    doc(db, "users", user.uid)
  );

  return snapshot.exists() ? snapshot.data() : null;
}

// Verify account and selected role during login.
async function verifyAccountRole(
  user,
  requestedRole,
  { discardNewGoogleLogin = false } = {}
) {
  let profile;

  try {
    profile = await readAccountDocument(user);
  } catch (error) {
    await signOut(auth);
    throw error;
  }

  if (!profile) {
    // Google login can create a Firebase Auth identity.
    // Delete it only when this popup created it.
    if (discardNewGoogleLogin) {
      try {
        await deleteUser(user);
      } catch (error) {
        console.warn(
          "Could not remove an unregistered Google login; signing out instead.",
          error
        );
        await signOut(auth);
      }
    } else {
      await signOut(auth);
    }

    throw clientError(
      "No FreeLanzo account was found for this sign-in. Please use Sign up to create an account."
    );
  }

  if (profile.role !== requestedRole) {
    await signOut(auth);

    throw clientError(
      `This account is registered as ${
        profile.role === "client"
          ? "Client"
          : "Freelancer"
      }. Select the correct account type and try again.`
    );
  }

  redirectToDashboard();
}

// EMAIL LOGIN
async function loginWithEmail(form) {
  const role = selectedRole();
  acceptedTerms();

  if (!formValid(form)) return;

  const email = cleanEmail(
    form.querySelector('[name="email"]').value
  );

  const password =
    form.querySelector('[name="login-password"]').value;

  const remembered =
    document.getElementById("remember-me").checked;

  await setPersistence(
    auth,
    remembered
      ? browserLocalPersistence
      : browserSessionPersistence
  );

  const credentials = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  await verifyAccountRole(credentials.user, role);
}

// GOOGLE LOGIN
async function loginWithGoogle() {
  const role = selectedRole();
  acceptedTerms();

  await setPersistence(
    auth,
    document.getElementById("remember-me").checked
      ? browserLocalPersistence
      : browserSessionPersistence
  );

  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account"
  });

  const credentials = await signInWithPopup(auth, provider);

  const isNewAuthUser =
    getAdditionalUserInfo(credentials)?.isNewUser === true;

  await verifyAccountRole(credentials.user, role, {
    discardNewGoogleLogin: isNewAuthUser
  });
}

// EMAIL SIGNUP
async function signupWithEmail(form) {
  const role = selectedRole();
  acceptedTerms();

  if (!formValid(form)) return;

  const name =
    form.querySelector('[name="displayName"]').value.trim();

  const email = cleanEmail(
    form.querySelector('[name="email"]').value
  );

  const password =
    document.getElementById("signup-password").value;

  const confirmation =
    document.getElementById("signup-confirm").value;

  if (name.length < 2) {
    throw clientError(
      "Please enter your full name (at least 2 characters)."
    );
  }

  if (password.length < 8) {
    throw clientError(
      "Your password must contain at least 8 characters."
    );
  }

  if (password !== confirmation) {
    throw clientError("The two passwords don't match.");
  }

  await setPersistence(auth, browserLocalPersistence);

  const credentials = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  let saved = false;

  try {
    const result = await createAccountDocument(
      credentials.user,
      role,
      name,
      "password"
    );

    saved = true;

    if (result.exists) {
      throw clientError(
        "This account is already registered. Please log in."
      );
    }

    try {
      await updateProfile(credentials.user, {
        displayName: name
      });
    } catch (error) {
      console.warn(
        "Firebase display name could not be updated; Firestore profile exists.",
        error
      );
    }

    redirectToDashboard();
  } catch (error) {
    if (!saved) {
      try {
        await deleteUser(credentials.user);
      } catch {
        await signOut(auth);
      }
    }

    throw error;
  }
}

// GOOGLE SIGNUP — FIXED
async function signupWithGoogle() {
  const role = selectedRole();
  acceptedTerms();

  await setPersistence(auth, browserLocalPersistence);

  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account"
  });

  const credentials = await signInWithPopup(auth, provider);

  try {
    const result = await createAccountDocument(
      credentials.user,
      role,
      "",
      "google.com"
    );

    // Reject existing FreeLanzo accounts,
    // even when their registered role matches.
    if (result.exists) {
      throw clientError(
        `This Google account is already registered as ${
          result.profile.role === "client"
            ? "Client"
            : "Freelancer"
        }. Please use Log in instead.`
      );
    }

    // Only newly registered profiles proceed.
    redirectToDashboard();

  } catch (error) {
    // Sign out when signup fails.
    // Existing Firestore profiles are never deleted.
    if (auth.currentUser) {
      await signOut(auth);
    }

    throw error;
  }
}

// PASSWORD RESET
async function resetPassword(form) {
  if (!formValid(form)) return;

  const email = cleanEmail(
    form.querySelector('[name="email"]').value
  );

  await sendPasswordResetEmail(auth, email);

  displayMessage(
    "If this address is eligible for password reset, a link will arrive in its inbox. Also check spam.",
    "success"
  );

  form.reset();
}

// Password visibility toggles.
document.querySelectorAll(".toggle-password").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(
      button.dataset.passwordTarget
    );

    const shown = input.type !== "password";

    input.type = shown ? "password" : "text";

    button.setAttribute("aria-pressed", String(!shown));

    button.setAttribute(
      "aria-label",
      `${shown ? "Show" : "Hide"} ${
        input.id.includes("confirm")
          ? "confirmation password"
          : "password"
      }`
    );

    button.querySelector(".toggle-label").textContent =
      shown ? "Show" : "Hide";
  });
});

// Form submission.
document.querySelectorAll("form[data-action]").forEach(form => {
  form.addEventListener("submit", event => {
    event.preventDefault();

    const submit = form.querySelector('[type="submit"]');

    runAction(
      submit,
      () => ({
        "email-login": loginWithEmail,
        "email-signup": signupWithEmail,
        "reset-password": resetPassword
      })[form.dataset.action](form)
    );
  });
});

// Google button events.
document.querySelectorAll(
  'button[data-action^="google-"]'
).forEach(button => {
  button.addEventListener("click", () => {
    runAction(
      button,
      button.dataset.action === "google-login"
        ? loginWithGoogle
        : signupWithGoogle
    );
  });
});

// Dashboard account verification.
if (page === "dashboard") {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.replace("login.html");
      return;
    }

    try {
      const profile = await readAccountDocument(user);

      if (!profile) {
        displayMessage(
          "This account is missing its FreeLanzo profile. Please contact the project team."
        );
        return;
      }

      document.getElementById("account-name").textContent =
        profile.displayName ||
        user.displayName ||
        "FreeLanzo member";

      document.getElementById("account-email").textContent =
        user.email ||
        profile.email ||
        "";

      document.getElementById("account-role").textContent =
        profile.role === "client"
          ? "Client account"
          : "Freelancer account";

      document.getElementById("account-avatar").textContent =
        (profile.displayName || "FL")
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map(s => s[0].toUpperCase())
          .join("");

    } catch (error) {
      displayMessage(humanError(error));
    }
  });

  document.getElementById("sign-out")
    .addEventListener("click", event => {
      runAction(event.currentTarget, async () => {
        await signOut(auth);
        window.location.replace("login.html");
      });
    });
}
