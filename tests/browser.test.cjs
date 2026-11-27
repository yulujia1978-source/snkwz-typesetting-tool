const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  });
});
after(async () => { await browser?.close(); });

async function fixture(t, markup = '<div class="js_editor_area"><div contenteditable="true"><p>原正文</p></div></div>', withLayout = false) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    return dialog.dismiss();
  });
  t.after(() => assert.deepEqual(dialogs, []));
  await page.setContent(markup);
  if (withLayout) {
    await page.addScriptTag({ path: path.join(__dirname, '../adjust.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../layout.js') });
  }
  await page.addScriptTag({ path: path.join(__dirname, '../content.js') });
  await page.addStyleTag({ path: path.join(__dirname, '../styles.css') });
  await page.locator('#oclaw-html-source-button').click();
  return page;
}

test('favorites, presets and personal templates persist across articles and can be copied', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(5000);
  await page.route('https://mp.weixin.qq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><div class="js_editor_area" style="margin:160px auto;width:650px"><div contenteditable="true"><h2>小标题</h2><p>原正文</p></div></div>'
  }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const { version } = require('../manifest.json');
  await page.addInitScript((version) => {
    const listeners = [];
    const read = () => JSON.parse(localStorage.getItem('test-extension-storage') || '{}');
    const write = (values, changes) => {
      localStorage.setItem('test-extension-storage', JSON.stringify(values));
      for (const listener of listeners) listener(changes, 'local');
    };
    window.chrome ??= {};
    window.chrome.runtime = {
      getManifest: () => ({ version }),
      getURL: file => 'https://mp.weixin.qq.com/mock-extension/' + file
    };
    window.chrome.storage = {
      onChanged: { addListener: listener => listeners.push(listener) },
      local: {
        get: async () => read(),
        set: async updates => write({ ...read(), ...updates },
          Object.fromEntries(Object.entries(updates).map(([key, newValue]) => [key, { newValue }]))),
        remove: async key => {
          const values = read();
          delete values[key];
          write(values, { [key]: {} });
        }
      }
    };
  }, version);
  async function boot() {
    for (const file of ['library.js', 'adjust.js', 'layout.js', 'content.js']) {
      await page.addScriptTag({ path: path.join(__dirname, '..', file) });
    }
    await page.addStyleTag({ path: path.join(__dirname, '../styles.css') });
    assert.equal(await page.locator('.oclaw-layout-gallery button').count(), 0);
    await page.locator('#oclaw-html-source-button').click();
  }
  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push(dialog.message());
    return dialog.accept();
  });
  await page.goto('https://mp.weixin.qq.com/cgi-bin/appmsg');
  await boot();
  assert.equal(await page.locator('.oclaw-dock-version').innerText(), 'v' + version);
  assert.match(await page.locator('.oclaw-dock-header').innerText(), /snkwz排版工具/);
  assert.match(await page.locator('.oclaw-dock-logo').getAttribute('src'), /icons\/icon-32\.png$/);
  const switchControl = page.getByRole('switch', { name: '显示排版面板' });
  await switchControl.click();
  assert.equal(await page.locator('.oclaw-dock-version').isVisible(), true);
  await switchControl.click();
  const tabs = page.getByRole('navigation', { name: '素材分类' });
  const pickTab = name => tabs.getByRole('button', { name, exact: true }).click();

  await page.getByLabel('素材文字').fill('每周设计推荐');
  await page.getByRole('button', { name: '收藏简洁描边', exact: true }).click();
  await pickTab('背景');
  await page.getByRole('button', { name: '收藏方格 #faf7f0', exact: true }).click();
  await pickTab('栏目预设');
  await page.getByLabel('预设名称').fill('每周推荐');
  await page.getByLabel('正文字号').fill('19');
  await page.getByLabel('文章背景').selectOption({ label: '方格 #faf7f0' });
  await page.getByRole('checkbox', { name: '正文 · 简洁描边' }).check();
  await page.getByRole('button', { name: '保存预设', exact: true }).click();
  await page.getByRole('button', { name: '应用排版', exact: true }).waitFor();

  await page.reload();
  await boot();
  await pickTab('我的收藏');
  await page.getByText('每周设计推荐', { exact: true }).waitFor();
  const favorite = page.locator('.oclaw-favorites .oclaw-library-item').filter({ hasText: '每周设计推荐' });
  await favorite.getByRole('button', { name: '删除收藏' }).click();
  await pickTab('栏目预设');
  await page.getByRole('button', { name: '应用排版', exact: true }).click();
  const editor = page.locator('[contenteditable]');
  assert.match(await editor.locator('p').getAttribute('style'), /19px/);
  assert.match(await editor.locator('[data-oclaw-personal-background]').getAttribute('style'), /linear-gradient/);
  await editor.locator('p').evaluate(paragraph => {
    paragraph.closest('[contenteditable]').focus();
    document.getSelection().collapse(paragraph.firstChild, 0);
  });
  await page.getByRole('button', { name: '插入简洁描边' }).click();
  assert.match(await editor.innerText(), /每周设计推荐/);
  await editor.locator('h2').evaluate(node => {
    node.style.display = 'flex';
    node.insertAdjacentHTML('afterend', '<p><a href="https://mp.weixin.qq.com/example">查看详情</a><img data-src="https://mp.weixin.qq.com/example.png" alt="活动图"></p>');
  });
  await pickTab('个人模板');
  await page.getByLabel('模板名称').fill('设计周刊');
  await page.getByRole('button', { name: '保存当前正文为模板' }).click();
  await page.getByRole('button', { name: '复制模板' }).waitFor();
  const savedHtml = await editor.innerHTML();
  await page.goto('https://mp.weixin.qq.com/cgi-bin/appmsg?account=another');
  await boot();
  assert.equal(await page.locator('.oclaw-template-thumbnail iframe').count(), 0);
  await pickTab('个人模板');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  const preview = page.locator('.oclaw-template-preview iframe');
  assert.equal(await preview.getAttribute('sandbox'), '');
  await preview.contentFrame().getByText('每周设计推荐').waitFor();
  await page.getByRole('button', { name: '关闭预览' }).click();
  const originalHtml = await editor.innerHTML();
  const dialogCount = dialogs.length;
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'write', { value: async ([item]) => {
      window.copiedTemplate = await (await item.getType('text/html')).text();
      window.copiedText = await (await item.getType('text/plain')).text();
    } });
  });
  assert.equal(await page.getByRole('button', { name: '使用模板' }).count(), 0);
  await page.getByRole('button', { name: '复制模板' }).click();
  await page.getByText('模板已复制。', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.copiedTemplate), savedHtml);
  assert.match(await page.evaluate(() => window.copiedText), /每周设计推荐/);
  assert.equal(await editor.innerHTML(), originalHtml);
  assert.equal(dialogs.length, dialogCount);
  await pickTab('分割');
  await page.getByRole('button', { name: '自定义 GIF', exact: true }).click();
  await page.getByLabel('GIF 图片地址').fill('https://mp.weixin.qq.com/example.gif');
  await page.getByRole('button', { name: '收藏GIF 图片分割线', exact: true }).click();
  await pickTab('我的收藏');
  const savedGif = page.locator('.oclaw-library-item').filter({ hasText: 'GIF 图片分割线' });
  await savedGif.getByRole('button', { name: '插入正文' }).click();
  assert.match(await page.getByRole('status').innerText(), /复制素材.*Ctrl\+V/);
  await savedGif.getByRole('button', { name: '复制素材' }).click();
  await page.getByText('素材已复制。', { exact: false }).waitFor();
  assert.match(await page.evaluate(() => window.copiedTemplate), /<img src="https:\/\/mp\.weixin\.qq\.com\/example\.gif"/);
  assert.equal(await editor.innerHTML(), originalHtml);
  const thumbnailFrames = page.locator('.oclaw-template-thumbnail iframe');
  const loadedThumbnails = await thumbnailFrames.count();
  await page.evaluate(async () => {
    const templates = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
      'template:preview-' + index, { name: '预览测试 ' + index, html: '<p>预览内容</p>' }
    ]));
    await window.chrome.storage.local.set(templates);
  });
  assert.equal(await thumbnailFrames.count(), loadedThumbnails);
  await pickTab('个人模板');
  const templateCards = page.locator('.oclaw-template-grid .oclaw-library-item');
  await thumbnailFrames.first().waitFor({ state: 'attached' });
  assert.equal(await templateCards.count(), 25);
  assert.ok(await thumbnailFrames.count() < 25);
  await thumbnailFrames.first().evaluate(frame => {
    window.previousTemplateFrame = frame;
    window.previousTemplateWindow = frame.contentWindow;
  });
  await page.evaluate(() => window.chrome.storage.local.set({
    'template:most-recent': { name: '刚保存的模板', html: '<p>新模板正文</p>' }
  }));
  assert.equal(await templateCards.count(), 26);
  assert.equal(await page.evaluate(() => window.previousTemplateFrame.isConnected), true);
  assert.equal(await page.evaluate(() => window.previousTemplateFrame.contentWindow === window.previousTemplateWindow), true);
  await templateCards.filter({ has: page.getByText('刚保存的模板', { exact: true }) })
    .getByRole('button', { name: '删除模板' }).click();
  assert.equal(await templateCards.count(), 25);
  await pickTab('分割');
  await page.getByRole('button', { name: '动态', exact: true }).click();
  assert.equal(await page.getByLabel('GIF 图片地址').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'GIF 图片分割线', exact: true }).count(), 0);
  const rainbow = page.getByRole('button', { name: '彩虹流光', exact: true });
  const bundled = 'https://mp.weixin.qq.com/mock-extension/assets/gif-dividers/rainbow.gif';
  const originalGif = readFileSync(path.join(__dirname, '../assets/gif-dividers/rainbow.gif'));
  await page.route(bundled, route => route.fulfill({ contentType: 'image/gif', body: originalGif }));
  assert.equal(await rainbow.locator('img').getAttribute('src'), bundled);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 GIF · 彩虹流光', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'rainbow.gif');
  assert.deepEqual(readFileSync(await download.path()), originalGif);
  await page.getByRole('button', { name: '收藏彩虹流光', exact: true }).click();
  await page.getByRole('button', { name: '收藏彩虹流光', exact: true }).getByText('已收藏').waitFor();
  await pickTab('我的收藏');
  const builtInFavorite = page.locator('.oclaw-library-item').filter({ hasText: '彩虹流光' });
  await builtInFavorite.getByRole('button', { name: '复制素材' }).click();
  await page.waitForFunction(() => window.copiedTemplate.includes('Animated_rainbow_rule.gif'));
  assert.match(await page.evaluate(() => window.copiedTemplate), /https:\/\/upload\.wikimedia\.org\//);
  await editor.evaluate(node => {
    const image = document.createElement('img');
    image.alt = '正文 GIF';
    image.setAttribute('data-src', 'https://mp.weixin.qq.com/article.gif?wx_fmt=gif');
    node.append(image);
  });
  await editor.getByAltText('正文 GIF').dispatchEvent('click');
  await page.getByRole('button', { name: '收藏为分割线', exact: true }).click();
  await page.getByText('已收藏，可在「我的收藏」中复制使用。').waitFor();
  const articleGif = page.locator('.oclaw-favorites .oclaw-library-item').filter({ hasText: '正文 GIF' });
  await articleGif.getByRole('button', { name: '复制素材' }).click();
  await page.waitForFunction(() => window.copiedTemplate.includes('article.gif?wx_fmt=gif'));
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
});

