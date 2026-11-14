import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";

// Strict browser-side input and output cap: 500,000 bytes (500 decimal KB).
// Cloudinary UNSIGNED presets cannot enforce a per-preset file-size cap on the server.
export const AVATAR_MAX_BYTES = 500000;
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
export async function optimizeAvatar(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (!file.size) throw new Error("The image is empty.");
  if (file.size > AVATAR_MAX_BYTES) throw new Error("Choose a picture under 500 KB. Compress it first, then upload again.");
  const img = await loadImage(file);
  if (img.naturalWidth < 1 || img.naturalHeight < 1) throw new Error("Invalid image dimensions.");
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process the image.");
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  // Always take the centered square; conversion strips image metadata.
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 400, 400);
  for (const quality of [0.86, 0.76, 0.62, 0.48, 0.35]) {
    const blob = await toBlob(canvas, "image/webp", quality);
    if (blob && blob.type === "image/webp" && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  // Fallback: a small JPEG for browsers without WebP encoding support.
  for (const quality of [0.7, 0.5, 0.3]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("Couldn't fit this image under 500 KB. Try another picture.");
}

export async function uploadAvatar(blob) {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.includes("REPLACE_WITH_") ||
      !CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.includes("REPLACE_WITH_")) {
    throw new Error("Cloudinary isn't configured. Add your Cloud name and unsigned upload preset in js/cloudinary-config.js.");
  }
  if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error("Image exceeds 500 KB.");
  const formData = new FormData();
  formData.append("file", blob, blob.type === "image/webp" ? "freelanzo-avatar.webp" : "freelanzo-avatar.jpg");
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/image/upload`, {
    method: "POST", body: formData
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Cloudinary upload failed (${response.status}).`);
  if (!isAvatarUrl(result.secure_url)) throw new Error("Cloudinary returned an invalid image URL.");
  if (result.bytes && result.bytes > AVATAR_MAX_BYTES) throw new Error("The uploaded image exceeds 500 KB after processing.");
  return result.secure_url;
}
