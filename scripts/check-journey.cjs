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
        for (let i=0; i<165; i++) {
          const rect = point.getBoundingClientRect();
          const centers = nodes.map(node => {const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
          const distances = centers.map(center => Math.hypot(rect.x+rect.width/2-center.x,rect.y+rect.height/2-center.y));
          samples.push({time:performance.now(),distances,active:nodes.findIndex(node=>node.parentElement.classList.contains('is-active'))});
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        return samples;
      });
      const holds = samples.map(sample => sample.distances.findIndex(distance => distance < 2));
      for (let index = 0; index < 6; index++) {
        const held = samples.filter((sample, sampleIndex) => holds[sampleIndex] === index);
        assert.ok(held.length >= 12, `${width}: missing hold on step ${index + 1}`);
        assert.ok(held.every(sample => sample.active === index));
      }
      console.log(JSON.stringify({width,perStep:samples.reduce((counts, sample, index) => { const hold = holds[index]; if (hold >= 0) counts[hold] += 1; return counts; }, [0,0,0,0,0,0]),passed:true}));
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