test('layout panel inserts body, guide and divider, and applies, clears and restores backgrounds', async (t) => {
  const page = await fixture(t, undefined, true);
  page.setDefaultTimeout(5000);
  await page.addStyleTag({ content: '.js_editor_area { margin: 160px auto 0; width: 650px; }' });
  const editor = page.locator('[contenteditable]');
  const tab = (name) => page.locator('.oclaw-layout-tabs').getByRole('button', { name, exact: true });
  const card = (name) => page.locator('.oclaw-layout-gallery').getByRole('button', { name, exact: true });
  const dockSwitch = page.getByRole('switch', { name: '显示排版面板' });
  const dock = page.getByRole('region', { name: 'snkwz排版工具' });
  await card('简洁描边').evaluate(button => { window.previousGalleryCard = button; });
  await page.getByLabel('素材文字').fill('复用预览卡片');
  const bodyPreview = card('简洁描边').locator('.oclaw-layout-preview');
  await bodyPreview.getByText('复用预览卡片').waitFor();
  assert.equal(await card('简洁描边').evaluate(button => button === window.previousGalleryCard), true);
  await page.getByLabel('素材文字').fill('');
  assert.equal(await dockSwitch.getAttribute('aria-checked'), 'true');
  await dockSwitch.click();
  assert.equal(await dockSwitch.getAttribute('aria-checked'), 'false');
  assert.equal(await dock.isVisible(), false);
  await dockSwitch.click();
  assert.equal(await dock.isVisible(), true);
  await editor.getByText('原正文').click();
  assert.equal(await editor.evaluate((node) => node === document.activeElement), true);
  const moveCaret = async (offset) => {
    await editor.locator('p').first().evaluate((paragraph, offset) => {
      paragraph.closest('[contenteditable]').focus();
      paragraph.ownerDocument.getSelection().collapse(paragraph.firstChild, offset);
    }, offset);
  };

  await moveCaret(1);
  await page.getByRole('searchbox').fill('简洁描边');
  await page.getByLabel('素材文字').fill('正文示例');
  await card('简洁描边').click();
  assert.match(await editor.innerHTML(), /原.*正文示例.*正文/s);

  assert.equal(await dock.isVisible(), true);
  await moveCaret(0);
  await tab('引导').click();
  await page.getByLabel('素材文字').fill('欢迎关注');
  await card('关注公众号').click();
  assert.match(await editor.innerText(), /欢迎关注/);

  await moveCaret(0);
  await tab('分割').click();
  await card('细实线').click();
  assert.equal(await editor.locator('p[style*="border-bottom"]').count(), 1);

  await page.getByRole('button', { name: '自定义 GIF', exact: true }).click();
  await card('GIF 图片分割线').click();
  assert.match(await page.getByRole('status').innerText(), /自定义 GIF 需要图片直链/);
  const gif = 'https://mmbiz.qpic.cn/example/divider.gif';
  await page.route(gif, route => route.fulfill({
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  }));
  await page.getByLabel('GIF 图片地址').fill(gif.slice('https:'.length));
  await card('GIF 图片分割线').click();
  const image = editor.locator('img');
  assert.equal(await image.getAttribute('src'), gif);
  await image.dispatchEvent('click');
  const pictureTools = page.getByRole('region', { name: '图片调整' });
  assert.equal(await pictureTools.getByRole('button', { name: '本地图片生成 PNG' }).count(), 0);
  await pictureTools.getByLabel('圆角').fill('18');
  await pictureTools.getByLabel('阴影').fill('40');
  await pictureTools.getByRole('button', { name: '应用到图片' }).click();
  assert.equal(await image.evaluate(node => node.style.borderRadius), '18px');
  assert.match(await image.evaluate(node => node.style.boxShadow), /rgba\(0, 0, 0, 0\.2\)/);
  await pictureTools.getByText('圆角和阴影已应用', { exact: false }).waitFor();
  assert.equal(await image.getAttribute('src'), gif);
  await page.getByRole('button', { name: '恢复操作前正文' }).click();
  assert.equal(await image.evaluate(node => node.style.borderRadius), '');
  assert.equal(await image.evaluate(node => node.style.boxShadow), '');

  await editor.evaluate(node => {
    node.classList.add('ProseMirror');
    let target;
    window.imageApiCalls = [];
    window.__MP_Editor_JSAPI__ = {
      invoke({ apiName, apiParam, sucCb }) {
        window.imageApiCalls.push(apiName);
        if (apiName === 'mp_editor_set_selection') target = apiParam.container;
        if (apiName === 'mp_editor_insert_html') target.outerHTML = apiParam.html;
        sucCb();
      }
    };
  });
  await page.addScriptTag({ path: path.join(__dirname, '../image-bridge.js') });
  await image.dispatchEvent('click');
  await pictureTools.getByLabel('圆角').fill('24');
  await pictureTools.getByLabel('阴影').fill('50');
  await pictureTools.getByRole('button', { name: '应用到图片' }).click();
  await pictureTools.getByText('圆角和阴影已应用', { exact: false }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.imageApiCalls), ['mp_editor_set_selection', 'mp_editor_insert_html']);
  assert.equal(await image.evaluate(node => node.parentElement.hasAttribute('nodeleaf')), true);
  assert.equal(await image.evaluate(node => node.style.borderRadius), '24px');
  assert.match(await image.evaluate(node => node.style.boxShadow), /rgb\(120, 120, 120\).*0\.5em/);
  assert.equal(await image.evaluate(node => node.parentElement.style.padding), '0.5em');
  assert.equal(await pictureTools.getByLabel('阴影').inputValue(), '50');
  assert.equal(await image.getAttribute('src'), gif);

  await tab('背景').click();
  const original = await editor.innerHTML();
  await card('方格 #faf7f0').click();
  const background = editor.locator('[data-oclaw-personal-background]');
  assert.match(await background.getAttribute('style'), /linear-gradient/);
  assert.equal(await background.innerHTML(), original);
  await page.getByRole('button', { name: '应用自定义背景' }).click();
  assert.equal(await background.innerHTML(), original);
  await page.getByRole('button', { name: '清除背景' }).click();
  assert.equal(await editor.innerHTML(), original);
  await page.getByRole('button', { name: '恢复操作前正文' }).click();
  assert.equal(await background.innerHTML(), original);

  await page.locator('.oclaw-layout-toggle').click();
  await page.getByRole('button', { name: '读取当前 HTML' }).click();
  assert.match(await page.getByLabel('待导入的 HTML 源码').inputValue(), /欢迎关注/);
});

