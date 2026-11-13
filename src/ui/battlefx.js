// 戦闘の見た目：エリアごとの背景、技・魔法のエフェクト、戦闘が始まる時の演出
// ドット絵に合わせて、四角い粒（fillRect）で描く
import { HEIGHT, WIDTH } from '../config.js';

// ---- 背景（320×180 に描いて、2倍で出す。エリアごとに1回だけ作る） ----
const BG_CACHE = new Map();
const BW = 320;
const BH = 180;
// 地面の始まり（320×180の中で。画面では2倍の172）。敵の足もと（battle.js の GROUND_Y＝画面192＝ここの96）が、
// 地面の少し奥に乗るように、地平線を足もとより10だけ上にしている
const HORIZON = 86;

function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function grad(c, y0, y1, colors) {
  const n = colors.length;
  for (let y = y0; y < y1; y++) {
    const k = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(k));
    // 帯にして、ドット絵らしい段々のグラデーションにする
    c.fillStyle = Math.floor((k - i) * 4) / 4 < 0.5 ? colors[i] : colors[i + 1];
    c.fillRect(0, y, BW, 1);
  }
}

function hills(c, r, base, amp, color, step = 6) {
  c.fillStyle = color;
  let h = amp / 2;
  for (let x = 0; x < BW; x += step) {
    h = Math.max(4, Math.min(amp, h + (r() - 0.5) * amp * 0.5));
    c.fillRect(x, base - h, step, h + 2);
  }
}

