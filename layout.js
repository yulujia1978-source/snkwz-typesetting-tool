(() => {
  "use strict";

  const groups = {
    正文: {
      边框: ["简洁描边", "双线边框", "双色角标框", "彩色加号框", "折角信笺", "双角线框", "票券虚线框", "圆点便签", "斜线角标框", "星标细框", "格纹手记"], 底色: ["淡色正文", "重点提示"],
      "轴线/总结": ["左轴摘要", "双栏总结"], 竖排: ["竖排短句"],
      引用: ["引号摘录", "左线引用", "双引号细框", "双线语录", "圆章引号", "上下引号框", "书签摘录", "短轴引用"], 对话: ["提示气泡"], 表格: ["双列表格"],
      动态: ["呼吸圆点"], 其他: ["段落卡片"], 序号列表: ["编号步骤"]
    },
    引导: {
      顶部关注: ["关注公众号", "关注提示条"], 二维码: ["扫码关注"],
      在看: ["点亮在看"], 阅读原文: ["阅读原文提示", "延伸阅读"],
      往期推荐: ["往期推荐列表", "往期推荐卡片"], 其他: ["留言互动"]
    },
    分割: {
      end: ["细线 END", "徽标 END"], 线条: ["细实线", "虚线"], 黑白: ["黑白双线"],
      彩色: ["彩色圆点", "渐变线"], 文艺: ["枝叶分隔"], 可爱: ["星星分隔"],
      饰物: ["菱形分隔"], 动态: ["闪动分隔"], "自定义 GIF": ["GIF 图片分割线"], 其他: ["章节分隔"]
    }
  };

  const patterns = {
    纯色: "none",
    方格: "linear-gradient(90deg,#7772 1px,transparent 1px),linear-gradient(#7772 1px,transparent 1px)",
    横纹: "linear-gradient(#7772 1px,transparent 1px)",
    圆点: "radial-gradient(#7774 1px,transparent 2px)",
    斜纹: "repeating-linear-gradient(135deg,transparent 0 9px,#7772 9px 10px)",
    柔光: "radial-gradient(ellipse at top,#fff,transparent 75%)"
  };
  const colors = ["#faf7f0", "#fdf0f5", "#f1f6ff", "#edf8f4", "#f4f2fa", "#303344"];
  const builtInGifs = [
    ["彩虹流光", "rainbow.gif", "5/5c/Animated_rainbow_rule.gif"],
    ["彩虹逆流", "rainbow-reverse.gif", "c/c4/Animated_rainbow_rule_fast_reverse.gif"],
    ["跳动圆点", "dots.gif", "3/3f/Loading-dots.gif"],
    ["跳动方块", "three-boxes.gif", "9/9d/Loading-3-box.gif"]
  ];

  function escape(text) {
    return text.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function httpsUrl(text) {
    try {
      const url = new URL(text.trim());
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function gifDividerHtml(url, label) {
    const image = url
      ? `<img src="${escape(url)}" alt="${escape(label)}" style="display:inline-block;max-width:100%;height:auto;vertical-align:middle;">`
      : "填写 GIF 图片地址后预览";
    return `<section style="margin:12px 0;text-align:center;">${image}</section>`;
  }

  function frameDecoration(mark, color, align = "left", size = 16) {
    return `<section aria-hidden="true" style="text-align:${align};font-size:${size}px;line-height:1.1;font-weight:bold;color:${color};">${mark}</section>`;
  }

  const decoratedFrames = {
    折角信笺: { top: "◢", bottom: "◤", style: (color, pale) => `border:1px solid ${color};background-color:${pale};` },
    双角线框: { top: "┏", bottom: "┛", style: (color) => `border-top:1px solid ${color};border-bottom:1px solid ${color};` },
    票券虚线框: { top: "✂", align: "right", style: (color) => `border:1px dashed ${color};border-radius:10px;` },
    圆点便签: { top: "●  ●  ●", style: (color, pale) => `border:1px solid ${color};border-radius:12px;background-color:${pale};` },
    斜线角标框: { top: "╱╱╱", bottom: "╱╱", style: (color) => `border:1px solid ${color};border-bottom-width:3px;` },
    星标细框: { top: "✦  ⋆  ✦", align: "center", style: (color) => `border:1px solid ${color};border-radius:4px;` },
    格纹手记: { top: "▦", style: (color, pale) => `border:1px solid ${color};border-left-width:4px;background-color:${pale};` },
    双线语录: { top: "❝", align: "center", style: (color) => `border-top:3px double ${color};border-bottom:3px double ${color};` },
    圆章引号: { top: "❞", align: "center", badge: true, style: (color, pale) => `border:1px solid ${color};border-radius:14px;background-color:${pale};` },
    上下引号框: { top: "“", bottom: "”", align: "center", style: (color) => `border-top:2px solid ${color};border-bottom:2px solid ${color};` },
    书签摘录: { top: "▾", align: "right", badge: true, style: (color, pale) => `border-left:3px solid ${color};background-color:${pale};` },
    短轴引用: { top: "━━", style: (color, pale) => `border-left:1px solid ${color};border-radius:0 8px 8px 0;background-color:${pale};` }
  };

  function sample(tab, category, name, color, text, link) {
    const copy = escape(text.trim());
    const pale = color + "15";
    const box = (body, style = "") => `<section style="margin:16px 0;padding:14px 16px;line-height:1.8;overflow-wrap:anywhere;${style}">${body}</section>`;
    const title = (body) => `<strong style="color:${color}">${body}</strong>`;
    const line = (body, style) => `<p style="margin:4px 0;border-bottom:1px ${style} ${color};text-align:center;">${body}</p>`;
    const pulse = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="14" viewBox="0 0 26 14"><circle cx="13" cy="7" r="4" fill="${color}"><animate attributeName="opacity" values="1;0.25;1" dur="1.4s" repeatCount="indefinite"></animate></circle></svg>`;

    if (tab === "分割") {
      if (name === "GIF 图片分割线") {
        return gifDividerHtml(link, text.trim() || "动态分割线");
      }
      const marks = { 彩色: "●  ●  ●", 文艺: "❧  ✦  ❧", 可爱: "☆  ★  ☆", 饰物: "◇  ◆  ◇", 其他: "·  ·  ·" };
      if (category === "线条") return box(line("&#8203;", name === "虚线" ? "dashed" : "solid"));
      if (category === "黑白") return box('<p style="border-bottom:3px double #242424">&#8203;</p>');
      if (name === "渐变线") return box(`<p style="height:3px;background-image:linear-gradient(90deg,transparent,${color},transparent)">&#8203;</p>`);
      const mark = category === "动态" ? pulse : title(copy || (category === "end" ? "E N D" : marks[category]));
      const style = name === "徽标 END" ? `background-color:${pale};border-radius:20px;` : `border-bottom:1px solid ${color};`;
      return box(mark, `text-align:center;font-size:13px;letter-spacing:2px;${style}`);
    }

    if (tab === "引导") {
      const defaults = { 顶部关注: "点击上方公众号名称，关注我们", 二维码: "长按识别二维码，关注公众号", 在看: "喜欢这篇文章？点一下右下角的「在看」", 阅读原文: "点击左下角「阅读原文」查看更多", 往期推荐: "往期推荐", 其他: "欢迎在评论区留言" };
      const caption = copy || defaults[category];
      let body = title(caption);
      if (category === "二维码" && link) body = `<p><img src="${escape(link)}" alt="公众号二维码" style="width:145px;max-width:100%"></p>${body}`;
      if (category === "阅读原文" && link) body = `<a href="${escape(link)}">${body}</a>`;
      if (category === "往期推荐") {
        const items = copy ? text.trim().split(/\r?\n/).map(escape).filter(Boolean) : ["第一篇推荐文章", "第二篇推荐文章"];
        body = title("往期推荐") + items.map((item, index) => `<p>${index + 1}. ${item}</p>`).join("");
        if (link) body += `<p><a href="${escape(link)}">查看文章</a></p>`;
      }
      const compact = name === "关注提示条" || name === "往期推荐列表";
      return box(body, `text-align:${category === "往期推荐" ? "left" : "center"};background-color:${pale};border-${compact ? "bottom" : "left"}:3px solid ${color};`);
    }

    const lines = copy ? text.trim().split(/\r?\n/).map(escape).filter(Boolean) : ["在这里输入你的正文内容。"];
    const body = lines.map((item) => `<p style="margin:0 0 5px">${item}</p>`).join("");
    const frame = decoratedFrames[name];
    if (frame) {
      const mark = frame.badge
        ? `<span style="display:inline-block;padding:5px 9px;border-radius:20px;background-color:${color};color:#fff;">${frame.top}</span>`
        : frame.top;
      const lead = frameDecoration(mark, color, frame.align);
      const tail = frame.bottom ? frameDecoration(frame.bottom, color, frame.align || "right") : "";
      const content = category === "引用"
        ? `<blockquote style="margin:8px 0;">${body}</blockquote>`
        : `<section style="margin:8px 0;">${body}</section>`;
      return box(lead + content + tail, frame.style(color, pale));
    }
    if (name === "双引号细框") {
      return box(
        frameDecoration("“", color, "left", 26) + `<blockquote style="margin:4px 0;">${body}</blockquote>` +
        frameDecoration("”", color, "right", 26),
        `border:1px solid ${color};`
      );
    }
    if (name === "双色角标框") {
      const warm = '<span style="color:#d78d36;">▮</span>';
      return box(
        frameDecoration("▮" + warm, color) + `<section style="padding:8px 0;">${body}</section>` +
        frameDecoration(warm + "▮", color, "right"),
        `border:1px solid ${color};border-top-width:2px;`
      );
    }
    if (name === "彩色加号框") {
      const marks = `+ <span style="color:#d16d4e;">+</span> <span style="color:#358579;">+</span>`;
      return box(
        frameDecoration(marks, color) + `<section style="padding-top:10px;">${body}</section>`,
        `border:1px solid ${color};border-radius:8px;background-color:${pale};`
      );
    }
    if (category === "表格") {
      const rows = copy ? lines : ["项目 | 说明", "示例 | 填写内容"];
      return `<table style="width:100%;border-collapse:collapse"><tbody>${rows.map((row, index) => {
        const [label, ...values] = row.split("|");
        const cell = (value) => `<td style="border:1px solid ${color};padding:8px;${index === 0 ? `background-color:${pale};font-weight:bold;` : ""}">${value}</td>`;
        return `<tr>${cell(label)}${cell(values.join("|"))}</tr>`;
      }).join("")}</tbody></table>`;
    }
    if (category === "序号列表") return box(`<ol>${lines.map((item) => `<li>${item}</li>`).join("")}</ol>`, `background-color:${pale}`);
    if (category === "引用") return box((name === "引号摘录" ? title("❝") : "") + `<blockquote style="margin:4px 0">${body}</blockquote>`, `border-left:3px solid ${color};background-color:${pale}`);
    if (category === "竖排") return box(body, `writing-mode:vertical-rl;border-right:2px solid ${color}`);
    const styles = {
      边框: `border:${name === "双线边框" ? "3px double" : "1px solid"} ${color}`,
      底色: `background-color:${pale};${name === "重点提示" ? "font-weight:bold;" : ""}`,
      "轴线/总结": `border-left:3px solid ${color};${name === "双栏总结" ? "column-count:2;" : ""}`,
      对话: `background-color:${pale};border-radius:14px 14px 14px 2px`,
      动态: `background-color:${pale}`,
      其他: `border-top:2px solid ${color};background-color:${pale}`
    };
    return box((category === "动态" ? pulse : "") + body, styles[category]);
  }

  function backgroundStyle(color, image) {
    return `background-color:${color};background-image:${image};background-size:18px 18px;`;
  }

  function mount({ toolName, panel, textarea, insert, changeBackground, applyPreset, adjustMaterial, adjustImage, favoriteImage, captureTemplate, message }) {
    const layout = document.createElement("section");
    layout.className = "oclaw-layout";
    layout.innerHTML = `
      <nav class="oclaw-layout-tabs" aria-label="素材分类"></nav>
      <div class="oclaw-layout-filters"></div>
      <div class="oclaw-layout-fields">
        <input type="search" aria-label="搜索样式" placeholder="搜索样式">
        <label>配色 <input type="color" value="#3859a5"></label>
      </div>
      <textarea class="oclaw-layout-copy" aria-label="素材文字" placeholder="输入素材文字（可选）"></textarea>
      <input class="oclaw-layout-url" type="url" aria-label="素材链接">
      <div class="oclaw-layout-gallery"></div>
      <div class="oclaw-layout-background" hidden>
        <label>背景颜色 <input type="color" value="#faf7f0"></label>
        <input type="url" aria-label="背景图片地址" placeholder="HTTPS 背景图片地址（可选）">
        <button type="button">应用自定义背景</button>
        <button type="button">清除背景</button>
        <button type="button" data-save-background hidden>收藏自定义背景</button>
      </div>
      <div class="oclaw-library"></div>
      <p class="oclaw-layout-hint"></p>`;
    const title = panel.querySelector(".oclaw-title");
    panel.setAttribute("aria-label", toolName);
    title.textContent = toolName;
    const sourceActions = panel.querySelector(".oclaw-actions");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "oclaw-layout-toggle";
    title.append(" ", toggle);
    textarea.before(layout);

    const tabs = layout.querySelector("nav");
    const filters = layout.querySelector(".oclaw-layout-filters");
    const fields = layout.querySelector(".oclaw-layout-fields");
    const search = fields.querySelector("input[type=search]");
    const color = fields.querySelector("input[type=color]");
    const copy = layout.querySelector("textarea");
    const url = layout.querySelector(".oclaw-layout-url");
    const gallery = layout.querySelector(".oclaw-layout-gallery");
    const background = layout.querySelector(".oclaw-layout-background");
    const backgroundColor = background.querySelector("input[type=color]");
    const backgroundUrl = background.querySelector("input[type=url]");
    const hint = layout.querySelector(".oclaw-layout-hint");
    let tab = "正文";
    let filter = "全部";
    let galleryStarted = false;
    let galleryTimer = 0;
    let galleryTab;
    let galleryCards = [];

    function button(label, handler, selected) {
      const element = document.createElement("button");
      element.type = "button";
      if (selected !== undefined) element.setAttribute("aria-pressed", String(selected));
      element.textContent = label;
      element.addEventListener("click", handler);
      return element;
    }

    function preview(asset) {
      const element = document.createElement("span");
      element.className = "oclaw-layout-preview";
      element.inert = true;
      if (asset.style) {
        element.classList.add("oclaw-library-swatch");
        element.style.cssText = asset.style;
      } else {
        element.innerHTML = asset.html;
      }
      return element;
    }

    const library = globalThis.WechatPersonalLibrary?.mount({
      root: layout.querySelector(".oclaw-library"), insert, changeBackground, applyPreset, captureTemplate, message, button, preview
    });
    const adjustment = globalThis.WechatPersonalAdjustment?.mount({ panel, adjustMaterial, adjustImage, favoriteImage, message });
    const libraryTabs = library ? ["我的收藏", "栏目预设", "个人模板"] : [];

    function wrapCard(card, name, getAsset) {
      if (!library) return card;
      const item = document.createElement("div");
      item.className = "oclaw-asset-card";
      const save = button("收藏", async () => {
        const asset = getAsset();
        if (!asset) return;
        save.disabled = true;
        const saved = await library.favorite(asset);
        save.disabled = false;
        save.textContent = saved ? "已收藏" : "收藏失败";
      });
      item.addEventListener("focusout", () => { save.textContent = "收藏"; });
      save.setAttribute("aria-label", "收藏" + name);
      item.append(card, save);
      return item;
    }

    async function downloadGif(url, file) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("GIF unavailable");
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = file;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      } catch {
        message("下载 GIF 失败，请重新加载扩展后再试。", true);
      }
    }

    function buildGifCards() {
      return builtInGifs.map(([name, file, source]) => {
        const url = "https://upload.wikimedia.org/wikipedia/commons/" + source;
        const local = globalThis.chrome?.runtime?.getURL?.("assets/gif-dividers/" + file) || url;
        const asset = { name, group: "分割", html: gifDividerHtml(url, name) };
        const card = button(name, () => insert(asset.html, asset));
        card.setAttribute("aria-label", name);
        card.prepend(preview({ html: gifDividerHtml(local, name) }));
        const item = wrapCard(card, name, () => asset);
        const download = button("下载 GIF", () => downloadGif(local, file));
        download.setAttribute("aria-label", "下载 GIF · " + name);
        const container = document.createElement("div");
        container.className = "oclaw-gif-card";
        container.append(item, download);
        return { element: container, category: "动态", searchable: ("动态 gif " + name).toLowerCase() };
      });
    }

    function customBackground() {
      const address = httpsUrl(backgroundUrl.value);
      if (backgroundUrl.value.trim() && !address) {
        message("请输入有效的 HTTPS 图片地址。", true);
        return null;
      }
      const image = address ? `url("${address.replace(/["\\\n\r\f]/g, (char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))}")` : "none";
      return `background-color:${backgroundColor.value};background-image:${image};background-size:cover;background-position:center;`;
    }
    const [applyCustom, clear, saveCustom] = background.querySelectorAll("button");
    applyCustom.addEventListener("click", () => {
      const style = customBackground();
      if (style) changeBackground(style);
    });
    clear.addEventListener("click", () => changeBackground(""));
    if (library) {
      saveCustom.hidden = false;
      saveCustom.addEventListener("click", () => {
        const style = customBackground();
        if (style) library.favorite({ name: "自定义背景 " + backgroundColor.value, group: "背景", style });
      });
    }

    function buildGalleryCards(group) {
      if (group === "背景") {
        const cards = [];
        for (const [pattern, image] of Object.entries(patterns)) {
          for (const shade of colors) {
            const style = backgroundStyle(shade, image);
            const name = `${pattern} ${shade}`;
            const card = button(name, () => changeBackground(style));
            card.className = "oclaw-background-card";
            card.style.cssText = style;
            cards.push({ element: wrapCard(card, name, () => ({ name, group, style })) });
          }
        }
        return cards;
      }
      const cards = Object.entries(groups[group]).flatMap(([category, names]) =>
        names.map((name) => {
          const gifDivider = name === "GIF 图片分割线";
          const usesLink = gifDivider || (group === "引导" && ["二维码", "阅读原文", "往期推荐"].includes(category));
          const currentAsset = ({ shade, text, link }) => ({
            name, group, color: shade,
            html: sample(group, category, name, shade, text, usesLink ? link : "")
          });
          const getAsset = () => {
            const settings = gallerySettings();
            if (usesLink && !settings.link && (gifDivider || category === "二维码" || url.value.trim())) {
              if (gifDivider) {
                message("自定义 GIF 需要图片直链。使用内置动图请点「动态」，然后在素材卡片下点「收藏」。", true);
                url.focus();
              } else {
                const required = category === "二维码" ? "二维码图片地址" : "链接";
                message("请先填写有效的 HTTPS " + required + "。", true);
              }
              return null;
            }
            return currentAsset(settings);
          };
          const card = button(name, () => {
            const asset = getAsset();
            if (asset) insert(asset.html, asset);
          });
          card.setAttribute("aria-label", name);
          const sampleElement = preview({ html: "" });
          card.prepend(sampleElement);
          let previous;
          return {
            element: wrapCard(card, name, getAsset),
            category,
            searchable: (category + name).toLowerCase(),
            update(settings) {
              const link = usesLink ? settings.link : "";
              if (previous?.shade === settings.shade && previous.text === settings.text && previous.link === link) return;
              sampleElement.innerHTML = currentAsset(settings).html;
              previous = { shade: settings.shade, text: settings.text, link };
            }
          };
        })
      );
      if (group === "分割") cards.unshift(...buildGifCards());
      return cards;
    }

    function gallerySettings() {
      const value = url.value.trim();
      const address = tab === "分割" && value.startsWith("//") ? "https:" + value : value;
      return { shade: color.value, text: copy.value, link: url.hidden ? "" : httpsUrl(address) };
    }

    const noResults = document.createElement("p");
    noResults.textContent = "没有匹配的样式。";

    function renderGallery() {
      clearTimeout(galleryTimer);
      galleryTimer = 0;
      if (galleryTab !== tab) {
        galleryTab = tab;
        galleryCards = buildGalleryCards(tab);
        gallery.replaceChildren(...galleryCards.map(({ element }) => element), noResults);
      }
      const keyword = search.value.trim().toLowerCase();
      const settings = gallerySettings();
      let visible = 0;
      for (const { element, category, searchable, update } of galleryCards) {
        const matchesFilter = filter === category || (filter === "全部" && category !== "自定义 GIF");
        const show = tab === "背景" || (matchesFilter && searchable.includes(keyword));
        element.hidden = !show;
        if (show) {
          update?.(settings);
          visible++;
        }
      }
      noResults.hidden = visible > 0;
    }

    function render() {
      const isBackground = tab === "背景";
      const isLibrary = libraryTabs.includes(tab);
      tabs.replaceChildren(...[...Object.keys(groups), "背景", ...libraryTabs].map((name) => button(name, () => {
        tab = name;
        filter = "全部";
        search.value = "";
        url.value = "";
        render();
        tabs.querySelector('[aria-pressed="true"]').focus();
      }, tab === name)));
      filters.replaceChildren(...(isBackground || isLibrary ? [] : ["全部", ...Object.keys(groups[tab])].map((name) => button(name, () => {
        filter = name;
        render();
        filters.querySelector('[aria-pressed="true"]').focus();
      }, filter === name))));
      filters.hidden = gallery.hidden = hint.hidden = isLibrary;
      fields.hidden = copy.hidden = isBackground || isLibrary;
      background.hidden = !isBackground;
      const gifFilter = tab === "分割" && filter === "自定义 GIF";
      const guideFilter = tab === "引导" && ["全部", "二维码", "阅读原文", "往期推荐"].includes(filter);
      url.hidden = !gifFilter && !guideFilter;
      url.placeholder = gifFilter ? "自定义 GIF 的 HTTPS 图片地址"
        : filter === "二维码" ? "HTTPS 二维码图片地址" : "HTTPS 文章链接或二维码图片地址";
      url.setAttribute("aria-label", gifFilter ? "GIF 图片地址" : "素材链接");
      hint.textContent = isBackground
        ? "背景应用于整篇正文。可以换用另一款，或清除本工具添加的背景。"
        : gifFilter ? "输入自定义 GIF 的图片直链。如果 GIF 已在正文里，点图片后选择「收藏为分割线」。"
        : tab === "分割" && filter === "动态" ? "内置 GIF 可直接收藏。点击动图预览可插入正文。"
        : "先在正文点选插入位置，再点击素材预览。素材内的文字可在正文继续编辑。";
      library?.show(tab);
      if (galleryStarted && !isLibrary) renderGallery();
    }

    for (const field of [search, color, copy, url]) {
      field.addEventListener("input", () => {
        clearTimeout(galleryTimer);
        galleryTimer = setTimeout(() => {
          galleryTimer = 0;
          if (!gallery.hidden) renderGallery();
        }, 80);
      });
    }

    function showSource(show) {
      toggle.textContent = show ? "排版素材" : "HTML 源码";
      layout.hidden = show;
      textarea.style.display = show ? "" : "none";
      for (const control of sourceActions.querySelectorAll("button")) {
        const alwaysVisible = control.textContent.includes("恢复") || control.textContent === "收起";
        control.hidden = !show && !alwaysVisible;
      }
    }

    toggle.addEventListener("click", () => showSource(textarea.style.display === "none"));
    showSource(false);
    render();
    return {
      ...adjustment,
      favorite: library?.favorite,
      favoriteDivider(url, name) {
        return library?.favorite({ name, group: "分割", html: gifDividerHtml(url, name) });
      },
      open() {
        if (galleryStarted) return;
        galleryStarted = true;
        renderGallery();
      }
    };
  }

  globalThis.WechatPersonalLayout = { mount };
})();
