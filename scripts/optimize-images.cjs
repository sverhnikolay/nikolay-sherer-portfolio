// Run with sharp installed (or its directory supplied through NODE_PATH).
const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs');
const assets = path.join(__dirname, '..', 'assets');

async function main() {
  const images = [
    ['nikolay-photo', 940, 84],
    ['sherer-logo', 420, 90],
    ['process-backgrounds', 1200, 80],
    ['forma-fitness-landing', 1265, 84],
    ['rostok-child-center', 1265, 84],
    ['vetcare-clinic', 1265, 84],
    ['lex-partner-landing', 1265, 84],
    ['sluzhba-pereezdov-iota', 1265, 84],
    ['lapa-grooming-landing', 1265, 84],
  ];
  for (const [name, width, quality] of images) {
    const src = path.join(assets, `${name}.png`);
    const out = path.join(assets, `${name}.webp`);
    await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out);
    console.log(name, fs.statSync(src).size, '->', fs.statSync(out).size);
  }
  await sharp(path.join(assets, 'nikolay-photo.png')).resize({width:560}).webp({quality:82}).toFile(path.join(assets, 'nikolay-photo-mobile.webp'));
  await sharp(path.join(assets, 'favicon.png')).resize(64,64).png().toFile(path.join(assets,'favicon-64.png'));
  await sharp(path.join(assets, 'favicon.png')).resize(180,180).png().toFile(path.join(assets,'apple-touch-icon.png'));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