const PAINTERS = {
  field_town(c, r) {
    grad(c, 0, HORIZON, ['#6fb8ea', '#8fcbf0', '#b5ddf4', '#d6eef8']);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const x = r() * BW;
      const y = 10 + r() * 40;
      for (let k = 0; k < 5; k++) c.fillRect(x + k * 6 - 8, y - (k % 2) * 3, 14, 6);
    }
    hills(c, r, HORIZON, 30, '#8bb8a0', 8);
    hills(c, r, HORIZON, 18, '#5f9a5a', 6);
    grad(c, HORIZON, BH, ['#7cc06a', '#6ab25a', '#5aa04c']);
    c.fillStyle = '#4e9042';
    for (let i = 0; i < 120; i++) c.fillRect(Math.floor(r() * BW), HORIZON + 4 + Math.floor(r() * 70), 2, 1);
    c.fillStyle = 'rgba(150,120,70,0.35)';
    // 敵が立つ土の道（足もとの高さ）
    c.fillRect(70, HORIZON + 4, 180, 10);
    c.fillRect(54, HORIZON + 8, 212, 4);
  },
  lake(c, r) {
    grad(c, 0, HORIZON, ['#101a2a', '#16263c', '#1e3450', '#264466']);
    c.fillStyle = '#2c3c56';
    for (let x = 0; x < BW; x += 12) {
      const h = 8 + Math.floor(r() * 26);
      for (let k = 0; k < h; k += 2) c.fillRect(x + 6 - Math.floor((h - k) / 5), k, Math.max(1, Math.floor((h - k) / 2.5)), 2);
    }
    c.fillStyle = '#5ee0ff';
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * BW);
      const y = 30 + Math.floor(r() * 60);
      c.fillRect(x, y, 2, 4);
      c.fillRect(x - 1, y + 1, 4, 2);
    }
    hills(c, r, HORIZON, 16, '#1a2a40', 5);
    grad(c, HORIZON, BH, ['#2a5070', '#24607e', '#1e5a7a', '#184c6a']);
    c.fillStyle = 'rgba(140,210,255,0.35)';
    for (let i = 0; i < 40; i++) c.fillRect(Math.floor(r() * BW), HORIZON + 6 + Math.floor(r() * 66), 6 + Math.floor(r() * 10), 1);
  },
  tower(c, r) {
    grad(c, 0, HORIZON, ['#8fd0c0', '#a8dccd', '#c4e8da', '#e0f4ea']);
    for (const x of [10, 270]) {
      c.fillStyle = '#9aa2aa';
      c.fillRect(x, 0, 40, HORIZON + 10);
      c.fillStyle = '#b8bec6';
      c.fillRect(x + 4, 0, 8, HORIZON + 10);
      c.fillStyle = '#7c848c';
      for (let y = 6; y < HORIZON; y += 14) c.fillRect(x, y, 40, 1);
    }
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 10; i++) c.fillRect(60 + Math.floor(r() * 200), 10 + Math.floor(r() * 80), 20 + Math.floor(r() * 30), 1);
    for (let y = HORIZON; y < BH; y += 8) {
      for (let x = (y / 8) % 2 ? 0 : 8; x < BW; x += 16) {
        c.fillStyle = '#c8bea8';
        c.fillRect(x, y, 16, 8);
        c.fillStyle = '#b4aa94';
        c.fillRect(x + 16, y, 16, 8);
      }
    }
  },
  volcano(c, r) {
    grad(c, 0, HORIZON, ['#2a0a08', '#4a1410', '#7a2216', '#b8401c']);
    c.fillStyle = '#3a1a14';
    for (const [x, w, h] of [[20, 120, 60], [180, 150, 76], [110, 90, 40]]) {
      for (let k = 0; k < h; k++) c.fillRect(x + Math.floor((k * w) / (2 * h)), HORIZON - k, Math.max(2, w - Math.floor((k * w) / h)), 1);
    }
    c.fillStyle = '#ff6a2a';
    c.fillRect(250, HORIZON - 76, 10, 3);
    grad(c, HORIZON, BH, ['#5a2a1a', '#4a2014', '#3a180e']);
    c.fillStyle = '#ff7a2a';
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * BW);
      const y = HORIZON + 10 + Math.floor(r() * 60);
      c.fillRect(x, y, 14 + Math.floor(r() * 20), 2);
      c.fillStyle = '#ffcf3a';
      c.fillRect(x + 4, y, 6, 1);
      c.fillStyle = '#ff7a2a';
    }
  },
  storm(c, r) {
    grad(c, 0, HORIZON, ['#1a1c2c', '#262a40', '#363c58', '#4a5270']);
    c.fillStyle = '#2a2e44';
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(r() * BW);
      const y = Math.floor(r() * 40);
      c.fillRect(x - 20, y, 50, 8);
      c.fillRect(x - 10, y - 4, 30, 6);
    }
    c.fillStyle = '#3a3e52';
    c.fillRect(0, HORIZON - 34, BW, 34);
    for (let x = 0; x < BW; x += 20) c.fillRect(x, HORIZON - 42, 12, 8);
    c.fillStyle = '#2c3044';
    for (let x = 0; x < BW; x += 10) c.fillRect(x, HORIZON - 34 + ((x / 10) % 2) * 8, 10, 1);
    grad(c, HORIZON, BH, ['#4a4e60', '#40445a', '#363a4e']);
    c.fillStyle = '#5a5e72';
    for (let y = HORIZON; y < BH; y += 10) c.fillRect(0, y, BW, 1);
  },
  demon(c, r) {
    grad(c, 0, HORIZON, ['#0c0614', '#160a24', '#241038', '#34184c']);
    for (const x of [30, 120, 190, 280]) {
      c.fillStyle = '#2a1640';
      c.fillRect(x, 10, 16, HORIZON);
      c.fillStyle = '#3c2258';
      c.fillRect(x + 2, 10, 3, HORIZON);
      c.fillStyle = '#c050ff';
      c.fillRect(x + 6, 24, 4, 6);
      c.fillStyle = '#ffffff';
      c.fillRect(x + 7, 26, 2, 2);
    }
    grad(c, HORIZON, BH, ['#2a1438', '#22102e', '#1a0c24']);
    c.strokeStyle = 'rgba(220,40,80,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(160, HORIZON + 12, 110, 11, 0, 0, Math.PI * 2); // 魔法陣（敵の足もと）
    c.stroke();
    c.beginPath();
    c.ellipse(160, HORIZON + 12, 88, 8, 0, 0, Math.PI * 2);
    c.stroke();
  },
  shadow(c, r) {
    grad(c, 0, HORIZON, ['#000000', '#08020a', '#140410', '#22060e']);
    c.fillStyle = 'rgba(120,10,30,0.4)';
    for (let i = 0; i < 30; i++) c.fillRect(Math.floor(r() * BW), Math.floor(r() * HORIZON), 30 + Math.floor(r() * 40), 2);
    grad(c, HORIZON, BH, ['#1a0408', '#120306', '#0a0204']);
  },
};

export function battleBackground(areaId, fallback) {
  const key = PAINTERS[areaId] ? areaId : `_${fallback.join(',')}`;
  if (BG_CACHE.has(key)) return BG_CACHE.get(key);
  const cv = document.createElement('canvas');
  cv.width = BW;
  cv.height = BH;
  const c = cv.getContext('2d');
  const r = rnd([...areaId].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7));
  if (PAINTERS[areaId]) PAINTERS[areaId](c, r);
  else grad(c, 0, BH, [fallback[0], fallback[1]]);
  BG_CACHE.set(key, cv);
  return cv;
}

