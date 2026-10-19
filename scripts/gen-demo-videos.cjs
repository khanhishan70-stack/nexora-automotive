const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'server', 'data', 'social.db');
const OUT_DIR = path.join(ROOT, 'public', 'demo');
const FONT = "'C\\:/Windows/Fonts/arialbd.ttf'";

const DEMO_PALETTES = [
  ['#ff2d55', '#7928ca', '#0a0a0f'],
  ['#00f0ff', '#0055ff', '#05050a'],
  ['#f9f871', '#ff3d81', '#120018'],
  ['#00ffa3', '#0077ff', '#02060f'],
  ['#ff7a00', '#ff0055', '#0b0014'],
  ['#a18cd1', '#fbc2eb', '#0d0a14'],
  ['#43e97b', '#38f9d7', '#001018'],
  ['#fa709a', '#fee140', '#140010'],
];

fs.mkdirSync(OUT_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

const rows = db
  .prepare("SELECT id, platform_video_id, title, duration FROM videos WHERE platform_video_id LIKE 'demo-%' ORDER BY platform_video_id")
  .all();
console.log('demo videos in db:', rows.length);

const hex = (c) => '0x' + c.replace('#', '');
const sanitize = (t) => String(t || 'REEL').replace(/[^A-Za-z0-9 .&-]/g, '').slice(0, 28);

for (const r of rows) {
  const i = Number(String(r.platform_video_id).split('-')[1]) || 0;
  const out = path.join(OUT_DIR, `reel-${i}.mp4`);
  const sec = Math.max(15, Math.min(150, Math.round((r.duration || 30000) / 1000)));
  const [a, b, c] = DEMO_PALETTES[i % DEMO_PALETTES.length];
  const title = sanitize(r.title);
  const label = `REEL ${String(i + 1).padStart(2, '0')}`;

  if (!(fs.existsSync(out) && fs.statSync(out).size > 40000)) {
    const src = `gradients=s=540x960:c0=${hex(a)}:c1=${hex(b)}:c2=${hex(c)}:nb_colors=3:speed=0.06:seed=${i * 17 + 3}:duration=${sec}`;
    const vf = [
      `drawtext=fontfile=${FONT}:text='${title}':x=(w-text_w)/2:y=h/2-92:fontsize=46:fontcolor=white@0.95:shadowcolor=black@0.35:shadowx=2:shadowy=2`,
      `drawtext=fontfile=${FONT}:text='${label}':x=(w-text_w)/2:y=h/2+2:fontsize=21:fontcolor=white@0.6:shadowcolor=black@0.3:shadowx=1:shadowy=1`,
      `noise=alls=6:allf=t`,
    ].join(',');
    try {
      execFileSync('ffmpeg', [
        '-y', '-v', 'error',
        '-f', 'lavfi', '-i', src,
        '-vf', vf,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
        '-pix_fmt', 'yuv420p', '-r', '15', '-an',
        '-movflags', '+faststart', '-t', String(sec),
        out,
      ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
      console.log(`OK   reel-${i}.mp4  ${sec}s  "${r.title}"  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    } catch (e) {
      const tail = String(e.stderr || e.message || '').split('\n').filter(Boolean).slice(-4).join(' | ');
      console.log(`FAIL reel-${i}.mp4: ${tail}`);
      continue;
    }
  } else {
    console.log(`SKIP reel-${i}.mp4 (exists)`);
  }
  db.prepare('UPDATE videos SET source_url = ? WHERE id = ?').run(`/demo/reel-${i}.mp4`, r.id);
}

const check = db.prepare("SELECT COUNT(*) n FROM videos WHERE platform_video_id LIKE 'demo-%' AND source_url LIKE '/demo/%'").get();
console.log(`db source_url set: ${check.n}/${rows.length}`);
db.close();