test('decorated body frames insert editable paragraphs with the chosen border color', async (t) => {
  const page = await fixture(t, undefined, true);
  page.setDefaultTimeout(5000);
  const editor = page.locator('[contenteditable]');
  await editor.evaluate((node) => {
    node.focus();
    document.getSelection().collapse(node.firstElementChild.firstChild, 1);
  });
  await page.locator('.oclaw-layout-fields input[type=color]').fill('#b53c52');
  await page.getByLabel('素材文字').fill('第一段 <示例>\n第二段');
  const frames = [
    ['双引号细框', '“'],
    ['双色角标框', '▮'],
    ['彩色加号框', '+'],
    ['折角信笺', '◢'],
    ['双角线框', '┏'],
    ['票券虚线框', '✂'],
    ['圆点便签', '●'],
    ['斜线角标框', '╱'],
    ['星标细框', '✦'],
    ['格纹手记', '▦'],
    ['双线语录', '❝'],
    ['圆章引号', '❞'],
    ['上下引号框', '“'],
    ['书签摘录', '▾'],
    ['短轴引用', '━']
  ];
  const sections = editor.locator(':scope > section');
  for (const [index, [name, decoration]] of frames.entries()) {
    await page.getByRole('searchbox').fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await sections.count(), index + 1);
    const inserted = sections.last();
    assert.equal(await inserted.evaluate(node => node.style.borderLeftColor || node.style.borderTopColor), 'rgb(181, 60, 82)');
    const mark = await inserted.locator('[aria-hidden="true"]').first().textContent();
    assert.equal(mark[0], decoration);
    assert.deepEqual(await inserted.locator('p').allTextContents(), ['第一段 <示例>', '第二段']);
  }
  const material = sections.last();
  const adjustments = page.getByRole('region', { name: '样式调整' });
  const action = name => adjustments.getByRole('button', { name, exact: true });
  assert.match(await adjustments.innerText(), /短轴引用/);
  await adjustments.locator('[data-color="color"]').fill('#176448');
  assert.equal(await material.evaluate(node => node.style.borderLeftColor), 'rgb(23, 100, 72)');
  await action('增加边距').click();
  await action('增加边距').click();
  assert.equal(await material.evaluate(node => node.style.marginTop), '24px');
  await action('前加空行').click();
  assert.equal(await material.evaluate(node => node.previousElementSibling.innerHTML), '<br>');
  const download = page.waitForEvent('download');
  await action('下载 PNG').click();
  assert.equal((await download).suggestedFilename(), '短轴引用.png');
  await action('复制一份').click();
  assert.equal(await sections.count(), frames.length + 1);
  await action('清除样式').click();
  assert.equal(await sections.nth(frames.length - 1).getAttribute('style'), null);
  assert.deepEqual(await sections.nth(frames.length - 1).locator('p').allTextContents(), ['第一段 <示例>', '第二段']);
  await sections.first().locator('p').first().dispatchEvent('click');
  assert.match(await adjustments.innerText(), /双引号细框/);
  await action('下移').click();
  assert.equal(await sections.nth(1).getAttribute('data-oclaw-layout-material'), '双引号细框');
  await action('删除素材').click();
  assert.equal(await editor.locator('[data-oclaw-layout-material="双引号细框"]').count(), 0);
  await page.getByRole('button', { name: '恢复操作前正文' }).click();
  assert.equal(await editor.locator('[data-oclaw-layout-material="双引号细框"]').count(), 1);
});

