export const REEL_COUNT = 36;
export const SLOT_COUNT = 16;

const ADJ = ['NEON', 'VOID', 'SLOW', 'RAW', 'ACID', 'GHOST', 'ULTRA', 'NIGHT', 'FLUX', 'PRISM', 'ECHO', 'HYPER'];
const NOUN = ['DRIFT', 'SIGNAL', 'RUNNER', 'BLOOM', 'CIRCUIT', 'TIDE', 'STATIC', 'MIRAGE', 'PULSE', 'ORBIT', 'FRACTURE', 'GLASS'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ['#ff2d55', '#7928ca', '#0a0a0f'],
  ['#00f0ff', '#0055ff', '#05050a'],
  ['#f9f871', '#ff3d81', '#120018'],
  ['#00ffa3', '#0077ff', '#02060f'],
  ['#ff7a00', '#ff0055', '#0b0014'],
  ['#a18cd1', '#fbc2eb', '#0d0a14'],
  ['#43e97b', '#38f9d7', '#001018'],
  ['#fa709a', '#fee140', '#140010'],
];

function gradientFor(i) {
  const [a, b, c] = PALETTES[i % PALETTES.length];
  const angle = 120 + ((i * 47) % 120);
  return { a, b, c, angle };
}

export function coverSvg(i, title) {
  const { a, b, c, angle } = gradientFor(i);
  const rand = mulberry32(i * 999 + 7);
  const cx = 20 + rand() * 60;
  const cy = 20 + rand() * 50;
  const r1 = 30 + rand() * 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
<defs>
<linearGradient id="g" gradientTransform="rotate(${angle})">
<stop offset="0%" stop-color="${a}"/><stop offset="55%" stop-color="${b}"/><stop offset="100%" stop-color="${c}"/>
</linearGradient>
<radialGradient id="glow" cx="${cx}%" cy="${cy}%" r="${r1}%">
<stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.14"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>
</defs>
<rect width="540" height="960" fill="url(#g)"/>
<rect width="540" height="960" fill="url(#glow)"/>
<circle cx="${140 + rand() * 260}" cy="${200 + rand() * 400}" r="${60 + rand() * 120}" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
<circle cx="${100 + rand() * 340}" cy="${300 + rand() * 400}" r="${20 + rand() * 60}" fill="#ffffff" fill-opacity="0.12"/>
<rect width="540" height="960" filter="url(#n)" opacity="0.5"/>
<text x="36" y="880" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="34" letter-spacing="6" fill="#ffffff" fill-opacity="0.9">${title}</text>
<text x="36" y="920" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" letter-spacing="4" fill="#ffffff" fill-opacity="0.5">REEL ${String(i + 1).padStart(2, '0')}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildReels() {
  const rand = mulberry32(20261018);
  const reels = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const title = `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`;
    reels.push({
      id: `reel-${i}`,
      index: i,
      title,
      author: `@${title.toLowerCase().replace(/\s+/g, '.')}.${100 + Math.floor(rand() * 900)}`,
      cover: coverSvg(i, title),
      preview: coverSvg(i + 100, title),
      src: `/demo/reel-${i % 14}.mp4`,
      views: `${(rand() * 9.2 + 0.3).toFixed(1)}M`,
      href: `#reel-${i}`,
    });
  }
  return reels;
}

export function preloadReels(reels, onSettled) {
  let settled = 0;
  const total = reels.length * 2;
  const tick = () => {
    settled += 1;
    onSettled(settled, total);
  };
  const load = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        tick();
        resolve();
      };
      img.onerror = () => {
        tick();
        resolve();
      };
      img.src = src;
    });
  const all = reels.flatMap((r) => [load(r.cover), load(r.preview)]);
  return { total, done: Promise.all(all) };
}
