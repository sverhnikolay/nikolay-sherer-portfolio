const { chromium } = require('playwright');
const assert = require('node:assert/strict');
async function main() {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({viewport:{width,height:844},hasTouch:width<1000,isMobile:width<1000});
      await page.goto(process.argv[2] || 'http://127.0.0.1:4173/',{waitUntil:'networkidle'});
      await page.locator('.journey').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1800);
      const samples = await page.evaluate(async () => {
        const point = document.querySelector('.journey-line span');
        const nodes = [...document.querySelectorAll('.journey-node')];
        const samples = [];
        for (let i=0; i<105; i++) {
          const rect = point.getBoundingClientRect();
          const centers = nodes.map(node => {const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
          const first = Math.hypot(rect.x+rect.width/2-centers[0].x,rect.y+rect.height/2-centers[0].y);
          const last = Math.hypot(rect.x+rect.width/2-centers[5].x,rect.y+rect.height/2-centers[5].y);
          samples.push({time:performance.now(),first,last,active:nodes.findIndex(node=>node.parentElement.classList.contains('is-active'))});
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        return samples;
      });
      for (const endpoint of ['first','last']) {
        const held = samples.filter(sample=>sample[endpoint]<2);
        assert.ok(held.length>=12,`${width}: missing ${endpoint} hold or point/node misaligned`);
        assert.ok(held.every(sample=>sample.active===(endpoint==='first'?0:5)));
      }
      assert.ok(samples.some(sample=>sample.active===2),'Intermediate stages still activate');
      console.log(JSON.stringify({width,firstHoldSamples:samples.filter(s=>s.first<2).length,lastHoldSamples:samples.filter(s=>s.last<2).length,passed:true}));
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