// 背景の動くもの（雨・火の粉・水のきらめき・霧）
export function drawBackgroundLife(ctx, areaId, t) {
  if (areaId === 'storm') {
    ctx.fillStyle = 'rgba(180,200,255,0.35)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 97 + t * 0.5) % (WIDTH + 40) - 20;
      const y = (i * 53 + t * 0.9) % HEIGHT;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 8);
    }
    const k = (t % 5200) / 5200;
    if (k > 0.9 && k < 0.92) {
      ctx.fillStyle = 'rgba(255,255,240,0.35)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  } else if (areaId === 'volcano') {
    for (let i = 0; i < 26; i++) {
      const life = (t / 3000 + i * 0.137) % 1;
      const x = (i * 131) % WIDTH + Math.sin(t / 700 + i) * 6;
      const y = HEIGHT * 0.85 - life * HEIGHT * 0.8;
      ctx.fillStyle = life < 0.5 ? '#ffcf3a' : '#ff6a2a';
      ctx.globalAlpha = 1 - life;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    ctx.globalAlpha = 1;
  } else if (areaId === 'lake') {
    ctx.fillStyle = 'rgba(200,240,255,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = (i * 83 + t * 0.03) % WIDTH;
      const y = HORIZON * 2 + 6 + (i * 29) % 150;
      if (Math.sin(t / 300 + i) > 0.6) ctx.fillRect(Math.round(x), y, 6, 1);
    }
  } else if (areaId === 'demon' || areaId === 'shadow') {
    for (let i = 0; i < 10; i++) {
      const x = (i * 157 + t * 0.02 * (i % 3 ? 1 : -1)) % (WIDTH + 200) - 100;
      ctx.fillStyle = areaId === 'shadow' ? 'rgba(90,0,20,0.12)' : 'rgba(80,30,120,0.12)';
      ctx.fillRect(Math.round(x), 150 + (i % 4) * 22, 180, 14);
    }
  } else if (areaId === 'tower') {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 8; i++) {
      const x = (i * 211 + t * 0.35) % (WIDTH + 120) - 60;
      ctx.fillRect(Math.round(x), 30 + i * 22, 40, 1);
    }
  }
}

// ---- 技・魔法のエフェクト ----
const COLORS = {
  none: ['#ffffff', '#c8c8c8'],
  fire: ['#ffd23a', '#ff5a1e'],
  thunder: ['#fff7a0', '#ffd400'],
  water: ['#c8f0ff', '#3b8de8'],
  wind: ['#d8ffe0', '#3ac46a'],
  light: ['#ffffff', '#ffe27a'],
  dark: ['#c890ff', '#3a1458'],
};

export class Effects {
  constructor() {
    this.list = [];
  }

  // type：slash（斬る）・magic（属性の魔法）・claw（敵の攻撃が味方に当たる）・heal・buff・debuff・status・impact
  spawn(type, x, y, { element = 'none', big = false, color = null } = {}) {
    const dur = { slash: 360, magic: 620, claw: 320, heal: 760, buff: 700, debuff: 700, status: 700, impact: 260 }[type] ?? 500;
    this.list.push({ type, x, y, element, big, color, t: 0, dur, seed: Math.floor(Math.random() * 1000) });
  }

  update(dt) {
    for (const e of this.list) e.t += dt;
    this.list = this.list.filter((e) => e.t < e.dur);
  }

  get busy() {
    return this.list.length > 0;
  }