async function apply(page, html, insert = false) {
  await page.locator('#oclaw-html-source-textarea').fill(html);
  await page.locator(insert ? '#oclaw-html-source-insert-btn' : '#oclaw-html-source-apply-btn').click();
}

async function position(page, selector, offset, end = offset, scope = page) {
  await page.locator('#oclaw-html-source-cancel-btn').click();
  await scope.locator(selector).evaluate((element, { offset, end }) => {
    const doc = element.ownerDocument;
    const container = element.firstChild?.nodeType === 3 ? element.firstChild : element;
    element.closest('[contenteditable="true"]').focus();
    const range = doc.createRange();
    range.setStart(container, offset);
    range.setEnd(container, end);
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
  }, { offset, end });
  await page.locator('#oclaw-html-source-button').click();
}

test('empty and cleaned-empty imports preserve the original', async (t) => {
  const page = await fixture(t);
  for (const html of ['', ' \n ', '<script>alert(1)</script>', '<p><br></p>', '<!-- comment -->', '<svg></svg>', '<template><p>隐藏</p></template>']) {
    await apply(page, html);
    assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>原正文</p>');
    assert.match(await page.locator('[role="status"]').innerText(), /阻止清空/);
  }
});

test('closing preserves content while replacement and restore notify the editor', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    window.inputs = 0;
    document.querySelector('[contenteditable]').addEventListener('input', () => window.inputs++);
  });
  await page.locator('textarea').fill('<p>新正文</p>');
  await page.locator('#oclaw-html-source-cancel-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerText(), '原正文');
  assert.equal(await page.locator('#oclaw-html-source-restore-btn').isDisabled(), true);
  await page.locator('#oclaw-html-source-button').click();
  await apply(page, '<p>新正文</p>');
  assert.equal(await page.locator('[contenteditable]').innerText(), '新正文');
  assert.match(await page.locator('[role="status"]').innerText(), /尚未验证微信保存/);
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerText(), '原正文');
  assert.equal(await page.evaluate(() => window.inputs), 2);
  assert.equal(await page.locator('#oclaw-html-source-restore-btn').isDisabled(), true);
});

