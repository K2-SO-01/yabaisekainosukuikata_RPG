// タイトル画面の演出（きらきら）。画面の大きさ（640×360）の座標で描く
//   うしろ：太陽からの光の筋・レンズの光・光の粒
//   まえ：星のきらめき・回る大きな結晶・火の粉（火山の側）・流れ星・紫のうずの稲妻
//   タイトルの文字：流れる金色の輝き・文字の上のきらめき・登場の時の光の爆発
import { HEIGHT, WIDTH } from '../config.js';

const SUN = { x: 22, y: 118 }; // 2枚の絵の、朝日のあたり
const rand = (a, b) => a + Math.random() * (b - a);

export class TitleFx {
  constructor() {
    this.motes = Array.from({ length: 46 }, () => this.newMote(true));
    this.stars = [];
    this.crystals = Array.from({ length: 6 }, (_, i) => ({ x: rand(30, WIDTH - 30), y: rand(60, HEIGHT), v: rand(0.004, 0.009), rot: rand(0, 6.28), spin: rand(-0.0015, 0.0015), size: rand(5, 9), hue: i % 2, sway: rand(0, 6.28) }));
    this.embers = Array.from({ length: 28 }, () => this.newEmber(true));
    this.comets = [];
    this.nextComet = 2500;
    this.bolt = null;
    this.nextBolt = 5000;
    this.glints = [];
    this.burst = [];
    this.burstDone = false;
    this.sheen = null;
  }

  newMote(anywhere = false) {
    return { x: rand(0, WIDTH), y: anywhere ? rand(0, HEIGHT) : HEIGHT + 8, v: rand(0.004, 0.014), drift: rand(-0.006, 0.006), r: rand(1.2, 3.2), ph: rand(0, 6.28), warm: Math.random() < 0.7 };
  }

  newEmber(anywhere = false) {
    return { x: rand(WIDTH * 0.62, WIDTH), y: anywhere ? rand(80, HEIGHT) : HEIGHT + 4, v: rand(0.02, 0.05), drift: rand(-0.012, 0.004), life: rand(0.5, 1), ph: rand(0, 6.28) };
  }