  draw(ctx) {
    for (const e of this.list) {
      const k = e.t / e.dur;
      const [c1, c2] = COLORS[e.element] ?? COLORS.none;
      const px = (x, y, w, h, col) => {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x), Math.round(y), w, h);
      };
      ctx.save();
      if (e.type === 'slash') {
        // 斜めの光の線が2本走る
        const len = e.big ? 120 : 84;
        for (let n = 0; n < (e.big ? 3 : 2); n++) {
          const p = Math.min(1, k * 2 - n * 0.25);
          if (p <= 0) continue;
          ctx.globalAlpha = Math.max(0, 1 - (k - 0.4) * 1.8);
          for (let i = 0; i < len * p; i += 2) {
            const x = e.x - len / 2 + i + n * 10;
            const y = e.y - len / 2 + i - n * 14;
            px(x, y, 3, 3, i > len * p - 12 ? '#ffffff' : c2 === '#c8c8c8' ? '#e8e8ff' : c2);
          }
        }
      } else if (e.type === 'claw') {
        ctx.globalAlpha = 1 - k;
        for (let n = 0; n < 3; n++) for (let i = 0; i < 26 * Math.min(1, k * 3); i += 2) px(e.x - 18 + n * 10 + i * 0.4, e.y - 14 + i, 2, 3, n === 1 ? '#ffffff' : '#ff6a5a');
      } else if (e.type === 'impact') {
        ctx.globalAlpha = 1 - k;
        const r = 6 + k * 22;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          px(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 3, 3, a % 2 ? '#ffffff' : '#ffe08a');
        }
      } else if (e.type === 'magic') {
        this.drawMagic(ctx, e, k, c1, c2, px);
      } else if (e.type === 'heal') {
        for (let i = 0; i < 14; i++) {
          const life = (k + i / 14) % 1;
          ctx.globalAlpha = Math.sin(life * Math.PI) * (1 - k * 0.6);
          const x = e.x + Math.sin(i * 2.3 + e.seed) * 28;
          const y = e.y + 20 - life * 46;
          px(x, y - 2, 1, 5, '#b8ffc8');
          px(x - 2, y, 5, 1, '#b8ffc8');
          px(x, y, 1, 1, '#ffffff');
        }
      } else if (e.type === 'buff' || e.type === 'debuff') {
        const up = e.type === 'buff';
        const col = e.color ?? (up ? '#ff7a5a' : '#5a9aff');
        for (let i = 0; i < 5; i++) {
          const life = (k * 1.4 + i * 0.2) % 1;
          ctx.globalAlpha = Math.sin(life * Math.PI);
          const x = e.x - 32 + i * 16;
          const y = up ? e.y + 20 - life * 40 : e.y - 20 + life * 40;
          for (let r = 0; r < 4; r++) px(x - r, up ? y + r : y - r, 1 + r * 2, 1, col);
          px(x - 1, up ? y + 4 : y - 9, 3, 6, col);
        }
      } else if (e.type === 'status') {
        for (let i = 0; i < 6; i++) {
          const life = (k + i / 6) % 1;
          ctx.globalAlpha = 1 - life;
          const x = e.x + Math.sin(i * 1.7 + e.seed) * 24;
          const y = e.y - life * 36;
          ctx.strokeStyle = e.color ?? '#c890ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(x), Math.round(y), 4, 4);
        }
      }
      ctx.restore();
    }
  }

  drawMagic(ctx, e, k, c1, c2, px) {
    const el = e.element;
    if (el === 'fire') {
      // 下から炎が燃え上がる
      for (let i = 0; i < 26; i++) {
        const life = (k * 1.6 + i / 26) % 1;
        ctx.globalAlpha = (1 - life) * Math.min(1, (1 - k) * 3);
        const x = e.x + Math.sin(i * 1.9 + e.seed) * (24 - life * 10);
        const y = e.y + 30 - life * 70;
        const s = 6 - Math.floor(life * 4);
        px(x, y, s, s, life < 0.35 ? c1 : c2);
      }
    } else if (el === 'thunder') {
      // 上から稲妻が落ちる
      if (k < 0.55) {
        ctx.globalAlpha = Math.floor(k * 20) % 2 ? 0.6 : 1;
        let x = e.x;
        for (let y = e.y - 140; y < e.y + 20; y += 8) {
          const nx = x + Math.sin(y * 0.7 + e.seed) * 8;
          px(Math.min(x, nx), y, Math.abs(nx - x) + 4, 8, c2);
          px(Math.min(x, nx) + 1, y, 2, 8, c1);
          x = nx;
        }
      }
      ctx.globalAlpha = Math.max(0, 1 - k);
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2;
        const r = 10 + k * 30;
        px(e.x + Math.cos(ang) * r, e.y + 10 + Math.sin(ang) * r * 0.5, 3, 3, c1);
      }
    } else if (el === 'water') {
      // 水の粒がはねて、輪が広がる
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = k * 46;
        ctx.globalAlpha = 1 - k;
        px(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.6 - Math.sin(k * Math.PI) * 20, 4, 4, i % 2 ? c1 : c2);
      }
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = c1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 24, 10 + k * 50, 3 + k * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (el === 'wind') {
      // 渦を巻く線
      for (let i = 0; i < 24; i++) {
        const a = i * 0.6 + k * 12;
        const r = 8 + i * 1.8;
        ctx.globalAlpha = (1 - k) * (i / 24 + 0.2);
        px(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.55 - i, 3, 2, i % 3 ? c1 : c2);
      }
    } else if (el === 'light') {
      // 十字の光
      ctx.globalAlpha = Math.sin(k * Math.PI);
      const r = 20 + k * 60;
      px(e.x - r, e.y - 2, r * 2, 4, c2);
      px(e.x - 2, e.y - r, 4, r * 2, c2);
      px(e.x - r / 2, e.y - 1, r, 2, c1);
      px(e.x - 1, e.y - r / 2, 2, r, c1);
      for (let a = 0; a < 8; a++) px(e.x + Math.cos(a + k * 4) * r * 0.7, e.y + Math.sin(a + k * 4) * r * 0.7, 3, 3, c1);
    } else if (el === 'dark') {
      // 黒い霧がまとわりつく
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + k * 3;
        const r = 30 - k * 20;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
        px(e.x + Math.cos(a) * r - 5, e.y + Math.sin(a) * r * 0.7 - 5, 10, 10, i % 2 ? c2 : '#120818');
        px(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.7, 2, 2, c1);
      }
    } else {
      // 属性なし：白い光がはじける
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const r = k * 50;
        ctx.globalAlpha = 1 - k;
        px(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, 4, 4, a % 2 ? '#ffffff' : '#b8c8ff');
      }
    }
  }
}

