const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'js', 'avatar_catalog.js');
const outputDir = path.join(root, 'assets', 'avatar_layers');
const outputJs = path.join(root, 'js', 'avatar_assets.js');
const WIDTH = 96;
const HEIGHT = 128;
const ART_SCALE = 0.62;

function loadCatalog() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(catalogPath, 'utf8'), context, { filename: 'js/avatar_catalog.js' });
  if (!context.Game || !context.Game.AvatarCatalog) {
    throw new Error('Expected Game.AvatarCatalog to be defined');
  }
  return context.Game.AvatarCatalog;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(hash, colors) {
  return colors[hash % colors.length];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function directionPose(direction) {
  const poses = {
    N: { x: -2, y: -5, scaleX: 0.82, scaleY: 0.92, skewY: -5 },
    NE: { x: 2, y: -3, scaleX: 0.9, scaleY: 0.96, skewY: -2 },
    E: { x: 7, y: -1, scaleX: 0.72, scaleY: 1, skewY: 0 },
    SE: { x: 4, y: 2, scaleX: 0.88, scaleY: 1.02, skewY: 3 },
    S: { x: 0, y: 3, scaleX: 1, scaleY: 1, skewY: 0 },
  };
  return poses[direction] || poses.S;
}

function paletteFor(item) {
  const hash = hashText(`${item.form}:${item.slot}:${item.value}`);
  const formPalettes = {
    human: ['#d9a06f', '#6d8fbf', '#29313d', '#f1c957', '#2f6f52', '#bf6a8c'],
    witch: ['#c98f70', '#6c4a8d', '#202935', '#f0c34a', '#3f7fb8', '#a85da4'],
    robot: ['#9aa7b0', '#34465a', '#5ec9d7', '#f0a33a', '#6f7580', '#c94f4f'],
    cat: ['#b57942', '#262a30', '#f1e2be', '#d98034', '#ffffff', '#d64a4a'],
    banana: ['#f0cf4f', '#d8ad35', '#75a843', '#2b1f12', '#ef7d42', '#f6ef8a'],
  };
  const base = formPalettes[item.form] || formPalettes.human;
  return {
    primary: pick(hash, base),
    secondary: pick(hash >>> 3, base),
    accent: pick(hash >>> 7, base),
    dark: '#16191f',
    light: '#fff3c6',
  };
}

function valueMark(item) {
  if (item.value === 'none') return '';
  const hash = hashText(item.value);
  if (item.value.includes('stripe') || hash % 5 === 0) return '<path d="M32 72 L64 66" stroke="#ffffff" stroke-width="5" opacity="0.42"/>';
  if (item.value.includes('spot') || hash % 5 === 1) return '<circle cx="56" cy="58" r="5" fill="#2a1e17" opacity="0.42"/><circle cx="42" cy="79" r="4" fill="#2a1e17" opacity="0.32"/>';
  if (item.value.includes('star') || hash % 5 === 2) return '<path d="M49 53 l3 7 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z" fill="#fff4a8" opacity="0.85"/>';
  if (item.value.includes('flower') || hash % 5 === 3) return '<circle cx="58" cy="42" r="4" fill="#f49ac2"/><circle cx="62" cy="46" r="4" fill="#f49ac2"/><circle cx="54" cy="46" r="4" fill="#f49ac2"/><circle cx="58" cy="46" r="2" fill="#f7d85c"/>';
  return '<rect x="42" y="65" width="12" height="6" rx="3" fill="#ffffff" opacity="0.35"/>';
}

function layerShape(item) {
  const c = paletteFor(item);
  if (item.value === 'none') return '';

  const common = {
    body: `<ellipse cx="48" cy="60" rx="18" ry="23" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/><path d="M32 84 C38 94 58 94 64 84 L60 113 L36 113 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>`,
    hair: `<path d="M28 51 C29 30 67 30 68 52 C64 44 58 41 49 43 C39 44 34 47 28 51 Z" fill="${c.secondary}" stroke="${c.dark}" stroke-width="3"/>`,
    top: `<path d="M30 70 C36 62 60 62 66 70 L62 101 L34 101 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>${valueMark(item)}`,
    bottom: `<path d="M35 97 L46 97 L45 119 L32 119 Z M50 97 L61 97 L64 119 L51 119 Z" fill="${c.secondary}" stroke="${c.dark}" stroke-width="3"/>`,
    shoes: `<path d="M28 119 L46 119 L47 124 L26 124 Z M50 119 L68 119 L70 124 L49 124 Z" fill="${c.dark}"/>`,
    hat: `<path d="M26 48 L70 48 L64 42 L32 42 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/><path d="M38 42 L45 14 L57 42 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>`,
    accessory: `<path d="M68 68 C80 76 77 95 65 100" fill="none" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>${valueMark(item)}`,
  };

  if (item.form === 'robot') {
    const robot = {
      chassis: `<rect x="30" y="45" width="36" height="53" rx="12" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/><rect x="36" y="56" width="24" height="16" rx="4" fill="${c.accent}" opacity="0.85"/>`,
      headModule: `<rect x="34" y="23" width="28" height="25" rx="8" fill="${c.secondary}" stroke="${c.dark}" stroke-width="3"/><circle cx="43" cy="36" r="3" fill="${c.accent}"/><circle cx="54" cy="36" r="3" fill="${c.accent}"/>`,
      torsoTrim: `<path d="M34 70 H62" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>${valueMark(item)}`,
      legTrim: `<path d="M37 96 L34 119 H45 L47 96 Z M49 96 L51 119 H62 L59 96 Z" fill="${c.secondary}" stroke="${c.dark}" stroke-width="3"/>`,
      face: `<path d="M40 39 Q48 45 56 39" fill="none" stroke="${c.accent}" stroke-width="3" stroke-linecap="round"/>`,
      accessory: common.accessory,
    };
    return robot[item.slot] || common.accessory;
  }

  if (item.form === 'cat') {
    const cat = {
      coat: `<ellipse cx="48" cy="74" rx="23" ry="32" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>${valueMark(item)}`,
      ears: `<path d="M32 45 L39 22 L47 47 Z M49 47 L57 22 L65 45 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>`,
      face: `<circle cx="40" cy="59" r="3" fill="${c.dark}"/><circle cx="56" cy="59" r="3" fill="${c.dark}"/><path d="M42 70 Q48 75 54 70" fill="none" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>`,
      collar: `<path d="M31 82 Q48 91 65 82" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>`,
      hat: common.hat,
      accessory: common.accessory,
    };
    return cat[item.slot] || common.accessory;
  }

  if (item.form === 'banana') {
    const banana = {
      peel: `<path d="M50 13 C72 38 67 95 42 119 C35 107 33 72 38 45 C41 28 44 18 50 13 Z" fill="${c.primary}" stroke="${c.dark}" stroke-width="3"/>${valueMark(item)}`,
      face: `<circle cx="48" cy="57" r="3" fill="${c.dark}"/><circle cx="58" cy="58" r="3" fill="${c.dark}"/><path d="M48 72 Q55 78 62 72" fill="none" stroke="${c.dark}" stroke-width="3" stroke-linecap="round"/>`,
      hat: common.hat,
      accessory: common.accessory,
    };
    return banana[item.slot] || common.accessory;
  }

  return common[item.slot] || common.accessory;
}

function renderSvg(item, direction) {
  const pose = directionPose(direction);
  const shape = layerShape(item);
  const transform = [
    `translate(${pose.x} ${pose.y})`,
    'translate(48 116)',
    `skewY(${pose.skewY})`,
    `scale(${(pose.scaleX * ART_SCALE).toFixed(3)} ${(pose.scaleY * ART_SCALE).toFixed(3)})`,
    'translate(-48 -116)',
  ].join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-label="${escapeXml(item.id)}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="none"/>
  <g transform="${transform}">${shape}</g>
</svg>`;
}

function textureEntries(catalog) {
  const entries = [];
  const items = Object.values(catalog.ITEMS).sort((a, b) => a.id.localeCompare(b.id));
  for (const item of items) {
    for (const direction of catalog.DIRECTIONS) {
      entries.push({
        key: item.textures[direction],
        item,
        direction,
      });
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

async function writePngs(entries) {
  fs.mkdirSync(outputDir, { recursive: true });
  // assets/avatar_layers is fully generated from the catalog and owned by this script.
  for (const file of fs.readdirSync(outputDir)) {
    if (file.endsWith('.png')) fs.unlinkSync(path.join(outputDir, file));
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  try {
    for (const entry of entries) {
      const svg = renderSvg(entry.item, entry.direction);
      await page.setContent(`<!doctype html><style>html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:transparent}#stage{width:${WIDTH}px;height:${HEIGHT}px;background:transparent}</style><div id="stage">${svg}</div>`);
      await page.locator('#stage').screenshot({
        path: path.join(outputDir, `${entry.key}.png`),
        omitBackground: true,
      });
    }
  } finally {
    await browser.close();
  }
}

function writeAssetModule(entries) {
  const lines = [
    '// ============================================================',
    '// SimLife - Generated Avatar Layer Assets',
    '// Generated by scripts/generate-avatar-assets.js',
    '// ============================================================',
    'window.SIM_AVATAR_ASSETS = {',
  ];
  for (const entry of entries) {
    const data = fs.readFileSync(path.join(outputDir, `${entry.key}.png`)).toString('base64');
    lines.push(`  ${JSON.stringify(entry.key)}: "data:image/png;base64,${data}",`);
  }
  lines.push('};');
  lines.push('');
  fs.writeFileSync(outputJs, lines.join('\n'));
}

async function main() {
  const catalog = loadCatalog();
  const entries = textureEntries(catalog);
  await writePngs(entries);
  writeAssetModule(entries);
  console.log(JSON.stringify({ ok: true, count: entries.length }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
