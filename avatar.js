import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";

// 100-200 decimal KB for selected file AND processed upload blob, browser side.
// This does not provide a server-side Cloudinary upload restriction.
export const AVATAR_MIN_BYTES = 10000;
export const AVATAR_MAX_BYTES = 200000;
export const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function initials(name) {
  return (name || "FL").trim().split(/\s+/).slice(0, 2)
    .map(part => part.slice(0, 1).toUpperCase()).join("") || "FL";
}
export function isAvatarUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
      /^\/[a-zA-Z0-9_-]+\/image\/upload\//.test(url.pathname) && value.length <= 700;
  } catch { return false; }
}
export function renderAvatar(element, url, label = "FL") {
  if (!element) return;
  element.replaceChildren();
  if (isAvatarUrl(url)) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.src = url;
    img.addEventListener("error", () => {
      element.replaceChildren(document.createTextNode(initials(label)));
      element.classList.remove("has-avatar-image");
    }, { once: true });
    element.append(img);
    element.classList.add("has-avatar-image");
  } else {
    element.classList.remove("has-avatar-image");
    element.textContent = initials(label);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const tmp = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(tmp); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(tmp); reject(new Error("That image could not be opened. Choose JPG, PNG, or WebP.")); };
    img.src = tmp;
  });
}
function toBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}
export async function optimizeAvatar(file, crop = null) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size < AVATAR_MIN_BYTES || file.size > AVATAR_MAX_BYTES) {
    throw new Error("Choose an original photo between 100 KB and 200 KB (100,000–200,000 bytes).");
  }
  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("Invalid image dimensions.");
  const side = Math.min(img.naturalWidth, img.naturalHeight) / Math.max(1, Math.min(4, Number(crop?.zoom) || 1));
  const centerX = Math.max(side / 2, Math.min(img.naturalWidth - side / 2, (Number(crop?.centerX) || 0.5) * img.naturalWidth));
  const centerY = Math.max(side / 2, Math.min(img.naturalHeight - side / 2, (Number(crop?.centerY) || 0.5) * img.naturalHeight));
  const choices = [];
  // Keep the center square. Try several resolutions/qualities to find an upload
  // between 100 KB and 200 KB, without padding fake bytes into the image.
  for (const dimension of [400, 600, 800, 1000]) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = dimension;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot process images.");
    ctx.drawImage(img, centerX - side / 2, centerY - side / 2,
      side, side, 0, 0, dimension, dimension);
    for (const mime of ["image/webp", "image/jpeg"]) {
      for (const quality of [0.96, 0.90, 0.82, 0.72, 0.60, 0.48]) {
        const blob = await toBlob(canvas, mime, quality);
        if (!blob || blob.type !== mime) continue;
        if (blob.size >= AVATAR_MIN_BYTES && blob.size <= AVATAR_MAX_BYTES) {
          choices.push(blob);
          // Choose a high quality valid output; no need to try larger canvases.
          return choices[0];
        }
      }
    }
  }
  throw new Error("This photo cannot be converted into a 100–200 KB square without losing too much detail. Try a different image.");
}

export async function uploadAvatar(blob) {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.includes("REPLACE_WITH_") ||
      !CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.includes("REPLACE_WITH_")) {
    throw new Error("Cloudinary isn't configured. Add your Cloud name and unsigned upload preset in js/cloudinary-config.js.");
  }
  if (!blob || blob.size < AVATAR_MIN_BYTES || blob.size > AVATAR_MAX_BYTES)
    throw new Error("Upload photo must be between 100 KB and 200 KB.");
  const formData = new FormData();
  formData.append("file", blob, blob.type === "image/webp" ? "freelanzo-avatar.webp" : "freelanzo-avatar.jpg");
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`, {
    method: "POST", body: formData
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Cloudinary upload failed (${response.status}).`);
  if (!isAvatarUrl(result.secure_url)) throw new Error("Cloudinary returned an invalid image URL.");
  if (result.bytes && (result.bytes < AVATAR_MIN_BYTES || result.bytes > AVATAR_MAX_BYTES))
    throw new Error("Cloudinary changed the uploaded photo outside the 100–200 KB range. Try another picture.");
  return result.secure_url;
}