// ---- 戦闘が始まる時の演出 ----
// 雑魚：黒い帯が左右からさっと開く。ボス：赤く光って画面が割れ、ボスの名前が大きく出る
export const INTRO_MS = { normal: 650, boss: 2300 };

export function drawIntro(ctx, t, boss, name, font, fontBig) {
  if (!boss) {
    const k = Math.min(1, t / INTRO_MS.normal);
    if (k >= 1) return;
    // 斜めの帯が交互に開いていく
    ctx.fillStyle = '#000000';
    const n = 10;
    for (let i = 0; i < n; i++) {
      const delay = (i % 2 ? 0.1 : 0) + i * 0.02;
      const p = Math.min(1, Math.max(0, (k - delay) / 0.6));
      const h = HEIGHT / n;
      const w = WIDTH * (1 - p * p);
      if (i % 2) ctx.fillRect(WIDTH - w, i * h, w, h + 1);
      else ctx.fillRect(0, i * h, w, h + 1);
    }
    return;
  }
  const T = INTRO_MS.boss;
  if (t >= T) return;
  // 1：赤く2回光る
  if (t < 380) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (Math.floor(t / 95) % 2 === 0) {
      ctx.fillStyle = 'rgba(200,0,30,0.85)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    return;
  }
  // 2：画面の破片が飛び散る
  const k = (t - 380) / 520;
  if (k < 1) {
    for (let i = 0; i < 48; i++) {
      const cx = (i % 8) * 80 + 40;
      const cy = Math.floor(i / 8) * 60 + 30;
      const dx = (cx - WIDTH / 2) / 160;
      const dy = (cy - HEIGHT / 2) / 120;
      const x = cx + dx * k * k * 260;
      const y = cy + dy * k * k * 220 + k * k * 160;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((i * 37) % 10 - 5) * k * 0.15);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = i % 3 ? '#0a0004' : '#1a0008';
      ctx.fillRect(-41, -31, 82, 62);
      ctx.strokeStyle = 'rgba(255,60,80,0.6)';
      ctx.strokeRect(-41, -31, 82, 62);
      ctx.restore();
    }
  }
  // 3：名前の帯
  const n0 = 520;
  const nk = (t - n0) / (T - n0);
  if (nk > 0 && nk < 1) {
    const inn = Math.min(1, nk * 5);
    const out = nk > 0.8 ? 1 - (nk - 0.8) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = out;
    const bandH = 70 * inn;
    ctx.fillStyle = 'rgba(10,0,6,0.85)';
    ctx.fillRect(0, HEIGHT / 2 - bandH / 2, WIDTH, bandH);
    ctx.fillStyle = '#c8202e';
    ctx.fillRect(0, HEIGHT / 2 - bandH / 2, WIDTH, 2);
    ctx.fillRect(0, HEIGHT / 2 + bandH / 2 - 2, WIDTH, 2);
    if (inn >= 1) {
      const slide = Math.max(0, 1 - nk * 4) * 80;
      const f = fontBig ?? font;
      f.drawCentered(ctx, name, WIDTH / 2 + slide + 2, HEIGHT / 2 - 15, '#000000');
      f.drawCentered(ctx, name, WIDTH / 2 + slide, HEIGHT / 2 - 17, '#ffe8e8');
      font.drawCentered(ctx, '― BOSS ―', WIDTH / 2 - slide, HEIGHT / 2 - 34, '#ff5a6a');
    }
    ctx.restore();
  }
}
