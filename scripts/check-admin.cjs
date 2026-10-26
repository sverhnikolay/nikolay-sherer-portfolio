const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const origin = process.argv[2] || 'http://127.0.0.1:8788';
  const stateDir = process.argv[3] || path.join(process.cwd(), '.cms-data', 'browser-qa');
  const screenshots = path.join(os.tmpdir(), 'portfolio-admin-qa');
  fs.mkdirSync(screenshots, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const tokenFile = path.join(stateDir, 'setup-token');
    const password = 'Browser-qa-password-1234';
    await page.goto(origin + '/admin/' + (fs.existsSync(tokenFile) ? '#setup=' + fs.readFileSync(tokenFile, 'utf8').trim() : ''), {waitUntil: 'networkidle'});
    if (fs.existsSync(tokenFile)) {
      await page.locator('#password').fill(password);
      await page.locator('#password-confirm').fill(password);
    } else {
      await page.locator('#password').fill(password);
    }
    await page.locator('#login-button').click();
    await page.locator('#app').waitFor({state: 'visible'});
    await page.screenshot({path: path.join(screenshots, 'desktop.png'), fullPage: false});
    for (const section of ['hero', 'services', 'agent', 'portfolio', 'process', 'guarantees', 'faq', 'contact', 'site', 'documents', 'settings']) {
      await page.locator(`[data-section="${section}"]`).click();
      await page.locator('#editor h1').waitFor();
      assert.equal(await page.locator('#editor').innerText().then(x => x.includes('undefined')), false, section);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${section} overflow`);
    }
    await page.locator('[data-section="portfolio"]').click();
    const initialCount = await page.locator('.repeat-item').count();
    await page.locator('[data-add="portfolio.items"]').click();
    assert.equal(await page.locator('.repeat-item').count(), initialCount + 1);
    await page.locator(`[data-field="portfolio.items.${initialCount}.title"]`).fill('Тестовый проект из админки');
    await page.locator('#draft').click();
    await page.getByRole('status').filter({hasText: 'Черновик сохранён'}).first().waitFor();
    const publicPage = await context.newPage();
    await publicPage.goto(origin + '/?qa', {waitUntil: 'networkidle'});
    assert.equal(await publicPage.locator('.project-tile').count(), initialCount);
    const previewPromise = context.waitForEvent('page');
    await page.locator('#preview').click();
    const preview = await previewPromise;
    await preview.waitForURL('**/admin/preview');
    assert.equal(await preview.locator('.project-tile').count(), initialCount + 1);
    await preview.close();
    await page.locator('#publish').click();
    await page.locator('#save-state').filter({hasText: 'Все изменения опубликованы'}).waitFor();
    await publicPage.reload({waitUntil: 'networkidle'});
    assert.equal(await publicPage.locator('.project-tile').count(), initialCount + 1);
    await publicPage.close();
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('[data-section="hero"]').click();
    await page.screenshot({path: path.join(screenshots, 'mobile.png'), fullPage: false});
    for (const section of ['hero','portfolio','faq','site','settings']) {
      await page.locator(`[data-section="${section}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `mobile ${section} overflow`);
      const sizes = await page.locator('#editor input:not([type="file"]), #editor textarea').evaluateAll(nodes => nodes.map(n => ({font: parseFloat(getComputedStyle(n).fontSize),height: n.getBoundingClientRect().height})));
      assert.ok(sizes.every(n => n.font >= 18 && n.height >= 54), `mobile ${section} readable fields`);
    }
    await page.locator('[data-section="portfolio"]').click();
    await page.locator(`[data-remove="portfolio.items"][data-index="${initialCount}"]`).click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.locator('#publish').click();
    await page.locator('#save-state').filter({hasText: 'Все изменения опубликованы'}).waitFor();
    const photo = path.join(process.cwd(), 'assets', 'favicon-64.png');
    await page.locator('[data-section="hero"]').click();
    await page.locator('[data-upload="hero.photo"]').setInputFiles(photo);
    await page.locator('[data-image-preview="hero.photo"][src^="/media/"]').waitFor();
    await page.locator('#draft').click();
    await page.locator('#save-state').filter({hasText: 'Черновик сохранён'}).waitFor();
    await page.locator('[data-section="settings"]').click();
    await page.locator('.history-row').first().waitFor();
    assert.ok(await page.locator('.history-row').count() >= 1);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ok: true, screenshots, initialProjects: initialCount, checks: ['first-use password', 'all 11 sections', 'add project', 'draft isolation', 'preview', 'publish', 'upload', 'history', 'readable mobile layout']}, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