test('a backup cannot be restored to a different article or replacement node', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>新正文</p>');
  await page.evaluate(() => {
    document.querySelector('.js_editor_area').innerHTML = '<div contenteditable="true">另一篇文章</div>';
  });
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerText(), '另一篇文章');
  assert.match(await page.locator('[role="status"]').innerText(), /备份不属于/);
});

test('unrelated, ambiguous and hidden editables are not overwritten', async (t) => {
  for (const markup of [
    '<div contenteditable="true">标题</div>',
    '<div class="js_editor_area"><div contenteditable="true">甲</div><div contenteditable="true">乙</div></div>',
    '<div class="js_editor_area" style="visibility:hidden"><div contenteditable="true">隐藏</div></div>',
    '<div class="js_editor_area" style="opacity:0"><div contenteditable="true">透明隐藏</div></div>',
  ]) {
    const page = await fixture(t, markup);
    const before = await page.locator('[contenteditable]').allInnerTexts();
    await apply(page, '<p>新正文</p>');
    assert.deepEqual(await page.locator('[contenteditable]').allInnerTexts(), before);
    assert.match(await page.locator('[role="status"]').innerText(), /无法唯一确定/);
  }
});

test('ProseMirror class does not block reading, import or restore', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area"><div class="ProseMirror" contenteditable="true"><p>事务正文</p></div></div>');
  await page.locator('#oclaw-html-source-read-btn').click();
  assert.equal(await page.locator('textarea').inputValue(), '<p>事务正文</p>');
  await apply(page, '<p>新正文</p>');
  assert.equal(await page.locator('.ProseMirror').innerText(), '新正文');
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('.ProseMirror').innerText(), '事务正文');
});

async function mountProseMirror(page) {
  const esbuild = require(process.env.ESBUILD_MODULE || 'esbuild');
  const bundle = await esbuild.build({
    stdin: {
      resolveDir: process.env.PROSEMIRROR_PROJECT || path.join(__dirname, '..'),
      contents: `
        import { Schema } from 'prosemirror-model';
        import { EditorState } from 'prosemirror-state';
        import { EditorView } from 'prosemirror-view';
        const schema = new Schema({ nodes: {
          doc: {content: 'block+'},
          paragraph: {group: 'block', content: 'text*', parseDOM: [{tag: 'p'}], toDOM: () => ['p', 0]},
          svg: {group: 'block', atom: true, attrs: {html: {}},
            parseDOM: [{tag: 'svg', getAttrs: dom => ({html: dom.outerHTML})}],
            toDOM: node => new DOMParser().parseFromString(node.attrs.html, 'text/html').querySelector('svg')},
          text: {}
        }});
        window.view = new EditorView(document.querySelector('.js_editor_area'), {
          state: EditorState.create({schema, doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('真实模型原正文')])])})
        });
        window.reopen = (json) => {
          window.view.destroy();
          window.view = new EditorView(document.querySelector('.js_editor_area'), {
            state: EditorState.create({schema, doc: schema.nodeFromJSON(json)})
          });
        };
      `,
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
}

test('real ProseMirror observes imported DOM in its document model and restores it', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area"></div>');
  await mountProseMirror(page);
  await apply(page, '<p>真实模型新正文</p>');
  await page.waitForFunction(() => window.view.state.doc.textContent === '真实模型新正文');
  await page.locator('#oclaw-html-source-restore-btn').click();
  await page.waitForFunction(() => window.view.state.doc.textContent === '真实模型原正文');
  await apply(page, '<p>保存后重开</p>');
  await page.waitForFunction(() => window.view.state.doc.textContent === '保存后重开');
  const saved = await page.evaluate(() => window.view.state.doc.toJSON());
  await page.evaluate((json) => window.reopen(json), saved);
  assert.equal(await page.locator('.ProseMirror').innerText(), '保存后重开');
  assert.equal(await page.evaluate(() => window.view.state.doc.textContent), '保存后重开');
});

test('a changed page address cannot restore the previous article backup', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>新正文</p>');
  await page.evaluate(() => { location.hash = 'different-article'; });
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerText(), '新正文');
  assert.match(await page.locator('[role="status"]').innerText(), /备份不属于/);
});

