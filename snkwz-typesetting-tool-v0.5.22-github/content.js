(() => {
  "use strict";

  const IDS = {
    button: "oclaw-html-source-button",
    floatWrap: "oclaw-html-source-float-wrap",
    modal: "oclaw-html-source-modal",
    textarea: "oclaw-html-source-textarea",
    msg: "oclaw-html-source-message",
    readBtn: "oclaw-html-source-read-btn",
    applyBtn: "oclaw-html-source-apply-btn",
    insertBtn: "oclaw-html-source-insert-btn",
    cancelBtn: "oclaw-html-source-cancel-btn",
    restoreBtn: "oclaw-html-source-restore-btn"
  };
  let backup = null;
  let returnFocus = null;
  let insertionPoint = null;
  const watchedDocuments = new WeakSet();
  const docked = Boolean(globalThis.WechatPersonalLayout);
  const toolName = "snkwz排版工具";
  const materialAttribute = "data-oclaw-layout-material";
  const colorAttribute = "data-oclaw-layout-color";
  const groupAttribute = "data-oclaw-layout-group";
  let adjustmentPanel;
  let selectedMaterial;
  let selectedImage;
  let imageEditPending = false;
  let observedEditor;
  let editorRevision = 0;
  let mountedEditor;
  let mountFrame = 0;
  const editorObserver = new MutationObserver(noteEditorChanges);

  function noteEditorChanges(records) {
    if (records.some(record => record.type !== "attributes" || record.target !== observedEditor)) {
      editorRevision++;
    }
  }

  function readEditorRevision(node) {
    if (observedEditor !== node) {
      editorObserver.disconnect();
      editorObserver.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
      observedEditor = node;
      editorRevision++;
    }
    noteEditorChanges(editorObserver.takeRecords());
    return editorRevision;
  }

  function rememberInsertionPoint() {
    const panel = document.getElementById(IDS.modal);
    if (docked ? panel?.contains(document.activeElement) : panel?.classList.contains("show")) return;
    if (document.activeElement?.id === IDS.button) return;
    const active = document.activeElement;
    const cachedDocument = mountedEditor?.ownerDocument;
    const usesMountedEditor = mountedEditor?.isConnected &&
      (mountedEditor.contains(active) || cachedDocument.defaultView?.frameElement === active);
    const editor = usesMountedEditor ? { node: mountedEditor, doc: cachedDocument } : findEditorTarget();
    const selection = editor?.doc.getSelection();
    if (!editor || !selection?.rangeCount ||
        (editor.doc === document && !editor.node.contains(document.activeElement)) ||
        (editor.doc !== document && document.activeElement !== editor.doc.defaultView.frameElement)) {
      insertionPoint = null;
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    if (!editor.node.contains(range.startContainer) || !editor.node.contains(range.endContainer)) {
      insertionPoint = null;
      return;
    }
    // Insert after a selection; never delete the selected article text.
    range.collapse(false);
    insertionPoint = { node: editor.node, range, anchor: range.startContainer,
      offset: range.startOffset, revision: readEditorRevision(editor.node), url: location.href };
  }

  function watchSelection(editor) {
    const doc = editor?.doc;
    if (doc && !watchedDocuments.has(doc)) {
      watchedDocuments.add(doc);
      doc.addEventListener("selectionchange", rememberInsertionPoint);
      if (docked) doc.addEventListener("click", selectMaterialAtClick, true);
    }
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" &&
      (!el.checkVisibility || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  }

  function firstVisible(selectors, root = document) {
    for (const selector of selectors) {
      const nodes = root.querySelectorAll(selector);
      for (const node of nodes) {
        if (isVisible(node)) {
          return node;
        }
      }
    }
    return null;
  }

  function findEditorTarget() {
    const candidates = new Set();
    const iframes = document.querySelectorAll(
      ".edui-editor-iframeholder iframe, iframe[id*='ueditor'], .js_editor_area iframe, .rich_media_editor iframe"
    );
    for (const iframe of iframes) {
      try {
        const body = iframe.contentDocument?.body;
        if (body?.isContentEditable && isVisible(iframe)) candidates.add(body);
      } catch (_err) {
        // Skip non-accessible iframe.
      }
    }

    document.querySelectorAll(
      ".rich_media_editor[contenteditable='true'], .js_editor_area[contenteditable='true'], .rich_media_editor [contenteditable='true'], .js_editor_area [contenteditable='true']"
    ).forEach((node) => {
      if (isVisible(node) && !node.parentElement.closest("[contenteditable='true']")) {
        candidates.add(node);
      }
    });
    if (candidates.size === 1) {
      const node = [...candidates][0];
      return { node, doc: node.ownerDocument };
    }
    return null;
  }

  function sanitizeHtml(rawHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    const warnings = new Set();
    const warn = (message) => warnings.add(message);
    if (doc.querySelector("style,link[rel~='stylesheet']")) {
      warn("已移除样式表；请先将 CSS 转为行内样式，否则排版可能丢失。");
    }

    doc
      .querySelectorAll(
        "script,iframe,object,embed,base,meta,link,style,foreignObject,template,form,input,textarea,button,select"
      )
      .forEach((el) => { el.remove(); warn("已移除脚本、嵌入页面、表单或文档级标签。"); });

    const safeUrl = (value) => {
      try {
        return ["http:", "https:", "mailto:", "tel:"].includes(new URL(value, "https://mp.weixin.qq.com/").protocol);
      } catch { return false; }
    };

    doc.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || name === "srcset" ||
            (["href", "xlink:href", "src", "action", "formaction", "poster", "background"].includes(name) && !safeUrl(attr.value))) {
          el.removeAttribute(attr.name);
          warn("已移除事件、危险链接或不支持的资源属性。");
        }
        if (name === "style" && (/\\|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(attr.value) ||
            [...attr.value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !safeUrl(match[2])))) {
          el.removeAttribute("style");
          warn("已移除含危险或无法可靠检查的资源引用的行内样式。");
        }
      }
      if (el.hasAttribute("attributeName") &&
          !/^(opacity|fill|fill-opacity|stroke|stroke-opacity|stroke-width|transform|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|viewBox|d|points|visibility)$/i.test(el.getAttribute("attributeName"))) {
        el.remove();
        warn("已移除可能修改链接或样式的 SVG 动画；保留常见视觉动画。");
      }
      if (el.localName === "img" && el.hasAttribute("src")) {
        const url = new URL(el.getAttribute("src"), "https://mp.weixin.qq.com/");
        if (!/(^|\.)(qpic\.cn|qlogo\.cn|weixin\.qq\.com)$/.test(url.hostname)) {
          warn("包含非微信图片地址；显示不代表已上传，请在微信中检查图片保存结果。");
        }
      }
      if (el.hasAttribute("style") && /display\s*:\s*(flex|grid)|position\s*:|animation\s*:|var\s*\(/i.test(el.getAttribute("style"))) {
        warn("包含复杂布局、动画或 CSS 变量；微信保存及手机端效果需要核对。");
      }
    });
    return { html: doc.body.innerHTML, warnings: [...warnings] };
  }

  function emitEditorEvents(target) {
    ["input", "change", "keyup", "blur"].forEach((evtName) => {
      const win = (target.ownerDocument || target).defaultView;
      target.dispatchEvent(new win.Event(evtName, { bubbles: true }));
    });
  }

  function setMessage(text, isError = false) {
    const msgNode = document.getElementById(IDS.msg);
    if (!msgNode) {
      return;
    }
    msgNode.textContent = text;
    msgNode.classList.toggle("error", Boolean(isError));
  }

  function readCurrentHtml() {
    const editor = findEditorTarget();
    if (!editor) {
      return null;
    }
    return editor.node.innerHTML;
  }

  function hasArticleContent(body) {
    return Boolean(body.textContent.trim() || body.querySelector("img[src],svg path,svg rect,svg circle,svg ellipse,svg polygon,svg polyline,svg line,svg image,video,audio,mp-common-mpaudio,mpvoice,mpvideo,mp-miniprogram"));
  }

  function captureTemplate() {
    const html = readCurrentHtml();
    if (html === null) {
      setMessage("无法唯一确定正文编辑区。", true);
      return null;
    }
    const clean = sanitizeHtml(html).html;
    const body = new DOMParser().parseFromString(clean, "text/html").body;
    if (!hasArticleContent(body)) {
      setMessage("当前正文为空，请先写入内容。", true);
      return null;
    }
    return clean;
  }

  function articleBackgrounds(node) {
    const attribute = "data-oclaw-personal-background";
    return [...node.children].filter((child) => child.hasAttribute(attribute));
  }

  function setBackground(node, style) {
    for (const section of articleBackgrounds(node)) section.replaceWith(...section.childNodes);
    if (!style) return;
    const section = node.ownerDocument.createElement("section");
    section.setAttribute("data-oclaw-personal-background", "");
    section.style.cssText = style + "padding:12px;";
    section.append(...node.childNodes);
    node.append(section);
  }

  function changeArticleLayout(editor, change) {
    backup = { node: editor.node, html: editor.node.innerHTML, url: location.href };
    document.getElementById(IDS.restoreBtn).disabled = false;
    change(editor.node);
    insertionPoint = null;
    emitEditorEvents(editor.node);
    if (editor.doc !== document) emitEditorEvents(editor.doc);
    setMessage("已更新正文排版。保存草稿后请重新打开，并检查手机预览。");
  }

  function selectMaterialAtClick(event) {
    const image = event.target.closest?.("img");
    if (!selectedMaterial && !selectedImage && !image && !event.target.closest?.(`[${materialAttribute}]`)) return;
    const editor = findEditorTarget();
    if (!editor?.node.contains(event.target)) return;
    selectImage(image);
    selectMaterial(event.target.closest?.(`[${materialAttribute}]`));
  }

  function selectImage(node) {
    selectedImage = node || null;
    const shadow = node?.style.boxShadow;
    const opacity = shadow?.match(/rgba\([^)]*,\s*([\d.]+)\)/);
    const gray = shadow?.match(/rgb\((\d+),\s*\1,\s*\1\)/);
    const level = opacity ? Math.round(Number(opacity[1]) * 200)
      : gray ? Math.max(1, Math.round((1 - Number(gray[1]) / 240) * 100))
      : shadow && shadow !== "none" ? 30 : 0;
    adjustmentPanel?.showImage?.(node && {
      radius: parseFloat(node.style.borderRadius) || 0,
      shadow: level
    });
  }

  function nativeImageFormat(image, radius, shadow) {
    const doc = image.ownerDocument;
    const id = crypto.getRandomValues(new Uint32Array(4)).join("-");
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish("failed"), 4000);
      function finish(result) {
        clearTimeout(timer);
        doc.removeEventListener("oclaw-image-format-result", receive);
        resolve(result);
      }
      function receive(event) {
        try {
          const response = JSON.parse(event.detail);
          if (response.id === id) finish(response.ok ? "applied" : "failed");
        } catch {
          // Ignore unrelated events.
        }
      }
      doc.addEventListener("oclaw-image-format-result", receive);
      const event = new doc.defaultView.CustomEvent("oclaw-image-format", {
        bubbles: true, cancelable: true, detail: JSON.stringify({ id, radius, shadow })
      });
      if (image.dispatchEvent(event)) finish("unavailable");
    });
  }

  async function adjustImage({ radius, shadow }) {
    const editor = findEditorTarget();
    const node = selectedImage;
    if (!node || !editor?.node.contains(node)) {
      return adjustmentPanel?.imageStatus("请先在正文中点选要调整的图片。", true);
    }
    if (!Number.isInteger(radius) || radius < 0 || radius > 200 ||
        !Number.isInteger(shadow) || shadow < 0 || shadow > 100) {
      return setMessage("圆角范围为 0–200 px，阴影范围为 0–100。", true);
    }
    if (imageEditPending) return adjustmentPanel?.imageStatus("正在等待微信处理图片。");
    imageEditPending = true;
    const before = { node: editor.node, html: editor.node.innerHTML, url: location.href };
    const imageIndex = [...editor.node.querySelectorAll("img")].indexOf(node);
    const source = node.getAttribute("src") || node.getAttribute("data-src");
    const outcome = await nativeImageFormat(node, radius, shadow);
    imageEditPending = false;
    if (location.href !== before.url || !editor.node.isConnected) return;
    let updated = node;
    const expectedRadius = `${radius}px`;
    if (outcome !== "unavailable") {
      if (outcome === "applied" || editor.node.innerHTML !== before.html) {
        backup = before;
        document.getElementById(IDS.restoreBtn).disabled = false;
        insertionPoint = null;
      }
      if (outcome === "failed") return adjustmentPanel?.imageStatus("微信未确认图片调整。请重新选中图片再试。", true);
      updated = editor.node.querySelectorAll("img")[imageIndex];
      if (updated && (updated.getAttribute("src") || updated.getAttribute("data-src")) !== source) updated = null;
      if (updated && selectedImage === node) selectImage(updated);
    } else {
      if (!editor.node.contains(node)) return;
      changeArticleLayout(editor, () => {
        node.style.setProperty("border-radius", expectedRadius, "important");
        node.style.setProperty("box-shadow", shadow
          ? `0 ${Math.ceil(shadow / 12)}px ${Math.ceil(shadow / 4)}px rgba(0, 0, 0, ${shadow / 200})`
          : "none", "important");
      });
    }
    const view = editor.doc.defaultView;
    view.requestAnimationFrame(() => {
      if (selectedImage !== (updated || node)) return;
      const visual = updated?.isConnected && view.getComputedStyle(updated);
      const radiusApplied = visual && visual.borderTopLeftRadius === expectedRadius;
      const shadowApplied = visual && (visual.boxShadow !== "none") === Boolean(shadow);
      adjustmentPanel?.imageStatus(radiusApplied && shadowApplied
        ? "圆角和阴影已应用，请保存草稿后检查预览。"
        : radiusApplied && !shadowApplied ? "圆角已应用，但微信没有保留阴影。"
        : "微信没有保留图片样式。请重新点选图片再试。", !radiusApplied || !shadowApplied);
    });
  }

  function selectMaterial(node) {
    selectedMaterial = node || null;
    adjustmentPanel?.show?.(node && {
      name: node.getAttribute(materialAttribute),
      color: node.getAttribute(colorAttribute),
      background: node.style.backgroundColor
    });
  }

  function adjustMaterial(action, value) {
    const editor = findEditorTarget();
    const node = selectedMaterial;
    if (!node || !editor?.node.contains(node)) {
      selectMaterial(null);
      return setMessage("请在正文中重新点选素材块。", true);
    }
    const name = node.getAttribute(materialAttribute);
    if (action === "favorite") {
      return adjustmentPanel?.favorite({
        name, group: node.getAttribute(groupAttribute) || "正文", html: sanitizeHtml(node.outerHTML).html,
        color: node.getAttribute(colorAttribute)
      });
    }
    if (action === "image") return adjustmentPanel?.image(node, name);
    const sibling = action === "up" ? node.previousElementSibling : node.nextElementSibling;
    if ((action === "up" || action === "down") && !sibling) {
      return setMessage("这一侧没有可交换的正文块。", true);
    }

    changeArticleLayout(editor, () => {
      switch (action) {
        case "color":
          recolorMaterial(node, value);
          break;
        case "background":
          node.style.backgroundColor = value || "transparent";
          break;
        case "margin": {
          const current = parseFloat(node.style.marginTop) || 0;
          const margin = value === 0 ? 0 : Math.max(0, Math.min(96, current + value));
          node.style.marginTop = node.style.marginBottom = `${margin}px`;
          break;
        }
        case "before":
        case "after": {
          const blank = editor.doc.createElement("p");
          blank.append(editor.doc.createElement("br"));
          node[action](blank);
          break;
        }
        case "up": sibling.before(node); break;
        case "down": sibling.after(node); break;
        case "duplicate": node.after(node.cloneNode(true)); break;
        case "delete": node.remove(); break;
        case "clear":
          node.querySelectorAll('[aria-hidden="true"]').forEach((decoration) => decoration.remove());
          for (const element of [node, ...node.querySelectorAll("[style]")]) element.removeAttribute("style");
          node.removeAttribute(materialAttribute);
          node.removeAttribute(colorAttribute);
          node.removeAttribute(groupAttribute);
          break;
      }
    });
    selectMaterial(["delete", "clear"].includes(action) ? null : node);
  }

  function recolorMaterial(node, next) {
    const previous = node.getAttribute(colorAttribute);
    const probe = node.ownerDocument.createElement("span").style;
    probe.color = previous || "";
    const base = probe.color;
    probe.color = previous ? previous + "15" : "";
    const pale = probe.color;
    const properties = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"];
    for (const element of [node, ...node.querySelectorAll("[style],[fill]")]) {
      for (const property of properties) {
        const current = element.style[property];
        if (current && current === base) element.style[property] = next;
        else if (current && current === pale) element.style[property] = next + "15";
      }
      if (previous && element.getAttribute("fill") === previous) element.setAttribute("fill", next);
    }
    if (!base) node.style.color = next;
    node.setAttribute(colorAttribute, next);
  }

  function changeArticleBackground(style) {
    const editor = findEditorTarget();
    if (!editor) return setMessage("无法唯一确定正文编辑区。", true);
    if (!style && !articleBackgrounds(editor.node).length) return setMessage("当前正文没有本工具添加的背景。", true);
    changeArticleLayout(editor, (node) => setBackground(node, style));
  }

  function applyArticlePreset(preset) {
    const editor = findEditorTarget();
    if (!editor) return setMessage("无法唯一确定正文编辑区。", true);
    const blocks = [...editor.node.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6")];
    if (!blocks.length && !preset.background) return setMessage("请先在正文写入段落或标题。", true);
    changeArticleLayout(editor, (node) => {
      for (const block of blocks) {
        if (block.matches("h1,h2,h3,h4,h5,h6")) {
          block.style.color = preset.color;
        } else {
          block.style.fontSize = `${preset.fontSize}px`;
          block.style.lineHeight = String(preset.lineHeight);
          block.style.marginBottom = `${preset.spacing}px`;
        }
      }
      if (preset.background) setBackground(node, preset.background.style);
    });
  }

  function applyHtmlToEditor(rawHtml, insert = false, material = null) {
    const editor = findEditorTarget();
    if (!editor) {
      setMessage("无法唯一确定正文编辑区，请进入图文编辑页并只保留一个正文编辑区。未修改内容。", true);
      return false;
    }

    const point = insertionPoint;
    if (insert && (!point || point.node !== editor.node || point.url !== location.href ||
        !point.anchor.isConnected || !editor.node.contains(point.anchor) ||
        point.revision !== readEditorRevision(editor.node) || point.range.startContainer !== point.anchor ||
        point.range.startOffset !== point.offset)) {
      const guidance = docked
        ? "请在正文里点一下要插入的位置，再点素材。收藏的素材也可以点「复制素材」，再回正文按 Ctrl+V。"
        : "请关闭弹窗，在正文里点一下要插入的位置，再打开 HTML 源码。";
      setMessage("插入位置已失效或尚未定位。" + guidance, true);
      return false;
    }

    const result = sanitizeHtml(rawHtml || "");
    const parsed = new DOMParser().parseFromString(result.html, "text/html");
    if (!hasArticleContent(parsed.body)) {
      setMessage("没有可导入的内容，已阻止清空正文。", true);
      return false;
    }
    const warnings = result.warnings.join("\n");
    backup = { node: editor.node, html: editor.node.innerHTML, url: location.href };
    document.getElementById(IDS.restoreBtn).disabled = false;
    if (insert) {
      const range = point.range.cloneRange();
      const elementToMark = material && parsed.body.firstElementChild;
      if (elementToMark) {
        elementToMark.setAttribute(materialAttribute, material.name);
        if (material.color) elementToMark.setAttribute(colorAttribute, material.color);
        if (material.group) elementToMark.setAttribute(groupAttribute, material.group);
      }
      const fragment = range.createContextualFragment(elementToMark ? parsed.body.innerHTML : result.html);
      const insertedMaterial = elementToMark && fragment.firstElementChild;
      const last = fragment.lastChild;
      const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      let paragraph = element.closest("p,h1,h2,h3,h4,h5,h6,pre");
      if (!paragraph) {
        let inline = element;
        while (inline !== editor.node && inline.matches("span,a,b,strong,i,em,u,s,del,code,sub,sup")) {
          paragraph = inline;
          inline = inline.parentElement;
        }
      }
      const blockContent = parsed.body.querySelector("svg,p,section,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,pre,hr");
      if (blockContent && paragraph && paragraph !== editor.node && editor.node.contains(paragraph)) {
        // Split the enclosing paragraph so SVG/blocks are not nested inside it.
        const tail = editor.doc.createRange();
        tail.selectNodeContents(paragraph);
        tail.setStart(range.startContainer, range.startOffset);
        const following = paragraph.cloneNode(false);
        following.removeAttribute("id");
        following.appendChild(tail.extractContents());
        paragraph.after(fragment, following);
      } else {
        range.insertNode(fragment);
      }
      if (!docked) closeModal(false);
      editor.node.focus();
      range.setStartAfter(last);
      range.collapse(true);
      const selection = editor.doc.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      if (insertedMaterial) selectMaterial(insertedMaterial);
    } else {
      editor.node.innerHTML = result.html;
      selectMaterial(null);
      selectImage(null);
    }
    insertionPoint = null;
    emitEditorEvents(editor.node);
    if (editor.doc !== document) emitEditorEvents(editor.doc);

    if (docked && insert) rememberInsertionPoint();
    setMessage("已写入正文，尚未验证微信保存结果。请保存草稿后重新打开，并检查手机预览。" + (warnings ? "\n" + warnings : ""));
    return true;
  }

  function restoreHtml() {
    const editor = findEditorTarget();
    if (!backup || !editor || editor.node !== backup.node || !backup.node.isConnected || backup.url !== location.href) {
      setMessage("备份不属于当前正文，无法恢复。请返回导入时的文章。", true);
      return;
    }
    editor.node.innerHTML = backup.html;
    selectMaterial(null);
    selectImage(null);
    insertionPoint = null;
    emitEditorEvents(editor.node);
    if (editor.doc !== document) emitEditorEvents(editor.doc);
    backup = null;
    document.getElementById(IDS.restoreBtn).disabled = true;
    setMessage("已恢复本次导入前的正文。请检查并保存草稿。");
  }

  function closeModal(restoreFocus = true) {
    const modal = document.getElementById(IDS.modal);
    if (modal) {
      modal.classList.remove("show");
      updateDockSwitch(modal, false);
      if (restoreFocus && docked) modal.querySelector(".oclaw-dock-switch")?.focus();
      else if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
    }
  }

  function updateDockSwitch(panel, open) {
    if (!docked) return;
    panel.querySelector(".oclaw-dock-switch").setAttribute("aria-checked", String(open));
    document.getElementById(IDS.button)?.setAttribute("aria-expanded", String(open));
  }

  function toggleDock() {
    if (document.getElementById(IDS.modal).classList.contains("show")) closeModal();
    else openModal();
  }

  function openModal() {
    ensureModal();
    const modal = document.getElementById(IDS.modal);
    const textarea = document.getElementById(IDS.textarea);
    if (!modal || !textarea) {
      return;
    }

    returnFocus = document.activeElement;
    modal.classList.add("show");
    updateDockSwitch(modal, true);
    if (docked) {
      adjustmentPanel?.open();
      setMessage("在正文点选位置，再点击素材预览。");
      return;
    }
    setMessage(insertionPoint ? "已记住正文位置。粘贴 HTML / SVG 后可插入；选中文字会保留。替换全文需另点对应按钮。" : "先在正文点选位置，再打开此窗口，即可插入 HTML / SVG。也可选择替换全文。不会自动保存或发布。");
    if (textarea.offsetWidth) textarea.focus();
    else modal.querySelector(".oclaw-layout-toggle")?.focus();
  }

  function ensureModal() {
    if (document.getElementById(IDS.modal)) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = IDS.modal;
    wrapper.className = docked ? "oclaw-dock" : "oclaw-modal";
    const version = globalThis.chrome?.runtime?.getManifest?.().version;
    wrapper.innerHTML = `
      ${docked ? `<div class="oclaw-dock-header">
        <span>${toolName}</span>
        <span class="oclaw-dock-version" hidden></span>
        <button type="button" class="oclaw-dock-switch" role="switch" aria-label="显示排版面板" aria-checked="false" aria-controls="${IDS.modal}-panel"></button>
      </div>` : ""}
      <div id="${IDS.modal}-panel" class="oclaw-panel" ${docked ? 'role="region"' : 'role="dialog" aria-modal="true"'} aria-label="HTML 源码导入">
        <div class="oclaw-title">HTML 源码导入</div>
        <textarea id="${IDS.textarea}" aria-label="待导入的 HTML 源码" placeholder="在这里粘贴 HTML 源码..."></textarea>
        <div id="${IDS.msg}" class="oclaw-msg" role="status" aria-live="polite"></div>
        <div class="oclaw-footer">
          ${docked ? "" : '<a class="oclaw-site-link" href="https://dreamger.com" target="_blank" rel="noopener noreferrer">dreamger.com</a>'}
          <div class="oclaw-actions">
          <button id="${IDS.readBtn}" type="button">读取当前 HTML</button>
          <button id="${IDS.restoreBtn}" type="button" disabled>恢复操作前正文</button>
          <button id="${IDS.cancelBtn}" type="button">${docked ? "收起" : "取消"}</button>
          <button id="${IDS.applyBtn}" type="button">替换全文</button>
          <button id="${IDS.insertBtn}" type="button" class="primary">插入到光标位置</button>
          </div>
        </div>
      </div>
    `;

    if (docked && version) {
      const label = wrapper.querySelector(".oclaw-dock-version");
      label.textContent = "v" + version;
      label.hidden = false;
    }
    if (docked && globalThis.chrome?.runtime?.getURL) {
      const logo = document.createElement("img");
      logo.className = "oclaw-dock-logo";
      logo.alt = "";
      logo.width = logo.height = 22;
      logo.src = chrome.runtime.getURL("icons/icon-32.png");
      wrapper.querySelector(".oclaw-dock-header").prepend(logo);
    }

    wrapper.addEventListener("click", (event) => {
      if (event.target === wrapper) {
        closeModal();
      }
    });

    document.body.appendChild(wrapper);
    wrapper.querySelector(".oclaw-dock-switch")?.addEventListener("click", toggleDock);
    if (docked) {
      wrapper.addEventListener("pointerdown", rememberInsertionPoint, true);
      wrapper.addEventListener("focusin", (event) => {
        const editor = findEditorTarget();
        const previous = event.relatedTarget;
        const cameFromEditor = editor && previous instanceof Node &&
          (editor.node.contains(previous) || previous === editor.doc.defaultView.frameElement);
        if (previous && !cameFromEditor && !wrapper.contains(previous) && previous.id !== IDS.button) {
          insertionPoint = null;
        }
      });
    }

    adjustmentPanel = globalThis.WechatPersonalLayout?.mount({
      toolName,
      panel: wrapper.querySelector(".oclaw-panel"),
      textarea: document.getElementById(IDS.textarea),
      insert: (html, material) => applyHtmlToEditor(html, true, material),
      changeBackground: changeArticleBackground,
      applyPreset: applyArticlePreset,
      adjustMaterial,
      adjustImage,
      captureTemplate,
      message: setMessage
    });

    const readBtn = document.getElementById(IDS.readBtn);
    const cancelBtn = document.getElementById(IDS.cancelBtn);
    const applyBtn = document.getElementById(IDS.applyBtn);
    const textarea = document.getElementById(IDS.textarea);
    textarea.addEventListener("input", () => {
      const warnings = sanitizeHtml(textarea.value).warnings;
      setMessage(warnings.length ? warnings.join("\n") : "插入会保留原文。替换全文和恢复正文会覆盖当前正文。");
    });
    document.getElementById(IDS.restoreBtn).addEventListener("click", restoreHtml);
    document.getElementById(IDS.insertBtn).addEventListener("click", () => applyHtmlToEditor(textarea.value, true));

    if (readBtn && textarea) {
      readBtn.addEventListener("click", () => {
        const html = readCurrentHtml();
        if (html == null) {
          setMessage("未读取到正文内容，请确认当前页面是图文编辑器。", true);
          return;
        }
        textarea.value = html;
        setMessage("已读取当前编辑区 HTML。");
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", closeModal);
    }

    if (applyBtn && textarea) {
      applyBtn.addEventListener("click", () => {
        applyHtmlToEditor(textarea.value);
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && (!docked || (wrapper.classList.contains("show") && wrapper.contains(document.activeElement)))) {
        closeModal();
      }
      if (!docked && event.key === "Tab" && wrapper.classList.contains("show")) {
        const controls = [...wrapper.querySelectorAll("a,button,textarea,input,select")].filter((node) => !node.disabled && node.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }

  function findToolbar() {
    return firstVisible([
      ".edui-toolbar",
      ".rich_media_tools",
      ".js_tool_bar",
      ".tool_bar",
      ".frm_editor_wrapper .toolbar"
    ]);
  }

  function createButton() {
    const btn = document.createElement("button");
    btn.id = IDS.button;
    btn.className = "oclaw-html-btn";
    btn.type = "button";
    btn.textContent = docked ? toolName : "HTML 源码";
    btn.title = "打开排版素材与 HTML 源码工具";
    btn.addEventListener("pointerdown", (event) => {
      rememberInsertionPoint();
      event.preventDefault();
    });
    if (docked) {
      btn.setAttribute("aria-controls", IDS.modal + "-panel");
      btn.setAttribute("aria-expanded", String(document.getElementById(IDS.modal).classList.contains("show")));
    }
    btn.addEventListener("click", docked ? toggleDock : openModal);
    return btn;
  }

  function mountButton() {
    const editor = findEditorTarget();
    mountedEditor = editor?.node;
    watchSelection(editor);
    const toolbar = findToolbar();
    if (docked) document.getElementById(IDS.modal).hidden = !editor && !toolbar;
    const existing = document.getElementById(IDS.button);
    if (existing && (!toolbar || existing.parentElement === toolbar)) return;
    const btn = existing || createButton();

    if (toolbar) {
      toolbar.appendChild(btn);
      const floatWrap = document.getElementById(IDS.floatWrap);
      if (floatWrap) {
        floatWrap.remove();
      }
      return;
    }

    let floatWrap = document.getElementById(IDS.floatWrap);
    if (!floatWrap) {
      floatWrap = document.createElement("div");
      floatWrap.id = IDS.floatWrap;
      floatWrap.className = "oclaw-float-wrap";
      document.body.appendChild(floatWrap);
    }
    floatWrap.appendChild(btn);
  }

  function scheduleMount() {
    if (mountFrame) return;
    mountFrame = requestAnimationFrame(() => {
      mountFrame = 0;
      mountButton();
    });
  }

  function boot() {
    ensureModal();
    mountButton();
    document.addEventListener("selectionchange", rememberInsertionPoint);
    document.addEventListener("load", (event) => {
      if (event.target.tagName === "IFRAME" && !event.target.closest(".oclaw-dock")) scheduleMount();
    }, true);

    const observer = new MutationObserver((records) => {
      const panel = document.getElementById(IDS.modal);
      if (records.some(({ target, addedNodes, removedNodes }) =>
        !panel?.contains(target) && !mountedEditor?.contains(target) &&
        [...addedNodes, ...removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
      )) scheduleMount();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
