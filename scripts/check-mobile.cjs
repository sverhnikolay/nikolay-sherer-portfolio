const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

async function main() {
  const url = process.argv[2] || 'http://127.0.0.1:4173/';
  const baseline = process.argv.includes('--baseline');
  const dir = path.join(os.tmpdir(), 'portfolio-mobile-qa');
  fs.mkdirSync(dir, {recursive:true});
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
    await cdp.send('Performance.enable');
    await page.goto(url, {waitUntil:'networkidle'});
    await page.waitForTimeout(1200);
    const initialBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.encodedBodySize,0));
    await page.screenshot({path:path.join(dir,baseline?'before-hero.png':'after-hero.png')});
    await page.locator('.agent-chat-window').scrollIntoViewIfNeeded();
    await page.waitForTimeout(2400);
    const typingVisible = await page.locator('.agent-message.is-visible').count();
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.chatMutations = 0;
      window.chatWatch = new MutationObserver(records => { window.chatMutations += records.length; });
      window.chatWatch.observe(document.querySelector('[data-agent-chat]'), {subtree:true,childList:true,characterData:true,attributes:true});
    });
    const before = await cdp.send('Performance.getMetrics');
    await page.waitForTimeout(2200);
    const after = await cdp.send('Performance.getMetrics');
    const state = await page.evaluate(() => ({
      chatMutations:window.chatMutations,
      atmosphereAnimations:document.getAnimations().filter(a=>a.playState==='running' && a.effect?.target?.closest?.('.site-atmosphere')).length,
      marqueeState:getComputedStyle(document.querySelector('.marquee-track')).animationPlayState,
      mobileBlur:getComputedStyle(document.querySelector('.nav-shell')).backdropFilter,
      projects:document.querySelectorAll('.project-tile').length,
    }));
    if (!baseline) {
      assert.equal(state.chatMutations,0,'Chat must stop offscreen');
      assert.equal(state.atmosphereAnimations,0,'No full-screen background animations on touch');
      assert.equal(state.marqueeState,'paused');
      assert.equal(state.mobileBlur,'none');
      assert.ok(typingVisible>0,'Chat runs when visible');
      assert.equal(state.projects,6);
    }
    const widths = [];
    for (const width of [360,390,768,1440]) {
      await page.setViewportSize({width,height:844});
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      widths.push({width,overflow});
      if (!baseline) assert.equal(overflow,false,`Overflow at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.journey').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
    await page.screenshot({path:path.join(dir,baseline?'before-process.png':'after-process.png')});
    if (!baseline) {
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.locator('.menu-toggle').click();
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
      await page.locator('.mobile-menu a[href="#cases"]').click();
      assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
      assert.deepEqual(errors,[]);
    }
    const metric = (data,name) => data.metrics.find(m=>m.name===name).value;
    console.log(JSON.stringify({url,baseline,initialBytes,typingVisible,...state,widths,errors,idleTaskMs:Math.round((metric(after,'TaskDuration')-metric(before,'TaskDuration'))*1000),screenshots:dir},null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
