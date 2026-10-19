export const REEL_COUNT = 24;
export const SLOT_COUNT = 16;

const PRODUCTS = [
  ['Sony', 'WH-1000XM5', 'Wireless Noise Cancelling Headphones', 'Electronics', '$299.99', '$399.99', '25% OFF', '4.7', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85'],
  ['Apple', 'AirPods Pro 2', 'Wireless Earbuds with USB-C', 'Electronics', '$189.99', '$249.00', '24% OFF', '4.6', 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85'],
  ['Kindle', 'Paperwhite', '16 GB E-reader with adjustable warm light', 'Books', '$134.99', '$169.99', '21% OFF', '4.7', 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=85'],
  ['Anker', '737 Power Bank', 'PowerCore 24,000mAh portable charger', 'Tech accessories', '$99.99', '$149.99', '33% OFF', '4.6', 'https://images.unsplash.com/photo-1609592424858-2cbf3a3e9d3d?auto=format&fit=crop&w=900&q=85'],
  ['Logitech', 'MX Master 3S', 'Wireless performance mouse', 'Office', '$79.99', '$99.99', '20% OFF', '4.8', 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=85'],
  ['Ninja', 'Air Fryer Pro', '6-in-1 5 QT digital air fryer', 'Kitchen', '$89.99', '$129.99', '31% OFF', '4.7', 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=85'],
  ['LEGO', 'Botanical Collection', 'Wildflower Bouquet building set', 'Home', '$44.99', '$59.99', '25% OFF', '4.9', 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=900&q=85'],
  ['Stanley', 'Quencher H2.0', 'FlowState insulated tumbler 40 oz', 'Lifestyle', '$34.95', '$45.00', '22% OFF', '4.8', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'],
  ['Samsung', 'T7 Shield', '1TB portable SSD USB 3.2', 'Computing', '$84.99', '$129.99', '35% OFF', '4.8', 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=900&q=85'],
  ['Bose', 'SoundLink Flex', 'Portable Bluetooth speaker', 'Audio', '$119.00', '$149.00', '20% OFF', '4.7', 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85'],
  ['Razer', 'BlackShark V2', 'Pro wireless gaming headset', 'Gaming', '$129.99', '$179.99', '28% OFF', '4.5', 'https://images.unsplash.com/photo-1599669454699-248893623440?auto=format&fit=crop&w=900&q=85'],
  ['Hydro Flask', 'Wide Mouth', '32 oz insulated water bottle', 'Lifestyle', '$29.95', '$39.95', '25% OFF', '4.8', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'],
];

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
  const reels = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const [brand, model, title, category, price, oldPrice, discount, rating, image] = PRODUCTS[i % PRODUCTS.length];
    const productTitle = `${brand} ${model}`;
    reels.push({
      id: `reel-${i}`,
      index: i,
      title: productTitle,
      description: title,
      author: category,
      brand,
      category,
      price,
      oldPrice,
      discount,
      rating,
      merchant: 'Amazon marketplace',
      cover: image || coverSvg(i, productTitle),
      preview: image || coverSvg(i + 100, productTitle),
      src: `/demo/reel-${i % 14}.mp4`,
      views: 'Offer pick',
      href: `https://www.amazon.com/s?k=${encodeURIComponent(productTitle)}`,
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
  const loadImage = (src) =>
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
  const loadVideo = (src) => new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadeddata = () => { tick(); resolve(); };
    video.onerror = () => { tick(); resolve(); };
    video.src = src;
  });
  const all = reels.flatMap((r) => [loadImage(r.cover), loadVideo(r.src)]);
  return { total, done: Promise.all(all) };
}