test('a designated editable container is accepted without generic fallback', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area" contenteditable="true">原正文</div>');
  await apply(page, '<p>新正文</p>');
  assert.equal(await page.locator('[contenteditable]').innerText(), '新正文');
});

test('scripts, URL obfuscation, embedded documents and SVG attribute mutation are removed', async (t) => {
  const page = await fixture(t);
  await apply(page, `<p onclick="alert(1)">安全文字</p>
    <a href="java&#10;script:alert(1)">危险链接</a>
    <img src="data:image/svg+xml,test" onerror="alert(1)">
    <iframe srcdoc="test"></iframe><object></object><embed><form><input></form>
    <svg><foreignObject><p>嵌入</p></foreignObject>
    <a xlink:href="javascript:alert(1)">链接</a>
    <set attributeName="href" to="javascript:alert(1)"></set>
    <animate attributeName="onclick" to="alert(1)"></animate></svg>
    <p style="background:url(javascript:alert(1))">危险样式</p>
    <p style="background:url(\\6a avascript:test)">转义样式</p>`);
  const result = await page.locator('[contenteditable]').innerHTML();
  assert.doesNotMatch(result, /onclick|onerror|javascript|srcdoc|foreignObject|<iframe|<object|<embed|<form|<input|<set|<animate/i);
  assert.match(result, /安全文字/);
});

test('SVG click animations, gradients, safe links and inline CSS survive', async (t) => {
  const page = await fixture(t);
  await apply(page, `<p style="color:red;border-radius:8px">样式文字</p>
    <a href="https://dreamger.com">网站</a><a href="#part">锚点</a>
    <svg viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
    <rect width="50" height="50" fill="url(#g)"><animate attributeName="opacity" values="0;1" dur="1s" begin="click"/><animateTransform attributeName="transform" type="rotate" from="0" to="90" dur="1s"/></rect></svg>`);
  const editor = page.locator('[contenteditable]');
  assert.equal(await editor.locator('animate').getAttribute('begin'), 'click');
  assert.equal(await editor.locator('animateTransform').count(), 1);
  assert.equal(await editor.locator('linearGradient').count(), 1);
  assert.equal(await editor.locator('a').first().getAttribute('href'), 'https://dreamger.com');
  assert.match(await editor.locator('p').getAttribute('style'), /color:red/);
});

test('compatibility losses are shown before replacement and remain visible', async (t) => {
  const page = await fixture(t);
  const html = `<html><head><style>.a{color:red}</style><link rel="stylesheet" href="https://example.com/a.css"></head>
    <body><p style="display:flex">内容</p><img src="https://example.com/a.png"></body></html>`;
  await page.locator('textarea').fill(html);
  const warning = await page.getByRole('status').innerText();
  assert.match(warning, /样式表/);
  assert.match(warning, /非微信图片/);
  assert.match(warning, /复杂布局/);
  await apply(page, html);
  assert.equal(await page.locator('[contenteditable] style,[contenteditable] link').count(), 0);
  assert.match(await page.locator('[role="status"]').innerText(), /非微信图片/);
});

test('visible editable UEditor iframe imports and restores using frame events', async (t) => {
  const page = await fixture(t, '<iframe id="ueditor_0" style="width:600px;height:200px" srcdoc="<body contenteditable=\'true\'><p>旧框架正文</p></body>"></iframe>');
  await apply(page, '<p>框架新正文</p>');
  assert.equal(await page.frameLocator('iframe').locator('body').innerText(), '框架新正文');
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.frameLocator('iframe').locator('body').innerText(), '旧框架正文');
});

test('hidden and read-only UEditor frames are never used as a write target', async (t) => {
  for (const [style, editable] of [['display:none', 'true'], ['width:600px;height:200px', 'false']]) {
    const page = await fixture(t, `<iframe id="ueditor_0" style="${style}" srcdoc="<body contenteditable='${editable}'>只读正文</body>"></iframe>`);
    await apply(page, '<p>新正文</p>');
    assert.equal(await page.frameLocator('iframe').locator('body').textContent(), '只读正文');
    assert.match(await page.locator('[role="status"]').innerText(), /无法唯一确定/);
  }
});

