// T-Pay spot illustrations. One object each, no words, so they read without literacy.
//   node design/illustrations/gen.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, poly, frame, tiltFrame, uprightFrame, rrect, circle, makeCam, card, spark, arc, bbox } from './spotkit.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const WHITE = { front: C.white, left: C.white, back: C.white, right: C.teal, up: C.white, down: C.white, cap: C.white };
const PALE = { front: C.pale, left: C.pale, back: C.pale, right: C.mid, up: C.pale, down: C.pale, cap: C.white };
const ACCENT = { front: C.tealD, left: C.tealD, back: C.tealD, right: C.deep, up: C.teal, down: C.teal, cap: C.teal };
const naira = (c, w = 2.6) => `<path d="M-5,7V-7L5,7V-7M-8,-2H8M-8,2.4H8" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const tick = (c, w = 3.2) => `<path d="M-7.5,0.5L-2,6L8,-5.5" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

function emit(name, label, S, build) {
  const cam = makeCam({ TH: -25, PH: 36, S });
  let scene = '';
  const put = s => { scene += s + '\n'; };
  const decor = build(cam, put);
  const out = card({ prefix: `${name}-`, label, scene, BOX: cam.BOX, decor });
  const svg = out.svg.replace(/<rect id="[^"]*bg"[^>]*\/>\n/, '').replace(', Teal spot style', '');
  fs.writeFileSync(path.join(dir, 'svg', `${name}.svg`), svg);
  console.log(name, `${out.widthPct}% x ${out.heightPct}%`);
}

// A note lying flat: the same object the customer already trusts.
function note(cam, x, y, z, rz = 0) {
  const { mat, slab } = cam;
  const fr = frame([x, y, z], [[Math.cos(rz), Math.sin(rz), 0], [-Math.sin(rz), Math.cos(rz), 0], [0, 0, 1]]);
  const W = 118, D = 60;
  const art = `<g transform="${mat(fr, 4)}"><rect x="-49" y="-21" width="98" height="42" rx="3" fill="none" stroke="${C.mid}" stroke-width="1.6"/><circle r="12" fill="${C.pale}" stroke="${C.ink}" stroke-width="1"/><g transform="scale(0.72)">${naira(C.deep, 3)}</g></g>`;
  return slab({ fr, pts: rrect(0, 0, W, D, 4, 3), depth: 4, face: C.white, side: C.mid, extra: art });
}

// Lockbox: the vault. Money goes in, the box is shut.
emit('lockbox', 'A locked money box', 0.9, (cam, put) => {
  const { pr, solid, slab, floorShadow, streak, coin, mat } = cam;
  const W = 210, D = 150, H = 118, R = 16;
  const ring = rrect(0, 0, W, D, R);
  put(`<path d="${poly(floorShadow(ring, H * 1.0))}" fill="${C.deep}"/>`);
  const b = solid({ fr: frame([0, 0, 0]), r0: ring, z0: 0, r1: ring, z1: H, col: WHITE });
  put(b.svg);
  const y = -D / 2 - 0.05;
  put(`<path d="${poly([pr([-W / 2 + R, y, H - 30]), pr([W / 2 - R, y, H - 30])])}" fill="none" stroke="${C.ink}" stroke-width="1.2"/>`);
  put(streak([-W / 2 + 18, y, H - 14], [-W / 2 + 104, y, H - 14]));
  // padlock hanging on the lid seam: shackle first, body over it
  const zc = 42, top = zc + 28;
  put(`<path d="${poly([[-22, top - 4], [-22, top + 18], [-11, top + 32], [11, top + 32], [22, top + 18], [22, top - 4], [12, top - 4], [12, top + 14], [7, top + 22], [-7, top + 22], [-12, top + 14], [-12, top - 4]].map(([x, z]) => pr([x, y - 4, z])))}" fill="${C.pale}" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>`);
  const lf = frame([0, y - 8, zc], uprightFrame);
  const key = `<g transform="${mat(lf, 8)}"><circle cx="0" cy="-6" r="7.5" fill="${C.white}"/><path d="M0,-4V12" stroke="${C.white}" stroke-width="6" stroke-linecap="round"/></g>`;
  put(slab({ fr: lf, pts: rrect(0, 0, 78, 58, 9, 5), depth: 8, face: C.teal, side: C.tealD, extra: key }).svg);
  const c1 = coin({ pos: [-170, -10, 150], R: 21, glyph: naira(C.deep), rot: [56, -24, 0] });
  const c2 = coin({ pos: [190, 80, 200], R: 16, glyph: `<g transform="scale(.74)">${naira(C.deep, 3)}</g>`, rot: [56, -24, 0] });
  put(c1.shadow + c1.svg); put(c2.shadow + c2.svg);
  const a = bbox(c1.hull), e = bbox(c2.hull);
  return s => { const [x, yy] = s([a[0], a[1]]), [x2, y2] = s([e[2], e[1]]); return [spark(x - 8, yy + 2, 6), spark(x + 6, yy - 12, 3.8), spark(x2 + 6, y2 + 26, 4.2)]; };
});

