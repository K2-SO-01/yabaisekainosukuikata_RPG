// 大事な時の豪華なお知らせ（仲間が加わった・大事なものを手に入れた・称号・力が目覚めた など）
// 画面が少し暗くなり、うしろで光の筋が回り、金のふちの帯がはずんで出てきて、きらきらが飛び散る。決定かタップで閉じる
import { HEIGHT, WIDTH } from '../../config.js';
import { Scene } from '../scene.js';

// 種類ごとの色（光の筋・帯の上の札・きらきら）
const KINDS = {
  なかま: { color: '#5ad1ff', ribbon: '#2a7fb8' },
  だいじなもの: { color: '#ffd34a', ribbon: '#b8861e' },
  称号: { color: '#e070ff', ribbon: '#7a2aa8' },
  ちから: { color: '#fff3a8', ribbon: '#c8a020' },
  ゴールド: { color: '#ffd34a', ribbon: '#b8861e' },
  おたから: { color: '#7dffb0', ribbon: '#2a9a5a' },
};

const ease = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export class FanfareScene extends Scene {
  // lines：出す文（1行目が大きな文字、2行目からは小さな文字）
  constructor({ lines, kind = 'だいじなもの', se = 'item_get', jingle = null, onDone }) {
    super();
    this.transparent = true;
    this.lines = lines.filter(Boolean);
    this.kind = KINDS[kind] ? kind : 'だいじなもの';
    this.style = KINDS[this.kind];
    this.se = se;
    this.jingle = jingle;
    this.onDone = onDone;
    this.t = 0;
    this.closing = -1;
    this.sparks = [];
  }

  enter() {
    const g = this.game;
    if (this.jingle) g.audio.playJingle(this.jingle);
    else if (this.se) g.audio.playSe(this.se);
    // きらきら：まん中からはじけて、ゆっくり落ちる
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.08 + Math.random() * 0.22;
      this.sparks.push({ x: WIDTH / 2, y: HEIGHT / 2 - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.06, life: 900 + Math.random() * 900, t: 0, size: 2 + Math.floor(Math.random() * 3), delay: 180 + Math.random() * 220 });
    }
    g.input.clear();
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    for (const s of this.sparks) {
      if (this.t < s.delay) continue;
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 0.00012 * dt; // ゆっくり落ちる
      s.vx *= 0.995;
    }
    if (this.closing >= 0) {
      this.closing += dt;
      if (this.closing > 220) {
        g.scenes.pop(this);
        this.onDone?.();
      }
      return;
    }
    if (this.t > 650 && (g.input.pressed('ok') || g.input.tapped() || g.input.pressed('cancel'))) this.closing = 0;
  }

  draw(ctx) {
    const g = this.game;
    const out = this.closing >= 0 ? 1 - this.closing / 220 : 1;
    const inT = Math.min(1, this.t / 320);
    ctx.save();
    // 少し暗く
    ctx.globalAlpha = 0.5 * ease(inT) * out;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = out;

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    // うしろで回る光の筋
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t / 2600);
    ctx.globalAlpha = 0.16 * ease(inT) * out;
    ctx.fillStyle = this.style.color;
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-22, -260);
      ctx.lineTo(22, -260);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = out;

    // 帯の大きさ（1行目は大きな文字。入りきらなければふつうの文字）
    const big = g.fontBig && g.fontBig.width(this.lines[0] ?? '') <= WIDTH - 120 ? g.fontBig : g.font;
    const subW = Math.max(0, ...this.lines.slice(1).map((l) => g.font.width(l)));
    const w = Math.min(WIDTH - 24, Math.max(320, big.width(this.lines[0] ?? '') + 96, subW + 80));
    const h = (big === g.fontBig ? 64 : 48) + (this.lines.length - 1) * 22 + 12;
    const s = easeBack(Math.min(1, this.t / 380));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const x = -w / 2;
    const y = -h / 2;
    // 金のふち（2重）と、紺の中身
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    const gold = ctx.createLinearGradient(0, y - 4, 0, y + h + 4);
    gold.addColorStop(0, '#fff2b0');
    gold.addColorStop(0.5, '#e0a830');
    gold.addColorStop(1, '#8a5a12');
    ctx.fillStyle = gold;
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    const inner = ctx.createLinearGradient(0, y, 0, y + h);
    inner.addColorStop(0, '#26214a');
    inner.addColorStop(1, '#120f26');
    ctx.fillStyle = inner;
    ctx.fillRect(x, y, w, h);
    // 四すみの飾り
    ctx.fillStyle = '#ffe08a';
    for (const [px, py] of [[x + 6, y + 6], [x + w - 10, y + 6], [x + 6, y + h - 10], [x + w - 10, y + h - 10]]) {
      ctx.fillRect(px + 1, py, 2, 4);
      ctx.fillRect(px, py + 1, 4, 2);
    }
    // 光が横切る
    const sweep = (this.t - 420) / 520;
    if (sweep > 0 && sweep < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const sx = x - 60 + (w + 120) * sweep;
      const grad = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 40, y, 80, h);
      ctx.restore();
    }
    // 文字
    const ty = y + (big === g.fontBig ? 14 : 12);
    big.drawCentered(ctx, this.lines[0] ?? '', 1, ty + 1, '#000000');
    big.drawCentered(ctx, this.lines[0] ?? '', 0, ty, '#fff6d8');
    this.lines.slice(1).forEach((l, i) => g.font.drawCentered(ctx, l, 0, ty + (big === g.fontBig ? 44 : 30) + i * 22, '#cfc6ff'));
    // 上の札（なかま・称号 など）
    const tagW = g.font.width(this.kind) + 28;
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(-tagW / 2 - 2, y - 20, tagW + 4, 24);
    ctx.fillStyle = this.style.ribbon;
    ctx.fillRect(-tagW / 2, y - 18, tagW, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-tagW / 2, y - 18, tagW, 4);
    g.font.drawCentered(ctx, this.kind, 0, y - 16, '#ffffff');
    ctx.restore();

    // きらきら（4つの角の星）
    for (const sp of this.sparks) {
      if (this.t < sp.delay || sp.t > sp.life) continue;
      const k = 1 - sp.t / sp.life;
      const blink = Math.sin(sp.t / 60) > -0.3 ? 1 : 0.4;
      ctx.globalAlpha = Math.max(0, k) * blink * out;
      ctx.fillStyle = sp.size > 3 ? '#ffffff' : this.style.color;
      const r = sp.size;
      ctx.fillRect(Math.round(sp.x) - r, Math.round(sp.y), r * 2 + 1, 1);
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y) - r, 1, r * 2 + 1);
    }
    ctx.restore();
    // 閉じられるようになったら、右下で ▼ が点滅
    if (this.t > 650 && this.closing < 0 && Math.floor(this.t / 380) % 2 === 0) {
      ctx.fillStyle = '#ffe08a';
      const bx = cx + w / 2 - 18;
      const by = cy + h / 2 - 12;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 10, by);
      ctx.lineTo(bx + 5, by + 6);
      ctx.fill();
    }
  }
}