test('floating entry migrates when toolbar appears; keyboard focus stays in dialog', async (t) => {
  const page = await fixture(t);
  await page.locator('textarea').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#oclaw-html-source-insert-btn').evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('textarea').evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const toolbar = document.createElement('div');
    toolbar.className = 'edui-toolbar';
    toolbar.style.cssText = 'width:600px;height:40px';
    document.body.prepend(toolbar);
  });
  await page.locator('.edui-toolbar #oclaw-html-source-button').waitFor();
  assert.equal(await page.locator('#oclaw-html-source-float-wrap').count(), 0);
  assert.equal(await page.locator('#oclaw-html-source-button').count(), 1);
});

const svgSnippet = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#16a34a"><animate attributeName="opacity" values="0.5;1" dur="1s" begin="click"/></rect></svg>';

test('insertion requires a remembered article position, with no whole-document fallback', async (t) => {
  const page = await fixture(t);
  await apply(page, svgSnippet, true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>原正文</p>');
  assert.match(await page.locator('[role="status"]').innerText(), /尚未定位/);
});

test('SVG splits the paragraph at the remembered caret and preserves surrounding nodes', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area"><div contenteditable="true"><p id="before">前一段</p><p id="target">甲乙丙丁</p><p id="after">后一段</p></div></div>');
  await page.evaluate(() => { window.beforeNode = document.getElementById('before'); window.afterNode = document.getElementById('after'); });
  await position(page, '#target', 2);
  await apply(page, svgSnippet, true);
  const editor = page.locator('[contenteditable]');
  assert.deepEqual(await editor.locator(':scope > *').evaluateAll((nodes) => nodes.map(node => [node.localName, node.textContent])), [
    ['p', '前一段'], ['p', '甲乙'], ['svg', ''], ['p', '丙丁'], ['p', '后一段'],
  ]);
  assert.equal(await page.evaluate(() => window.beforeNode === document.getElementById('before') && window.afterNode === document.getElementById('after')), true);
  assert.equal(await editor.locator('#target').count(), 1);
  assert.equal(await editor.locator('animate').getAttribute('begin'), 'click');
  assert.equal(await page.locator('.oclaw-modal').isVisible(), false);
  await page.locator('#oclaw-html-source-button').click();
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await editor.innerHTML(), '<p id="before">前一段</p><p id="target">甲乙丙丁</p><p id="after">后一段</p>');
});

test('inline HTML inserts inside a paragraph without deleting selected text', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area"><div contenteditable="true"><p>甲乙丙丁</p></div></div>');
  await position(page, '[contenteditable] p', 1, 3);
  await apply(page, '<strong>新增</strong>', true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>甲乙丙<strong>新增</strong>丁</p>');
});

test('SVG splits formatted text and root-level inline wrappers without swallowing formatting', async (t) => {
  for (const html of ['<p>前<strong>粗体文字</strong>后</p>', '<strong>粗体文字</strong>']) {
    const page = await fixture(t, `<div class="js_editor_area"><div contenteditable="true">${html}</div></div>`);
    await position(page, '[contenteditable] strong', 2);
    await apply(page, svgSnippet, true);
    assert.equal(await page.locator('[contenteditable] svg').count(), 1);
    assert.equal(await page.locator('[contenteditable] p svg,[contenteditable] strong svg').count(), 0);
    assert.deepEqual(await page.locator('[contenteditable] strong').allTextContents(), ['粗体', '文字']);
  }
});

test('insertion at document boundaries and empty paragraphs preserves text', async (t) => {
  for (const [selector, offset] of [['[contenteditable]', 0], ['[contenteditable]', 2], ['#empty', 0]]) {
    const page = await fixture(t, '<div class="js_editor_area"><div contenteditable="true"><p>正文</p><p id="empty"><br></p></div></div>');
    await position(page, selector, offset);
    await apply(page, svgSnippet, true);
    assert.equal(await page.locator('[contenteditable] svg').count(), 1);
    assert.equal(await page.locator('[contenteditable]').textContent(), '正文');
    assert.equal(await page.locator('[contenteditable] p svg').count(), 0);
  }
});

test('changed content, replaced nodes and changed article addresses invalidate the position', async (t) => {
  for (const mutation of ['content', 'nodes', 'address']) {
    const page = await fixture(t);
    await position(page, '[contenteditable] p', 1);
    await page.evaluate((mutation) => {
      const editor = document.querySelector('[contenteditable]');
      if (mutation === 'address') location.hash = 'another-article';
      else editor.innerHTML = mutation === 'nodes' ? editor.innerHTML : '<p>修改后的正文</p>';
    }, mutation);
    const before = await page.locator('[contenteditable]').innerHTML();
    await apply(page, svgSnippet, true);
    assert.equal(await page.locator('[contenteditable]').innerHTML(), before);
    assert.match(await page.locator('[role="status"]').innerText(), /插入位置已失效/);
  }
});

