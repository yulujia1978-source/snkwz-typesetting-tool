(() => {
  "use strict";

  const favoritePrefix = "favorite:";
  const presetPrefix = "preset:";
  const templatePrefix = "template:";

  function templatePreview(template) {
    const frame = document.createElement("iframe");
    frame.title = template.name + "预览";
    frame.setAttribute("sandbox", "");
    frame.referrerPolicy = "no-referrer";
    frame.loading = "lazy";
    frame.tabIndex = -1;
    frame.srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https:; base-uri 'none'; form-action 'none'">
      <style>body{margin:12px;font:16px/1.65 system-ui,sans-serif;overflow-wrap:anywhere;}img,svg,table{max-width:100%;}img{height:auto;}</style>
      </head><body>${template.html}</body></html>`;
    return frame;
  }

  function mount({ root, insert, changeBackground, applyPreset, captureTemplate, message, button, preview }) {
    root.innerHTML = `
      <section class="oclaw-favorites" hidden aria-label="已收藏的样式"></section>
      <section class="oclaw-presets" hidden aria-label="栏目排版预设">
        <form class="oclaw-preset-form">
          <label>预设名称 <input name="name" required maxlength="60" placeholder="例如：每周推荐"></label>
          <div class="oclaw-preset-fields">
            <label>正文字号 <input name="fontSize" type="number" min="10" max="36" value="17" required> px</label>
            <label>正文行高 <input name="lineHeight" type="number" min="1" max="3" step="0.1" value="1.8" required> 倍</label>
            <label>段落间距 <input name="spacing" type="number" min="0" max="60" value="12" required> px</label>
            <label>正文小标题色 <input name="color" type="color" value="#3859a5"></label>
          </div>
          <label>文章背景 <select name="background"><option value="">沿用当前背景</option></select></label>
          <fieldset><legend>搭配素材</legend><div class="oclaw-preset-assets"></div></fieldset>
          <button type="submit">保存预设</button>
          <button type="reset">新建预设</button>
        </form>
        <div class="oclaw-preset-list"></div>
      </section>
      <section class="oclaw-templates" hidden aria-label="个人模板">
        <form class="oclaw-template-form">
          <label>模板名称 <input name="templateName" required maxlength="60" placeholder="例如：每周活动"></label>
          <button type="submit">保存当前正文为模板</button>
        </form>
        <div class="oclaw-template-preview" hidden></div>
        <div class="oclaw-template-grid"></div>
      </section>`;

    const favorites = root.querySelector(".oclaw-favorites");
    const presets = root.querySelector(".oclaw-presets");
    const form = presets.querySelector("form");
    const fields = form.elements;
    const assets = form.querySelector(".oclaw-preset-assets");
    const presetList = presets.querySelector(".oclaw-preset-list");
    const templates = root.querySelector(".oclaw-templates");
    const templateForm = templates.querySelector("form");
    const templateGrid = templates.querySelector(".oclaw-template-grid");
    const templateDetail = templates.querySelector(".oclaw-template-preview");
    const storage = globalThis.chrome?.storage;
    let entries = {};
    let ready = false;
    let loading;
    let editing = null;
    let editedAssets = [];
    const dirty = new Set([favoritePrefix, presetPrefix, templatePrefix]);
    const templateCards = new Map();
    const thumbnailData = new WeakMap();
    const thumbnailObserver = new IntersectionObserver((entries, observer) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting || !target.isConnected) continue;
        target.append(templatePreview(thumbnailData.get(target)));
        observer.unobserve(target);
      }
    });

    const byPrefix = (prefix) => Object.entries(entries)
      .filter(([key]) => key.startsWith(prefix))
      .reverse();

    async function save(key, value) {
      if (!ready && !await loading) {
        message("无法读取扩展收藏库，请重新加载扩展并刷新页面。", true);
        return false;
      }
      try {
        if (value) await storage.local.set({ [key]: value });
        else await storage.local.remove(key);
        message(value ? "已保存到当前浏览器。" : "已删除。");
        return true;
      } catch {
        message("保存失败，请检查扩展是否已重新加载。", true);
        return false;
      }
    }

    async function favorite(asset) {
      if (!ready) await loading;
      if (byPrefix(favoritePrefix).some(([, item]) =>
        item.name === asset.name && item.group === asset.group && item.html === asset.html && item.style === asset.style
      )) {
        message("这个素材已在「我的收藏」里。");
        return true;
      }
      const key = favoritePrefix + crypto.randomUUID();
      const saved = await save(key, asset);
      if (saved) message("已添加到「我的收藏」。");
      return saved;
    }

    function use(asset) {
      if (asset.group === "背景") changeBackground(asset.style);
      else insert(asset.html, asset);
    }

    function listEntry(title) {
      const item = document.createElement("div");
      item.className = "oclaw-library-item";
      const heading = document.createElement("strong");
      heading.textContent = title;
      item.append(heading);
      return item;
    }

    function chosenAssets() {
      return [...assets.querySelectorAll("input:checked")].map((input) => input.value);
    }

    function renderOptions(selected = chosenAssets(), background = fields.background.value) {
      const stored = new Map(byPrefix(favoritePrefix));
      const available = new Map([...editedAssets, ...stored]);
      fields.background.replaceChildren(new Option("沿用当前背景", ""));
      assets.replaceChildren();
      for (const [key, asset] of available) {
        if (asset.group === "背景") {
          fields.background.add(new Option(asset.name, key));
          continue;
        }
        const label = document.createElement("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.value = key;
        check.checked = selected.includes(key);
        label.append(check, " " + asset.group + " · " + asset.name);
        assets.append(label);
      }
      fields.background.value = available.has(background) ? background : "";
      if (!assets.childElementCount) assets.textContent = "先收藏正文、引导或分割样式。";
    }

    function edit(key, preset) {
      editing = key;
      editedAssets = [...preset.assets, ...(preset.background ? [preset.background] : [])]
        .map((asset) => [asset.key, asset]);
      for (const name of ["name", "fontSize", "lineHeight", "spacing", "color"]) fields[name].value = preset[name];
      renderOptions(preset.assets.map((asset) => asset.key), preset.background?.key || "");
      fields.name.focus();
    }

    function renderFavorites() {
      const favoriteItems = byPrefix(favoritePrefix).map(([key, asset]) => {
        const item = listEntry(asset.group + " · " + asset.name);
        const swatch = preview(asset);
        item.append(swatch, button(asset.group === "背景" ? "应用背景" : "插入正文", () => use(asset)));
        if (asset.html) item.append(button("复制素材", () => copyRichText(asset.html, "素材")));
        item.append(button("删除收藏", () => save(key, null)));
        return item;
      });
      favorites.replaceChildren(...favoriteItems);
      if (!favoriteItems.length) favorites.textContent = ready ? "还没有收藏。点击素材下方的收藏按钮即可添加。" : "正在读取本地收藏…";
    }

    function renderPresets() {
      const presetItems = byPrefix(presetPrefix).map(([key, preset]) => {
        const item = listEntry(preset.name);
        const details = document.createElement("p");
        details.textContent = `${preset.fontSize}px · 行高 ${preset.lineHeight} · 段距 ${preset.spacing}px`;
        item.append(details, button("应用排版", () => applyPreset(preset)), button("编辑", () => edit(key, preset)), button("删除预设", () => {
          if (editing === key) form.reset();
          save(key, null);
        }));
        for (const asset of preset.assets) {
          item.append(button("插入" + asset.name, () => use(asset)));
        }
        return item;
      });
      presetList.replaceChildren(...presetItems);
      if (!presetItems.length) presetList.textContent = ready ? "还没有保存栏目预设。" : "正在读取栏目预设…";
      renderOptions();
    }

    function renderVisibleLibrary() {
      if (!favorites.hidden && dirty.delete(favoritePrefix)) renderFavorites();
      if (!presets.hidden && dirty.delete(presetPrefix)) renderPresets();
      if (!templates.hidden && dirty.delete(templatePrefix)) renderTemplates();
    }

    function closePreview() {
      templateDetail.hidden = true;
      templateDetail.replaceChildren();
    }

    async function copyRichText(html, kind) {
      const fragment = document.createElement("template");
      fragment.innerHTML = html;
      const body = fragment.content;
      for (const image of body.querySelectorAll("img[alt]")) image.replaceWith(image.alt);
      for (const block of body.querySelectorAll("br,p,section,div,li,h1,h2,h3,h4,h5,h6,tr")) block.after("\n");
      const text = body.textContent.replace(/\n{3,}/g, "\n\n").trim();
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })]);
        message(kind + "已复制。点一下微信正文，再按 Ctrl+V 粘贴。");
      } catch {
        message("浏览器没有允许复制" + kind + "。请确认公众号编辑页是当前标签页，再点一次复制。", true);
      }
    }

    function makeTemplateCard(key, template) {
      const item = listEntry(template.name);
      const thumbnail = document.createElement("div");
      thumbnail.className = "oclaw-template-thumbnail";
      thumbnail.setAttribute("aria-hidden", "true");
      thumbnailData.set(thumbnail, template);
      thumbnailObserver.observe(thumbnail);
      item.prepend(thumbnail);
      item.append(button("预览", () => {
        templateDetail.replaceChildren(button("关闭预览", closePreview), templatePreview(template));
        templateDetail.hidden = false;
        templateDetail.scrollIntoView({ block: "nearest" });
        templateDetail.querySelector("button").focus();
      }), button("复制模板", () => copyRichText(template.html, "模板")), button("删除模板", () => {
        closePreview();
        save(key, null);
      }));
      return { item, thumbnail, template };
    }

    function renderTemplates() {
      const records = new Map(byPrefix(templatePrefix));
      for (const [key, card] of templateCards) {
        if (records.get(key) === card.template) continue;
        thumbnailObserver.unobserve(card.thumbnail);
        card.item.remove();
        templateCards.delete(key);
      }
      if (!records.size) {
        templateGrid.textContent = ready ? "还没有个人模板。" : "正在读取个人模板…";
        return;
      }
      if (!templateGrid.firstElementChild) templateGrid.textContent = "";
      let next = templateGrid.firstElementChild;
      for (const [key, template] of records) {
        let card = templateCards.get(key);
        if (!card) {
          card = makeTemplateCard(key, template);
          templateCards.set(key, card);
        }
        if (card.item === next) next = next.nextElementSibling;
        else templateGrid.insertBefore(card.item, next);
      }
    }

    templateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = templateForm.elements.templateName.value.trim();
      if (!name) return message("请输入模板名称。", true);
      const html = captureTemplate();
      if (html === null) return;
      const submit = templateForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      const saved = await save(templatePrefix + crypto.randomUUID(), { name, html });
      if (saved) templateForm.reset();
      submit.disabled = false;
    });

    form.addEventListener("reset", () => {
      editing = null;
      editedAssets = [];
      queueMicrotask(() => renderOptions([], ""));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name")).trim();
      if (!name) return message("请输入预设名称。", true);
      const available = new Map([...editedAssets, ...byPrefix(favoritePrefix)]);
      const snapshot = (key) => available.has(key) ? { ...available.get(key), key } : null;
      const key = editing || presetPrefix + crypto.randomUUID();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      const saved = await save(key, {
        name,
        fontSize: Number(data.get("fontSize")),
        lineHeight: Number(data.get("lineHeight")),
        spacing: Number(data.get("spacing")),
        color: data.get("color"),
        assets: chosenAssets().map(snapshot).filter(Boolean),
        background: snapshot(fields.background.value)
      });
      if (saved && !editing) form.reset();
      submit.disabled = false;
    });

    if (storage?.local) {
      storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        for (const [key, change] of Object.entries(changes)) {
          if (key.startsWith(templatePrefix)) dirty.add(templatePrefix);
          if (key.startsWith(favoritePrefix)) {
            dirty.add(favoritePrefix);
            dirty.add(presetPrefix);
          }
          if (key.startsWith(presetPrefix)) dirty.add(presetPrefix);
          if (change.newValue === undefined) delete entries[key];
          else entries[key] = change.newValue;
        }
        renderVisibleLibrary();
      });
      loading = storage.local.get(null).then((saved) => {
        entries = { ...saved, ...entries };
        ready = true;
        dirty.add(favoritePrefix);
        dirty.add(presetPrefix);
        dirty.add(templatePrefix);
        renderVisibleLibrary();
        return true;
      }).catch(() => {
        message("读取本地收藏失败。", true);
        return false;
      });
    }

    return {
      favorite,
      show(tab) {
        favorites.hidden = tab !== "我的收藏";
        presets.hidden = tab !== "栏目预设";
        templates.hidden = tab !== "个人模板";
        if (templates.hidden) closePreview();
        renderVisibleLibrary();
      }
    };
  }

  globalThis.WechatPersonalLibrary = { mount };
})();
