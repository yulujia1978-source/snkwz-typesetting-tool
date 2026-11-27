(() => {
  "use strict";

  document.addEventListener("oclaw-image-format", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const editor = image.closest(".ProseMirror[contenteditable='true']");
    if (!editor) return;
    const api = typeof __MP_Editor_JSAPI__ === "undefined" ? null : __MP_Editor_JSAPI__;
    if (typeof api?.invoke !== "function") return;

    let options;
    try {
      options = JSON.parse(event.detail);
    } catch {
      return;
    }
    const { id, radius, shadow } = options || {};
    if (typeof id !== "string" || !Number.isInteger(radius) || radius < 0 || radius > 200 ||
        !Number.isInteger(shadow) || shadow < 0 || shadow > 100) return;
    event.preventDefault();

    const wrapper = image.closest("section[nodeleaf]");
    const existing = wrapper && editor.contains(wrapper) && wrapper.querySelectorAll("img").length === 1 ? wrapper : null;
    const target = existing || image;
    const replacement = existing ? existing.cloneNode(true) : document.createElement("section");
    const copy = existing ? replacement.querySelector("img") : image.cloneNode(true);
    if (!existing) {
      replacement.setAttribute("nodeleaf", "");
      replacement.append(copy);
    }
    if (shadow) {
      const holder = copy.parentElement;
      if (!parseFloat(holder.style.paddingTop)) {
        holder.style.padding = "0.5em";
        holder.style.boxSizing = "border-box";
      }
      if (holder.tagName === "SPAN" && !holder.style.display) holder.style.display = "inline-block";
      holder.style.overflow = "visible";
    }
    copy.style.setProperty("border-radius", `${radius}px`, "important");
    const gray = Math.round(240 * (1 - shadow / 100));
    copy.style.boxShadow = shadow ? `0 0 0.5em 0 rgb(${gray}, ${gray}, ${gray})` : "none";

    const report = (ok) => document.dispatchEvent(new CustomEvent("oclaw-image-format-result", {
      detail: JSON.stringify({ id, ok })
    }));
    try {
      editor.focus({ preventScroll: true });
      api.invoke({
        apiName: "mp_editor_set_selection",
        apiParam: { container: target, selectCurrent: true },
        sucCb() {
          if (!target.isConnected) return report(false);
          try {
            api.invoke({
              apiName: "mp_editor_insert_html",
              apiParam: { html: replacement.outerHTML, isSelect: false },
              sucCb: () => report(true),
              errCb: () => report(false)
            });
          } catch {
            report(false);
          }
        },
        errCb: () => report(false)
      });
    } catch {
      report(false);
    }
  }, true);
})();