test('an unrelated input does not reuse the old article caret', async (t) => {
  const page = await fixture(t, '<input id="title"><div class="js_editor_area"><div contenteditable="true"><p>正文</p></div></div>');
  await position(page, '[contenteditable] p', 1);
  await page.locator('#oclaw-html-source-cancel-btn').click();
  await page.locator('#title').fill('文章标题');
  await page.locator('#oclaw-html-source-button').click();
  await apply(page, svgSnippet, true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>正文</p>');
});

test('empty insertion preserves content and an existing backup', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>替换后的正文</p>');
  await position(page, '[contenteditable] p', 2);
  await apply(page, '<script>alert(1)</script>', true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>替换后的正文</p>');
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>原正文</p>');
});

test('iframe caret survives moving focus to the extension textarea', async (t) => {
  const page = await fixture(t, '<iframe id="ueditor_0" style="width:600px;height:200px" srcdoc="<body contenteditable=\'true\'><p>框架正文</p></body>"></iframe>');
  await position(page, 'p', 2, 2, page.frameLocator('iframe'));
  await apply(page, svgSnippet, true);
  assert.equal(await page.frameLocator('iframe').locator('svg').count(), 1);
  assert.deepEqual(await page.frameLocator('iframe').locator('p').allTextContents(), ['框架', '正文']);
});

test('real ProseMirror records inserted SVG between text and survives model reopen', async (t) => {
  const page = await fixture(t, '<div class="js_editor_area"></div>');
  await mountProseMirror(page);
  await position(page, '.ProseMirror p', 4);
  await apply(page, svgSnippet, true);
  await page.waitForFunction(() => window.view.state.doc.childCount === 3 && window.view.state.doc.child(1).type.name === 'svg');
  assert.equal(await page.evaluate(() => window.view.state.doc.textContent), '真实模型原正文');
  const saved = await page.evaluate(() => window.view.state.doc.toJSON());
  await page.evaluate((json) => window.reopen(json), saved);
  assert.equal(await page.locator('.ProseMirror svg animate').getAttribute('begin'), 'click');
  assert.deepEqual(await page.locator('.ProseMirror p').allTextContents(), ['真实模型', '原正文']);
});

test('keyboard opening preserves the article caret before textarea focus', async (t) => {
  const page = await fixture(t);
  await position(page, '[contenteditable] p', 1);
  await page.locator('#oclaw-html-source-cancel-btn').click();
  await page.locator('[contenteditable] p').evaluate((element) => {
    element.parentElement.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, 1);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#oclaw-html-source-button').evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press('Enter');
  await apply(page, '<span>插入</span>', true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>原<span>插入</span>正文</p>');
});

test('insertion sanitizes unsafe HTML while preserving original content and SVG animation', async (t) => {
  const page = await fixture(t);
  await position(page, '[contenteditable] p', 1);
  await apply(page, `<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">新增</a>${svgSnippet}`, true);
  assert.match(await page.locator('#oclaw-html-source-message').textContent(), /已移除/);
  assert.equal(await page.locator('[contenteditable]').textContent(), '原新增正文');
  assert.doesNotMatch(await page.locator('[contenteditable]').innerHTML(), /<script|onclick|javascript:/);
  assert.equal(await page.locator('[contenteditable] animate').getAttribute('begin'), 'click');
});

test('repeated replacements and insertion remain restorable without dialogs', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>第一稿</p>');
  await apply(page, '<p>第二稿</p>');
  await position(page, '[contenteditable] p', 1);
  await apply(page, '<span>插入</span>', true);
  await page.locator('#oclaw-html-source-button').click();
  await page.locator('#oclaw-html-source-restore-btn').click();
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>第二稿</p>');
});

test('first and repeated insertions and replacement are direct', async (t) => {
  const page = await fixture(t);
  await position(page, '[contenteditable] p', 1);
  await apply(page, '<span>新增</span>', true);
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>原<span>新增</span>正文</p>');
  await page.locator('#oclaw-html-source-button').click();
  await position(page, '[contenteditable] p', 0);
  await apply(page, '<span>再次</span>', true);
  assert.equal(await page.locator('[contenteditable]').textContent(), '再次原新增正文');
  await page.locator('#oclaw-html-source-button').click();
  await apply(page, '<p>替换</p>');
  assert.equal(await page.locator('[contenteditable]').textContent(), '替换');
});

test('replacement works after the article address or editor node changes', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>第一篇</p>');
  await page.evaluate(() => { location.hash = 'new-article'; });
  await apply(page, '<p>第二篇</p>');
  assert.equal(await page.locator('[contenteditable]').textContent(), '第二篇');
  await page.evaluate(() => { document.querySelector('.js_editor_area').innerHTML = '<div contenteditable="true"><p>第三篇</p></div>'; });
  await apply(page, '<p>第三篇修改</p>');
  assert.equal(await page.locator('[contenteditable]').textContent(), '第三篇修改');
});

test('replacement works after reload and compatibility warnings remain inline', async (t) => {
  const page = await fixture(t);
  await apply(page, '<p>初稿</p>');
  await page.locator('textarea').fill('<p onclick="alert(1)">下一稿</p>');
  assert.match(await page.locator('[role="status"]').innerText(), /已移除/);
  await apply(page, '<p onclick="alert(1)">下一稿</p>');
  assert.equal(await page.locator('[contenteditable]').innerHTML(), '<p>下一稿</p>');
  await page.reload();
  await page.setContent('<div class="js_editor_area"><div contenteditable="true"><p>重开</p></div></div>');
  await page.addScriptTag({ path: path.join(__dirname, '../content.js') });
  await page.locator('#oclaw-html-source-button').click();
  await apply(page, '<p>刷新后</p>');
  assert.equal(await page.locator('[contenteditable]').textContent(), '刷新后');
});
