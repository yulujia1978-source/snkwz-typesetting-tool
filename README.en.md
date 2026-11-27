# snkwz Typesetting Tool

[简体中文](./README.md)

A Chrome extension for formatting articles in the WeChat Official Accounts editor. Insert reusable layouts, save your own templates, and work with HTML and SVG from a sidebar in the editor.

Based on [WeChat MP HTML Source Helper](https://github.com/shyboy/wechat-mp-html-source-helper).

## Features

- **Layout library** — Browse or search text blocks, calls to action, and dividers. Customize text and colors, then insert a layout at the cursor. GIF dividers support HTTPS image URLs.
- **Article backgrounds** — Apply a preset, a custom color, or an HTTPS image to the article body.
- **Favorites** — Save layouts with their text, colors, and links. Insert a favorite directly or copy it and paste it into the editor.
- **Style adjustments** — Select an inserted layout to recolor it, adjust spacing, move it, duplicate it, or clear its styling. You can also export text styles as PNGs and adjust the corner radius and shadow of images in the article.
- **Section presets** — Save font size, line height, paragraph spacing, heading color, and an optional background. Pair presets with saved layouts for reuse.
- **Personal templates** — Save the article body and its inline formatting. Click **复制模板** (Copy Template), then paste it into another article. Favorites, presets, and templates are stored in the current Chrome profile. After pasting across Official Accounts, check that the images and links work.
- **HTML source** — Read the editor’s current HTML, insert HTML or SVG at the cursor, replace the entire body, or restore the body from before the most recent supported operation.

## Installation

1. Download and extract the extension ZIP. [Download v0.5.22](https://github.com/yulujia1978-source/snkwz-typesetting-tool/raw/refs/heads/main/snkwz-typesetting-tool-v0.5.22-github.zip)
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder that directly contains `manifest.json`.
4. Open or refresh a WeChat Official Accounts article editor at `https://mp.weixin.qq.com/`. Click the sidebar switch or the **snkwz排版工具** toolbar button. The sidebar shows the installed version.

To update an existing installation, save your draft, extract the new files into the existing extension folder, click **Reload** on the extension card, and refresh the article editor. Chrome is sufficient to run the extension. Node.js is needed only for development tests.

## Using the HTML source panel

1. Put the cursor in the article body and open **HTML 源码** (HTML Source).
2. Paste HTML or SVG and click **插入到光标位置** (Insert at Cursor). When text is selected, insertion starts at the end of the selection and preserves the selected text.
3. Use **读取当前 HTML** (Read Current HTML) to inspect the article body or **替换全文** (Replace Entire Body) to overwrite it.
4. Use **恢复操作前正文** (Restore Previous Body) to revert the most recent supported operation. This also overwrites any changes made to the body after that operation.
5. Save the draft manually, reopen it, and check the mobile preview. The extension leaves saving and publishing to you.

SVG and block-level HTML can split a paragraph at the insertion point. Inline HTML can be inserted directly into text. If the cursor position is missing or stale, click the desired location in the article again. The restore snapshot is kept in the current page’s memory and expires when the page is refreshed or closed.

## Compatibility

The extension removes script and embed elements, stylesheets, inline event handlers, disallowed URL schemes, and unsafe SVG animation attributes during import. Common SVG shapes and SMIL animations, including click-triggered animations, can be retained. The sidebar reports compatibility issues such as removed stylesheets, external images, or complex layouts. This filtering is intended to reduce obvious risks. Use trusted source HTML.

WeChat can further process tags, attributes, and styles when saving or pasting. Check backgrounds, animations, images, links, and layouts in the actual draft and mobile preview. Images are referenced by URL and need to be uploaded to WeChat separately when required. Browser tests use simulated editor pages and a real ProseMirror instance. Saving and reopening an article on WeChat’s servers and rendering on iOS or Android require separate verification.

The Manifest V3 extension runs at `https://mp.weixin.qq.com/*` and uses Chrome’s `storage` permission for saved layouts and templates.

## Development

The extension loads its JavaScript and CSS directly through `manifest.json`. Edit the files, reload the extension at `chrome://extensions/`, and refresh the article editor.

- `content.js` connects the sidebar to the article editor and handles insertion, replacement, and restoration.
- `layout.js`, `library.js`, and `adjust.js` provide layouts, saved items, and editing tools.
- `image-bridge.js` connects image formatting to the WeChat editor.
- `styles.css` and `icons/` provide styles and icons.
- `tests/browser.test.cjs` contains browser regression tests.

Run the browser tests with Node.js 20 or later and Chrome installed.

```powershell
npm install --no-save --package-lock=false playwright-core esbuild prosemirror-model prosemirror-state prosemirror-view
node --test tests/browser.test.cjs
```

To use existing installations, set `CHROME_PATH` to the browser executable, `PLAYWRIGHT_MODULE` or `ESBUILD_MODULE` to the corresponding module directory, or `PROSEMIRROR_PROJECT` to a directory with the ProseMirror dependencies.

## License

Released under the [MIT License](./LICENSE).