// Stall: "I sell".
emit('stall', 'A market stall', 0.82, (cam, put) => {
  const { pr, solid, floorShadow, streak, coin, mat } = cam;
  const W = 250, D = 120, H = 92, top = 216;
  const ring = rrect(0, 0, W, D, 10);
  const canopy = rrect(0, 0, W + 34, D + 44, 8, 3);
  put(`<path d="${poly(floorShadow(ring, H * 1.25))}" fill="${C.deep}"/>`);
  const post = (x, y) => { const r = rrect(x, y, 9, 9, 2, 2); return solid({ fr: frame([0, 0, 0]), r0: r, z0: H, r1: r, z1: top, col: PALE, creases: false }).svg; };
  put(post(-W / 2 + 12, D / 2 - 12)); put(post(W / 2 - 12, D / 2 - 12));
  put(solid({ fr: frame([0, 0, 0]), r0: ring, z0: 0, r1: ring, z1: H, col: WHITE }).svg);
  const y = -D / 2 - 0.05;
  for (let i = 0; i < 5; i++) { const x = -W / 2 + 28 + i * 48.5; put(`<path d="${poly([[x, 12], [x, H - 16]].map(([a, z]) => pr([a, y, z])))}" fill="none" stroke="${C.pale}" stroke-width="2.2" stroke-linecap="round"/>`); }
  // goods: three stacked cartons and a tin
  const box = (x, yy, w, d, h, z = H, col = PALE) => { const r = rrect(x, yy, w, d, 3, 2); put(solid({ fr: frame([0, 0, 0]), r0: r, z0: z, r1: r, z1: z + h, col }).svg); };
  box(-62, 12, 56, 46, 40); box(-62, 12, 40, 34, 24, H + 40, WHITE); box(6, 20, 40, 40, 26, H, { ...ACCENT });
  const tin = circle(70, 4, 19, 40); put(solid({ fr: frame([0, 0, 0]), r0: tin, z0: H, r1: tin, z1: H + 40, col: WHITE, creases: false }).svg);
  put(post(-W / 2 + 12, -D / 2 + 12)); put(post(W / 2 - 12, -D / 2 + 12));
  // striped awning: the adire stripe
  const awn = frame([0, 0, top]);
  let st = '';
  for (let i = 0; i < 7; i++) if (i % 2 === 0) st += `<rect x="${-(W + 34) / 2 + i * (W + 34) / 7}" y="${-(D + 44) / 2}" width="${(W + 34) / 7}" height="${D + 44}" fill="${C.teal}"/>`;
  put(solid({ fr: awn, r0: canopy, z0: 0, r1: canopy, z1: 14, col: { ...WHITE }, extra: `<g transform="${mat(awn, 14)}">${st}</g>` }).svg);
  const c1 = coin({ pos: [-210, -20, 150], R: 20, glyph: naira(C.deep) });
  put(c1.shadow + c1.svg);
  const a = bbox(c1.hull);
  return s => { const [x, yy] = s([a[0], a[1]]); return [spark(x - 6, yy - 4, 6), spark(x + 10, yy - 16, 3.8), arc(...s([(a[0] + a[2]) / 2, (a[1] + a[3]) / 2]), (a[2] - a[0]) / 2 + 8, -60, -28)]; };
});

