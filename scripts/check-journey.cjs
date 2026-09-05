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
      console.log(JSON.stringify({width,states,passed:true}));
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
