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
  ['Apple', 'Watch Series 10', 'Smartwatch with fitness and health tracking', 'Wearables', '$399.00', '$429.00', '7% OFF', '4.6', 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=85'],
  ['Meta', 'Quest 3S', 'Mixed reality headset with immersive gaming', 'Gaming', '$299.99', '$299.99', 'NEW', '4.5', 'https://images.unsplash.com/photo-1626379953822-baec19c3accd?auto=format&fit=crop&w=900&q=85'],
  ['DJI', 'Osmo Pocket 3', '4K handheld creator camera with gimbal', 'Cameras', '$519.00', '$599.00', '13% OFF', '4.7', 'https://images.unsplash.com/photo-1606986628253-5e44a06c7c4f?auto=format&fit=crop&w=900&q=85'],
  ['Dyson', 'V15 Detect', 'Cordless vacuum with laser dust detection', 'Home', '$649.99', '$749.99', '13% OFF', '4.6', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=85'],
  ['Philips Hue', 'Starter Kit', 'Smart color ambiance lighting pack', 'Smart home', '$89.99', '$119.99', '25% OFF', '4.5', 'https://images.unsplash.com/photo-1558008258-3256797b43f3?auto=format&fit=crop&w=900&q=85'],
  ['Instant Pot', 'Pro Plus', '6-quart smart pressure cooker', 'Kitchen', '$119.95', '$169.95', '29% OFF', '4.7', 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=85'],
  ['Google', 'Pixel 9 Pro', 'AI-powered smartphone with pro camera', 'Mobile', '$899.00', '$999.00', '10% OFF', '4.4', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=85'],
  ['Bialetti', 'Moka Express', 'Classic stovetop espresso maker', 'Kitchen', '$34.99', '$49.99', '30% OFF', '4.8', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=900&q=85'],
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

function productFallback(i, title, category, price) {
  const { a, b, c, angle } = gradientFor(i + 31);
  const safe = String(title).replace(/[<>&]/g, '');
  const safeCategory = String(category).replace(/[<>&]/g, '');
  const safePrice = String(price).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
  <defs><linearGradient id="g" gradientTransform="rotate(${angle})"><stop stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="24"/></filter></defs>
  <rect width="540" height="960" fill="url(#g)"/><circle cx="420" cy="180" r="140" fill="#fff" opacity=".18" filter="url(#blur)"/><circle cx="120" cy="600" r="180" fill="#000" opacity=".22" filter="url(#blur)"/>
  <rect x="82" y="170" width="376" height="370" rx="42" fill="#ffffff18" stroke="#ffffff70" stroke-width="3"/><circle cx="270" cy="330" r="106" fill="#0b1020aa" stroke="#ffffff88" stroke-width="4"/><circle cx="270" cy="330" r="52" fill="#ffffff22"/><path d="M205 404 Q270 450 335 404" fill="none" stroke="#fff" stroke-width="5" opacity=".7"/>
  <text x="36" y="740" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="#fff">${safe}</text><text x="36" y="785" font-family="monospace" font-size="18" fill="#fff" opacity=".75">${safeCategory}</text><text x="36" y="860" font-family="monospace" font-size="28" fill="#fff">${safePrice}</text><text x="36" y="910" font-family="monospace" font-size="15" fill="#fff" opacity=".65">REELRING MARKETPLACE</text></svg>`;
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
      fallbackCover: productFallback(i, productTitle, category, price),
      fallbackPreview: productFallback(i + 100, productTitle, category, price),
      src: `/demo/reel-${i % 14}.mp4`,
      views: 'Offer pick',
      amazonUrl: `https://www.amazon.com/s?k=${encodeURIComponent(productTitle)}`,
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