// Phone and notes: "I buy".
emit('phone', 'A phone paying with money notes', 0.92, (cam, put) => {
  const { pr, solid, floorShadow, coin, mat } = cam;
  const W = 128, D = 232, H = 16;
  const ring = rrect(0, 0, W, D, 18);
  put(`<path d="${poly(floorShadow(ring, 34))}" fill="${C.deep}"/>`);
  const fr = frame([0, 0, 0]);
  const cell = 9, grid = ['1110111', '1010101', '1110011', '0001100', '1101011', '1011101', '1101011'];
  let qr = '';
  grid.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') qr += `<rect x="${(i - 3.5) * cell}" y="${(3.5 - j) * cell + 14 - cell}" width="${cell}" height="${cell}" fill="${C.deep}"/>`; }));
  const screen = `<g transform="${mat(fr, H)}"><rect x="-54" y="-104" width="108" height="208" rx="9" fill="${C.pale}" stroke="${C.ink}" stroke-width="1"/><rect x="-44" y="-30" width="88" height="88" rx="6" fill="${C.white}" stroke="${C.ink}" stroke-width="1"/>${qr}<rect x="-30" y="-78" width="60" height="26" rx="13" fill="${C.teal}"/></g>`;
  put(solid({ fr, r0: ring, z0: 0, r1: ring, z1: H, col: WHITE, extra: screen }).svg);
  const n = note(cam, -146, -70, 92, 0.32);
  put(n.shadow() + n.svg);
  const n2 = note(cam, 168, 66, 130, -0.28);
  put(n2.shadow() + n2.svg);
  const a = bbox(n.hull);
  return s => { const [x, y] = s([a[0], a[1]]); return [spark(x + 4, y - 12, 6), spark(x + 22, y - 24, 3.8), spark(...s([bbox(n2.hull)[0] + 6, bbox(n2.hull)[3] + 20]), 4.2)]; };
});

// Receipt with a tick coin lifted out of it: the seller has your payment.
emit('receipt', 'A receipt with a tick', 0.96, (cam, put) => {
  const { slab, coin, floorShadow, mat } = cam;
  const W = 178, D = 240;
  const zig = []; const n = 8;
  for (let i = 0; i <= n * 2; i++) zig.push([W / 2 - (i * W) / (n * 2), -D / 2 + (i % 2 ? 9 : 0)]);
  const pts = [[-W / 2, D / 2 - 8], [-W / 2 + 8, D / 2], [W / 2 - 8, D / 2], [W / 2, D / 2 - 8], ...zig];
  pts.reverse();
  const H = 12;
  put(`<path d="${poly(floorShadow(pts, 34))}" fill="${C.deep}"/>`);
  const fr = frame([0, 0, 0]);
  const bars = `<g transform="${mat(fr, H)}">` + [[76, 96], [50, 60], [50, 60]].map(([y, w], i) => `<rect x="${-w / 2}" y="${y - i * 0}" width="${w}" height="7" rx="3.5" fill="${C.grey}"/>`).slice(0, 1).join('') +
    `<rect x="-58" y="-44" width="116" height="7" rx="3.5" fill="${C.grey}"/><rect x="-58" y="-62" width="116" height="7" rx="3.5" fill="${C.grey}"/><rect x="-58" y="-80" width="72" height="7" rx="3.5" fill="${C.pale}" stroke="${C.mid}" stroke-width="1"/></g>`;
  put(slab({ fr, pts, depth: H, face: C.white, side: C.teal, extra: bars }).svg);
  const c = coin({ pos: [6, 14, 26], R: 50, depth: 9, rot: [0, 0, 0], face: C.teal, col: ACCENT, rim: C.mid,
    glyph: `<g transform="scale(2.5)">${tick(C.white, 2.8)}</g>` });
  put(`<path d="${poly(circleShadow(cam, 6, 14, 50))}" fill="${C.deep}"/>`);
  put(c.svg);
  const a = bbox(c.hull);
  return s => { const [x, y] = s([a[2], a[1]]); return [spark(x + 14, y + 2, 6.5), spark(x + 28, y - 12, 4), spark(...s([a[0] - 62, a[1] - 26]), 4.4), arc(...s([(a[0] + a[2]) / 2, (a[1] + a[3]) / 2]), (a[2] - a[0]) / 2 + 12, -62, -30)]; };
});
function circleShadow(cam, x, y, r) { return circle(x + 12, y - 8, r, 48).map(([a, b]) => cam.pr([a, b, 12])); }

// Bundle for the app: react-native-svg takes the markup as a string.
const names = fs.readdirSync(path.join(dir, 'svg')).filter(n => n.endsWith('.svg'));
const body = names.map(n => `  ${n.replace('.svg', '')}: ${JSON.stringify(fs.readFileSync(path.join(dir, 'svg', n), 'utf8'))},`).join('\n');
fs.writeFileSync(path.join(dir, '../../src/assets/spots.ts'), `// Generated by design/illustrations/gen.mjs. Do not edit by hand.\nexport const spots = {\n${body}\n};\nexport type SpotName = keyof typeof spots;\n`);
