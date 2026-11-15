// Image crop UI: square image, draggable repositioning, zoom and keyboard arrows.
// Does not upload anything; caller uses optimizeAvatar() after confirmation.
export function selectAvatarCrop(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Invalid photo dimensions."));
        return;
      }
      const dlg = document.createElement("dialog");
      dlg.className = "avatar-crop-dialog";
      dlg.setAttribute("aria-labelledby", "avatar-crop-title");
      dlg.innerHTML = `
        <div class="avatar-crop-heading">
          <div><span class="eyebrow-text">PROFILE PHOTO</span><h2 id="avatar-crop-title">Crop your photo</h2></div>
          <button type="button" class="avatar-crop-close" aria-label="Cancel photo crop">✕</button>
        </div>
        <p class="avatar-crop-help">Drag to position your photo inside the circle. Use the zoom slider for the perfect fit. You can also use the arrow keys on the preview.</p>
        <div class="avatar-crop-stage"><canvas width="360" height="360" tabindex="0" aria-label="Photo crop preview. Use arrow keys to reposition the photo"></canvas><div class="avatar-crop-ring" aria-hidden="true"></div></div>
        <label class="avatar-crop-zoom-label" for="avatar-crop-zoom">Zoom <output>1.0×</output></label>
        <input id="avatar-crop-zoom" class="avatar-crop-zoom" type="range" min="1" max="4" step="0.05" value="1"/>
        <p class="avatar-crop-error" role="alert" hidden></p>
        <div class="avatar-crop-actions"><button type="button" class="btn btn-outline avatar-crop-cancel">Cancel</button><button type="button" class="btn btn-primary avatar-crop-apply">Use this crop</button></div>`;
      document.body.append(dlg);
      const canvas = dlg.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      const zoomInput = dlg.querySelector(".avatar-crop-zoom");
      const zoomOutput = dlg.querySelector("output");
      const apply = dlg.querySelector(".avatar-crop-apply");
      const errorBox = dlg.querySelector(".avatar-crop-error");
      let zoom = 1, cx = 0.5, cy = 0.5, dragging = null, finished = false;
      const originalSide = Math.min(image.naturalWidth, image.naturalHeight);
      function clamp() {
        const halfX = (originalSide / zoom) / (image.naturalWidth * 2);
        const halfY = (originalSide / zoom) / (image.naturalHeight * 2);
        cx = Math.max(halfX, Math.min(1 - halfX, cx));
        cy = Math.max(halfY, Math.min(1 - halfY, cy));
      }
      function draw() {
        clamp();
        const side = originalSide / zoom;
        ctx.clearRect(0, 0, 360, 360);
        ctx.drawImage(image, cx * image.naturalWidth - side / 2,
          cy * image.naturalHeight - side / 2, side, side, 0, 0, 360, 360);
      }
      function end(value) {
        if (finished) return;
        finished = true;
        dlg.close();
        dlg.remove();
        URL.revokeObjectURL(objectUrl);
        resolve(value);
      }
      zoomInput.addEventListener("input", () => {
        zoom = Number(zoomInput.value);
        zoomOutput.textContent = `${zoom.toFixed(1)}×`;
        draw();
      });
      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        dragging = { x: event.clientX, y: event.clientY, cx, cy };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", event => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        const side = originalSide / zoom;
        cx = dragging.cx - ((event.clientX - dragging.x) / rect.width) * side / image.naturalWidth;
        cy = dragging.cy - ((event.clientY - dragging.y) / rect.height) * side / image.naturalHeight;
        draw();
      });
      function stopDrag() { dragging = null; }
      canvas.addEventListener("pointerup", stopDrag);
      canvas.addEventListener("pointercancel", stopDrag);
      canvas.addEventListener("lostpointercapture", stopDrag);
      canvas.addEventListener("keydown", event => {
        const diff = (originalSide / zoom) / 360 * (event.shiftKey ? 20 : 6);
        if (event.key === "ArrowLeft") cx -= diff / image.naturalWidth;
        else if (event.key === "ArrowRight") cx += diff / image.naturalWidth;
        else if (event.key === "ArrowUp") cy -= diff / image.naturalHeight;
        else if (event.key === "ArrowDown") cy += diff / image.naturalHeight;
        else return;
        event.preventDefault(); draw();
      });
      dlg.querySelector(".avatar-crop-close").addEventListener("click", () => end(null));
      dlg.querySelector(".avatar-crop-cancel").addEventListener("click", () => end(null));
      dlg.addEventListener("cancel", event => { event.preventDefault(); end(null); });
      apply.addEventListener("click", () => {
        errorBox.hidden = true;
        end({ centerX: cx, centerY: cy, zoom });
      });
      draw();
      try { dlg.showModal(); }
      catch (err) { dlg.remove(); URL.revokeObjectURL(objectUrl); reject(err); }
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not open that image.")); };
    image.src = objectUrl;
  });
}