  // logo：タイトルの文字の場所 { x, y, w, h }（きらめきと爆発の場所）
  update(dt, t, logo) {
    for (const m of this.motes) {
      m.y -= m.v * dt;
      m.x += m.drift * dt;
      m.ph += dt / 700;
      if (m.y < -8 || m.x < -8 || m.x > WIDTH + 8) Object.assign(m, this.newMote());
    }
    for (const c of this.crystals) {
      c.y -= c.v * dt;
      c.rot += c.spin * dt;
      c.sway += dt / 1500;
      if (c.y < -20) Object.assign(c, { y: HEIGHT + 20, x: rand(30, WIDTH - 30) });
    }
    for (const e of this.embers) {
      e.y -= e.v * dt;
      e.x += e.drift * dt + Math.sin((e.ph += dt / 300)) * 0.15;
      e.life -= dt / 6000;
      if (e.y < 40 || e.life <= 0) Object.assign(e, this.newEmber());
    }
    // 星のきらめき：空のあちこちに、ぱっと光って消える
    if (Math.random() < dt / 160) this.stars.push({ x: rand(0, WIDTH), y: rand(0, HEIGHT * 0.6), age: 0, life: rand(600, 1100), size: rand(3, 7) });
    for (const s of this.stars) s.age += dt;
    this.stars = this.stars.filter((s) => s.age < s.life);
    // 流れ星
    this.nextComet -= dt;
    if (this.nextComet <= 0) {
      this.nextComet = rand(3500, 7000);
      const fromLeft = Math.random() < 0.5;
      this.comets.push({ x: fromLeft ? rand(60, 260) : rand(380, 600), y: rand(10, 70), vx: (fromLeft ? 1 : -1) * rand(0.32, 0.45), vy: rand(0.08, 0.14), age: 0, life: 900 });
    }
    for (const c of this.comets) {
      c.age += dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    this.comets = this.comets.filter((c) => c.age < c.life);
    // 紫のうずの稲妻（右上）
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = rand(6500, 11000);
      const pts = [];
      let x = rand(470, 600);
      let y = -4;
      while (y < 150) {
        pts.push([x, y]);
        x += rand(-16, 16);
        y += rand(10, 22);
      }
      this.bolt = { pts, age: 0 };
    }
    if (this.bolt) {
      this.bolt.age += dt;
      if (this.bolt.age > 520) this.bolt = null;
    }
    // タイトルの文字：登場の時の光の爆発と、文字の上のきらめき
    if (logo && !this.burstDone && t > 1150) {
      this.burstDone = true;
      this.flashT = 1;
      for (let i = 0; i < 70; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(0.06, 0.32);
        this.burst.push({ x: logo.x + rand(0, logo.w), y: logo.y + logo.h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, age: 0, life: rand(700, 1400), size: rand(1, 3), gold: Math.random() < 0.7 });
      }
    }
    for (const b of this.burst) {
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 0.00008 * dt;
    }
    this.burst = this.burst.filter((b) => b.age < b.life);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt / 500);
    if (logo && t > 1300 && Math.random() < dt / 120) this.glints.push({ x: logo.x + rand(0, logo.w), y: logo.y + rand(2, logo.h - 4), age: 0, life: rand(450, 750), size: rand(5, 10) });
    for (const gl of this.glints) gl.age += dt;
    this.glints = this.glints.filter((gl) => gl.age < gl.life);
  }

  // 絵のすぐ上（タイトルの文字やメニューより下）
  drawBack(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 太陽からの光の筋（ゆっくりゆれる）
    for (let i = 0; i < 7; i++) {
      const a = -0.25 + i * 0.13 + Math.sin(t / 3200 + i * 1.7) * 0.03;
      const len = 520 + i * 30;
      const spread = 0.035 + (i % 3) * 0.012;
      const alpha = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(t / 1800 + i));
      const grad = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, len);
      grad.addColorStop(0, `rgba(255,236,170,${alpha * 2})`);
      grad.addColorStop(0.5, `rgba(255,214,140,${alpha})`);
      grad.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(SUN.x, SUN.y);
      ctx.lineTo(SUN.x + Math.cos(a - spread) * len, SUN.y + Math.sin(a - spread) * len);
      ctx.lineTo(SUN.x + Math.cos(a + spread) * len, SUN.y + Math.sin(a + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    // 太陽のまぶしさと、レンズの光の輪
    const pulse = 0.8 + 0.2 * Math.sin(t / 900);
    const sun = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 90);
    sun.addColorStop(0, `rgba(255,250,220,${0.55 * pulse})`);
    sun.addColorStop(0.3, `rgba(255,220,150,${0.22 * pulse})`);
    sun.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(SUN.x - 90, SUN.y - 90, 180, 180);
    const dx = WIDTH * 0.62 - SUN.x;
    const dy = HEIGHT * 0.58 - SUN.y;
    [[0.35, 10, 'rgba(255,220,160,0.10)'], [0.55, 18, 'rgba(160,220,255,0.07)'], [0.7, 6, 'rgba(255,240,200,0.14)'], [0.95, 26, 'rgba(220,170,255,0.06)']].forEach(([k, r, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(SUN.x + dx * k, SUN.y + dy * k, r * pulse, 0, Math.PI * 2);
      ctx.fill();
    });
    // 光の粒（ふわふわ。またたく）
    for (const m of this.motes) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(m.ph));
      const r = m.r * 3;
      const gm = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
      gm.addColorStop(0, m.warm ? `rgba(255,236,170,${0.75 * tw})` : `rgba(190,235,255,${0.75 * tw})`);
      gm.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = gm;
      ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // タイトルの文字・メニューより手前
  drawFront(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 稲妻（右上のうず）
    if (this.bolt) {
      const k = this.bolt.age / 520;
      const on = k < 0.25 || (k > 0.4 && k < 0.6);
      if (on) {
        const fl = ctx.createRadialGradient(540, 40, 0, 540, 40, 260);
        fl.addColorStop(0, 'rgba(220,180,255,0.35)');
        fl.addColorStop(1, 'rgba(160,100,255,0)');
        ctx.fillStyle = fl;
        ctx.fillRect(280, 0, WIDTH - 280, 260);
        ctx.strokeStyle = 'rgba(240,220,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = 'rgba(190,140,255,0.4)';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    }
    // 流れ星
    for (const c of this.comets) {
      const k = c.age / c.life;
      const a = Math.sin(k * Math.PI);
      const tail = 46;
      const len = Math.hypot(c.vx, c.vy);
      const tx = c.x - (c.vx / len) * tail;
      const ty = c.y - (c.vy / len) * tail;
      const gr = ctx.createLinearGradient(tx, ty, c.x, c.y);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, `rgba(255,250,220,${0.9 * a})`);
      ctx.strokeStyle = gr;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      star(ctx, c.x, c.y, 4 * a, `rgba(255,255,240,${a})`);
    }
    // 火の粉（火山の側）
    for (const e of this.embers) {
      const fl = 0.5 + 0.5 * Math.sin(e.ph * 3);
      ctx.fillStyle = `rgba(255,${140 + Math.round(80 * fl)},70,${(0.55 + 0.4 * fl) * e.life})`;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 2, 2);
    }
    // 星のきらめき
    for (const s of this.stars) {
      const k = s.age / s.life;
      const a = Math.sin(k * Math.PI);
      star(ctx, s.x, s.y, s.size * a, `rgba(255,255,255,${0.9 * a})`, k * 1.2);
    }
    ctx.restore();
    // 回る大きな結晶（光のかけら）
    for (const c of this.crystals) crystal(ctx, c.x + Math.sin(c.sway) * 8, c.y, c.size, c.rot, c.hue, t);
  }

  // タイトルの文字の上：流れる金色の輝き（文字の形にぬる）・きらめき・爆発
  drawLogo(ctx, t, font, title, x, y) {
    const w = font.width(title) + 8;
    const h = 44;
    if (!this.sheen || this.sheen.title !== title) {
      const mask = document.createElement('canvas');
      mask.width = w;
      mask.height = h;
      font.draw(mask.getContext('2d'), title, 4, 4, '#ffffff');
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      this.sheen = { title, mask, tmp };
    }
    const { mask, tmp } = this.sheen;
    const c = tmp.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-in';
    // 上から下へ：白っぽい金 → 濃い金。そこに、ななめの光の帯が流れる
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#fff8d8');
    base.addColorStop(0.45, '#ffd76a');
    base.addColorStop(0.55, '#f0a830');
    base.addColorStop(1, '#ffe7a0');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    // 光の帯は、今ある文字の上だけに重ねる（source-in のままだと、帯のない所の文字が消える）
    c.globalCompositeOperation = 'source-atop';
    const p = ((t / 2600) % 1.6) - 0.3;
    const band = c.createLinearGradient(w * p - 40, 0, w * p + 40, h);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = band;
    c.fillRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = `rgba(255,210,110,${0.6 + 0.3 * Math.sin(t / 700)})`;
    ctx.shadowBlur = 12 + 6 * Math.sin(t / 700);
    ctx.drawImage(tmp, x - 4, y - 4);
    ctx.restore();
    // きらめき・爆発・登場の時の白い光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const gl of this.glints) {
      const k = gl.age / gl.life;
      const a = Math.sin(k * Math.PI);
      star(ctx, gl.x, gl.y, gl.size * a, `rgba(255,255,255,${a})`, k);
    }
    for (const b of this.burst) {
      const a = 1 - b.age / b.life;
      ctx.fillStyle = b.gold ? `rgba(255,220,130,${a})` : `rgba(200,240,255,${a})`;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), b.size, b.size);
    }
    if (this.flashT > 0) {
      const fl = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.7);
      fl.addColorStop(0, `rgba(255,250,230,${0.8 * this.flashT})`);
      fl.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = fl;
      ctx.fillRect(x - w * 0.2, y - 60, w * 1.4, h + 120);
    }
    ctx.restore();
  }

  // メニューの選んでいる行のまわりに、小さなきらめき
  sparkleAround(x, y, w) {
    if (Math.random() < 0.25) this.glints.push({ x: x + rand(-10, w + 10), y: y + rand(-2, 18), age: 0, life: rand(350, 600), size: rand(3, 6) });
  }
}

// 4つの角の星（きらめき）。rot：回転
function star(ctx, x, y, r, color, rot = 0) {
  if (r <= 0.2) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.6);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.18 : r;
    const a = (i * Math.PI) / 4;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 回る結晶（細長いひし形。明るい面と暗い面、まわりに光）
function crystal(ctx, x, y, s, rot, hue, t) {
  const col = hue ? ['#c9b6ff', '#7d5cd6', 'rgba(190,150,255,'] : ['#bff0ff', '#4fa8d8', 'rgba(140,220,255,'];
  const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
  glow.addColorStop(0, `${col[2]}${0.35 + 0.15 * Math.sin(t / 500 + x)})`);
  glow.addColorStop(1, `${col[2]}0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
  const wdt = Math.max(1, Math.abs(Math.cos(rot)) * s * 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col[1];
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.6);
  ctx.lineTo(wdt, 0);
  ctx.lineTo(0, s * 1.6);
  ctx.lineTo(-wdt, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col[0];
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.6);
  ctx.lineTo(Math.cos(rot) > 0 ? wdt : -wdt, 0);
  ctx.lineTo(0, s * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(-0.5, -s * 1.2, 1, s * 0.8);
  ctx.restore();
}
