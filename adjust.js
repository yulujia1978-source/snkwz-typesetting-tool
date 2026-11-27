(() => {
  "use strict";

  function colorInputValue(color, fallback) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    const rgb = color?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return rgb ? "#" + rgb.slice(1, 4).map(channel => Number(channel).toString(16).padStart(2, "0")).join("") : fallback;
  }

  async function exportImage(node, name, message) {
    if (node.querySelector("img,svg,video,audio,iframe") || [node, ...node.querySelectorAll("[style]")].some(el => /url\(/i.test(el.getAttribute("style") || ""))) {
      return message("含图片、音视频或 SVG 的素材暂不支持转为 PNG。", true);
    }
    const bounds = node.getBoundingClientRect();
    const width = Math.ceil(bounds.width);
    const height = Math.ceil(bounds.height);
    if (!width || !height || width * height > 4_000_000) return message("素材尺寸超出 PNG 导出范围。", true);
    const view = node.ownerDocument.defaultView;
    const font = view.getComputedStyle(node);
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;background:#fff;overflow:hidden;";
    wrapper.style.fontFamily = font.fontFamily;
    wrapper.style.fontSize = font.fontSize;
    wrapper.style.color = font.color;
    const clone = node.cloneNode(true);
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
    wrapper.append(clone);
    const html = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const image = new Image();

    try {
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await image.decode();
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.download = name.replace(/[<>:"/\\|?*]/g, "_") + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      message("已下载 PNG，可通过公众号的图片入口上传。");
    } catch {
      message("浏览器未能生成 PNG。", true);
    }
  }

  function mount({ panel, adjustMaterial, adjustImage, message }) {
    const controls = document.createElement("section");
    controls.className = "oclaw-adjustment";
    controls.hidden = true;
    controls.setAttribute("aria-label", "样式调整");
    controls.innerHTML = `
      <strong>样式调整</strong> <span class="oclaw-adjustment-name"></span>
      <div class="oclaw-adjustment-row">
        <label>配色 <input type="color" data-color="color"></label>
        <label>底色 <input type="color" data-color="background"></label>
        <button type="button" data-action="background">透明底</button>
      </div>
      <div class="oclaw-adjustment-row">
        <button type="button" data-action="duplicate">复制一份</button>
        <button type="button" data-action="favorite">收藏当前样式</button>
        <button type="button" data-action="clear">清除样式</button>
        <button type="button" data-action="delete">删除素材</button>
        <button type="button" data-action="image">下载 PNG</button>
      </div>
      <div class="oclaw-adjustment-row">
        <button type="button" data-action="margin" data-value="4">增加边距</button>
        <button type="button" data-action="margin" data-value="-4">减少边距</button>
        <button type="button" data-action="margin" data-value="0">清空边距</button>
      </div>
      <div class="oclaw-adjustment-row">
        <button type="button" data-action="before">前加空行</button>
        <button type="button" data-action="after">后加空行</button>
        <button type="button" data-action="up">上移</button>
        <button type="button" data-action="down">下移</button>
      </div>`;
    panel.querySelector(".oclaw-title").after(controls);
    const imageControls = document.createElement("section");
    imageControls.className = "oclaw-adjustment";
    imageControls.hidden = true;
    imageControls.setAttribute("aria-label", "图片调整");
    imageControls.innerHTML = `
      <strong>图片调整</strong>
      <form class="oclaw-adjustment-row oclaw-image-controls">
        <label>圆角 <input type="number" name="radius" min="0" max="200" value="0" required> px</label>
        <label>阴影 <input type="number" name="shadow" min="0" max="100" value="0" required></label>
        <button type="submit">应用到图片</button>
      </form>
      <p class="oclaw-image-status" aria-live="polite"></p>`;
    controls.before(imageControls);
    const openImages = document.createElement("button");
    openImages.type = "button";
    openImages.className = "oclaw-open-image-tools";
    openImages.textContent = "图片调整";
    imageControls.before(openImages);
    openImages.addEventListener("click", () => {
      imageControls.hidden = !imageControls.hidden;
    });
    const imageForm = imageControls.querySelector("form");
    const { radius, shadow } = imageForm.elements;
    const imageStatus = imageControls.querySelector(".oclaw-image-status");
    function showImageStatus(text, error = false) {
      imageStatus.textContent = text;
      imageStatus.classList.toggle("error", error);
    }
    const imageSettings = () => ({ radius: radius.valueAsNumber, shadow: shadow.valueAsNumber });
    imageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      adjustImage(imageSettings());
    });
    const name = controls.querySelector(".oclaw-adjustment-name");
    const colorInputs = [...controls.querySelectorAll("input")];
    for (const input of colorInputs) {
      input.addEventListener("change", () => adjustMaterial(input.dataset.color, input.value));
    }
    controls.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]");
      if (action) adjustMaterial(action.dataset.action, action.dataset.value === undefined ? null : Number(action.dataset.value));
    });

    return {
      showImage(settings) {
        imageControls.hidden = !settings;
        showImageStatus("");
        if (!settings) return;
        radius.value = Math.min(200, Math.round(settings.radius));
        shadow.value = settings.shadow;
      },
      imageStatus: showImageStatus,
      show(material) {
        controls.hidden = !material;
        if (!material) return;
        name.textContent = material.name;
        colorInputs[0].value = colorInputValue(material.color, "#3859a5");
        colorInputs[1].value = colorInputValue(material.background, "#ffffff");
      },
      image: (node, name) => exportImage(node, name, message)
    };
  }

  globalThis.WechatPersonalAdjustment = { mount };
})();
