const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const qaDir = process.env.PROCESS_QA_DIR;
  if (qaDir) fs.mkdirSync(qaDir, { recursive: true });
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({viewport:{width,height:844},hasTouch:width<1000,isMobile:width<1000});
      await page.goto(process.argv[2] || 'http://127.0.0.1:4173/',{waitUntil:'networkidle'});
      const timeline = page.locator('[data-scroll-process]');
      const stages = timeline.locator('[data-process-stage]');
      assert.equal(await stages.count(),6);
      assert.deepEqual(await timeline.locator('.scroll-process-node b').allTextContents(), ['1','2','3','4','5','6']);
      const layerOrder = await timeline.evaluate(element => ({
        rail: Number(getComputedStyle(element.querySelector('.scroll-process-rail')).zIndex),
        list: Number(getComputedStyle(element.querySelector('.scroll-process-list')).zIndex),
      }));
      assert.ok(layerOrder.list > layerOrder.rail, `${width}: rail must stay behind the nodes`);

      const states = [];
      for (let index = 0; index < 6; index++) {
        await stages.nth(index).evaluate(element => element.scrollIntoView({block:'center',behavior:'instant'}));
        await page.waitForTimeout(180);
        states.push(await page.evaluate(() => ({
          progress:Number(getComputedStyle(document.querySelector('[data-scroll-process]')).getPropertyValue('--process-progress')),
          reached:[...document.querySelectorAll('[data-process-stage]')].filter(stage=>stage.classList.contains('is-reached')).length,
          current:[...document.querySelectorAll('[data-process-stage]')].findIndex(stage=>stage.classList.contains('is-current')),
        })));
        if (qaDir && index === 2) {
          await page.screenshot({ path: path.join(qaDir, `process-${width}.png`) });
        }
      }

      states.forEach((state,index) => {
        assert.equal(state.current,index,`${width}: wrong current stage at ${index+1}`);
        assert.equal(state.reached,index+1,`${width}: wrong reached count at ${index+1}`);
        if (index) assert.ok(state.progress > states[index-1].progress,`${width}: progress did not grow`);
      });
      assert.ok(states[0].progress < 0.1);
      assert.ok(states.at(-1).progress > 0.9);
      const timelineOverflow = await timeline.evaluate(element => ({
        overflow: element.scrollWidth > element.clientWidth,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        widest: [...element.querySelectorAll('*')]
          .map(child => ({ className: child.className, left: child.getBoundingClientRect().left, right: child.getBoundingClientRect().right }))
          .sort((a, b) => b.right - a.right)[0],
      }));
      assert.equal(timelineOverflow.overflow,false,`${width}: timeline overflow ${JSON.stringify(timelineOverflow)}`);
      const artworkReady = await timeline.locator('.scroll-process-art').evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.every(image => image.naturalWidth >= 640);
      });
      assert.equal(artworkReady,true,`${width}: process artwork did not load`);
      assert.equal(
        await timeline.locator('.scroll-process-stage:last-child .scroll-process-art').evaluate(image => getComputedStyle(image).getPropertyValue('--art-flip').trim()),
        '-1',
        `${width}: launch artwork must be mirrored`,
      );

      const firstFaq = page.locator('.faq-list details').first();
      const firstSummary = firstFaq.locator('summary');
      await firstFaq.scrollIntoViewIfNeeded();
      assert.equal(await firstFaq.getAttribute('open'),null,`${width}: first FAQ must start closed`);
      const closedHeight = await firstFaq.evaluate(element => element.getBoundingClientRect().height);
      await firstSummary.click();
      await page.waitForTimeout(100);
      const openingHeight = await firstFaq.evaluate(element => element.getBoundingClientRect().height);
      await page.waitForTimeout(420);
      const openHeight = await firstFaq.evaluate(element => element.getBoundingClientRect().height);
      assert.ok(openingHeight > closedHeight && openingHeight < openHeight,`${width}: FAQ did not animate open`);
      await firstSummary.click();
      await page.waitForTimeout(100);
      const closingHeight = await firstFaq.evaluate(element => element.getBoundingClientRect().height);
      assert.ok(closingHeight < openHeight && closingHeight > closedHeight,`${width}: FAQ did not animate closed`);
      await page.waitForTimeout(420);
      assert.equal(await firstFaq.getAttribute('open'),null,`${width}: FAQ did not close`);

      const guaranteeIcons = page.locator('.guarantee-icon img');
      assert.equal(await guaranteeIcons.count(),4,`${width}: guarantee artwork count`);
      assert.equal(await page.locator('.guarantee-icon svg').count(),0,`${width}: legacy guarantee vectors remain`);
      await page.locator('#guarantees').scrollIntoViewIfNeeded();
      const guaranteeArtworkReady = await guaranteeIcons.evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.every(image => image.naturalWidth >= 512);
      });
      assert.equal(guaranteeArtworkReady,true,`${width}: guarantee artwork did not load`);
      if (qaDir) await page.screenshot({ path: path.join(qaDir, `guarantees-${width}.png`) });
      console.log(JSON.stringify({width,states,passed:true}));
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
