// タイトル画面：Adobe Firefly で作った2枚の絵（assets/title）が、ゆっくり動きながら切りかわる。きらきらの演出は src/ui/titlefx.js
// （光の筋・光の粒・星・結晶・火の粉・流れ星・稲妻・文字の輝きと爆発）。絵が読めない時は、前の空と丘の背景

import { HEIGHT, WIDTH } from '../../config.js';
import { hasAnySave } from '../../core/save.js';
import { drawCursor, drawSkyGradient } from '../draw.js';
import { Menu } from '../menu.js';
import { Scene } from '../scene.js';
import { NewGameScene } from './newgame.js';
import { SaveLoadScene } from './saveload.js';
import { SettingsScene } from './settings.js';
import { TitleFx } from '../titlefx.js';

export class TitleScene extends Scene {
  enter() {
    this.t = 0;
    // 光の結晶のかけら（下から上へ、ゆらゆら舞う）
    this.shards = Array.from({ length: 34 }, (_, i) => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, v: 0.006 + Math.random() * 0.012, sway: Math.random() * 6.28, size: 1 + Math.floor(Math.random() * 3), hue: i % 3 }));
    this.fx = new TitleFx(); // きらきらの演出（src/ui/titlefx.js）
    this.game.state = null;
    this.makeMenu();
    this.game.audio.playBgm('title');
  }

  resume() {
    this.makeMenu();
    this.game.audio.playBgm('title');
  }

  makeMenu() {
    const hasSave = hasAnySave(this.game.store);
    const prev = this.menu?.index;
    this.menu = new Menu({
      items: [
        { label: 'はじめから', value: 'new', se: 'start' },
        { label: 'つづきから', value: 'continue', se: 'start', disabled: !hasSave },
        { label: 'せってい', value: 'settings' },
      ],
      x: WIDTH / 2 - 84,
      y: 252,
      width: 168,
      cancelable: false,
      index: prev ?? (hasSave ? 1 : 0),
    });
  }

  update(dt) {
    this.t += dt;
    for (const p of this.shards ?? []) {
      p.y -= p.v * dt;
      p.sway += dt / 900;
      if (p.y < -6) {
        p.y = HEIGHT + 6;
        p.x = Math.random() * WIDTH;
      }
    }
    const g = this.game;
    this.fx.update(dt, this.t, this.logoRect());
    const r = this.menu.update(g.input, g.audio);
    if (!r || r.type !== 'select') return;
    if (r.item.value === 'new') {
      g.scenes.fadeTo(() => g.scenes.replaceAll(new NewGameScene()), 400);
    } else if (r.item.value === 'continue') {
      g.scenes.push(new SaveLoadScene({ mode: 'load' }));
    } else if (r.item.value === 'settings') {
      g.scenes.push(new SettingsScene({ inGame: false }));
    }
  }

  draw(ctx) {
    const g = this.game;
    const pics = [g.assets.image('img:title_a'), g.assets.image('img:title_b')].filter(Boolean);
    if (pics.length) this.drawPictures(ctx, pics);
    else this.drawPlainSky(ctx);
    this.fx.drawBack(ctx, this.t);
    this.drawShards(ctx);
    this.fx.drawFront(ctx, this.t);
    this.drawLogo(ctx);
    if (g.scenes.top === this) this.drawMenu(ctx);
    // 始まりは黒からふわっと
    const fade = 1 - Math.min(1, this.t / 1200);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  // タイトルの文字の場所（きらめきを出す所）
  logoRect() {
    const font = this.game.fontBig;
    const w = font.width('ヤバい世界の救い方');
    return { x: Math.round(WIDTH / 2 - w / 2), y: 46, w, h: 36 };
  }

  // メニュー：窓は出さず、絵の上に光る文字だけ（行の位置とタップの範囲は Menu と同じ）
  drawMenu(ctx) {
    const g = this.game;
    const m = this.menu;
    m.w = m.width; // タップの当たり判定
    const appear = Math.min(1, Math.max(0, (this.t - 900) / 600));
    ctx.save();
    ctx.globalAlpha = appear;
    m.items.forEach((item, i) => {
      const y = m.y + 9 + i * 26 + 4;
      const sel = i === m.index;
      const w = g.font.width(item.label);
      const x = Math.round(WIDTH / 2 - w / 2);
      if (sel) {
        // 選んでいる行：うしろに光の帯
        const band = ctx.createLinearGradient(WIDTH / 2 - 110, 0, WIDTH / 2 + 110, 0);
        band.addColorStop(0, 'rgba(255,224,138,0)');
        band.addColorStop(0.5, 'rgba(255,224,138,0.28)');
        band.addColorStop(1, 'rgba(255,224,138,0)');
        ctx.fillStyle = band;
        ctx.fillRect(WIDTH / 2 - 110, y - 3, 220, 22);
      }
      const color = item.disabled ? '#8a86a8' : sel ? '#ffe08a' : '#f4f0ff';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.font.draw(ctx, item.label, x + dx, y + dy, '#0b0820');
      g.font.draw(ctx, item.label, x, y, color);
      if (sel) {
        this.fx.sparkleAround(x, y, w);
        const bob = Math.round(Math.sin(this.t / 160) * 2);
        drawCursor(ctx, x - 20 + bob, y + 2);
        drawCursor(ctx, x + w + 8 - bob, y + 2);
      }
    });
    ctx.restore();
  }

  // 絵：1枚12秒。少しずつ大きくなりながら横にずれ（ケン・バーンズ）、2秒かけて次の絵に切りかわる
  drawPictures(ctx, pics) {
    const SHOW = 12000;
    const FADE = 2000;
    const n = pics.length;
    const i = Math.floor(this.t / SHOW) % n;
    const k = (this.t % SHOW) / SHOW;
    const paint = (img, p, alpha, dir) => {
      const s = 1.03 + 0.06 * p;
      const w = WIDTH * s;
      const h = HEIGHT * s;
      const x = -(w - WIDTH) * (dir > 0 ? p : 1 - p);
      const y = -(h - HEIGHT) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, w, h);
      ctx.globalAlpha = 1;
    };
    paint(pics[i], k, 1, i % 2 ? -1 : 1);
    const left = SHOW - (this.t % SHOW);
    if (n > 1 && left < FADE) paint(pics[(i + 1) % n], 0, 1 - left / FADE, (i + 1) % 2 ? -1 : 1);
    // 上（タイトルの文字）と下（メニュー）を少し暗くして、文字を読みやすく
    const top = ctx.createLinearGradient(0, 0, 0, 150);
    top.addColorStop(0, 'rgba(8,6,24,0.55)');
    top.addColorStop(1, 'rgba(8,6,24,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, WIDTH, 150);
    const bottom = ctx.createLinearGradient(0, HEIGHT - 170, 0, HEIGHT);
    bottom.addColorStop(0, 'rgba(8,6,24,0)');
    bottom.addColorStop(1, 'rgba(8,6,24,0.6)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, HEIGHT - 170, WIDTH, 170);
  }

  // 絵が読めない時の背景（前のタイトル画面）
  drawPlainSky(ctx) {
    drawSkyGradient(ctx, WIDTH, HEIGHT, '#bfe4f6', '#fde9d6');
    const dark = ctx.createLinearGradient(WIDTH * 0.55, 0, WIDTH, 0);
    dark.addColorStop(0, 'rgba(70, 50, 110, 0)');
    dark.addColorStop(1, 'rgba(70, 50, 110, 0.55)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, WIDTH, 220);
    ctx.fillStyle = '#b7dca0';
    for (let x = 0; x < WIDTH; x += 2) {
      const h = 40 + Math.sin(x / 90) * 12 + Math.sin(x / 37) * 4;
      ctx.fillRect(x, HEIGHT - 120 - h, 2, h + 120);
    }
  }

  // 光の結晶のかけら（ひし形。またたく）
  drawShards(ctx) {
    const colors = ['#fff3c0', '#bfe9ff', '#e6c8ff'];
    for (const p of this.shards ?? []) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(p.sway * 2.3));
      const x = p.x + Math.sin(p.sway) * 6;
      ctx.globalAlpha = tw * 0.9;
      ctx.fillStyle = colors[p.hue];
      ctx.beginPath();
      ctx.moveTo(x, p.y - p.size * 2);
      ctx.lineTo(x + p.size, p.y);
      ctx.lineTo(x, p.y + p.size * 2);
      ctx.lineTo(x - p.size, p.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // タイトルの文字：濃い紺のふち＋金色の光、下に結晶の飾りの線。ときどき光が横切る
  drawLogo(ctx) {
    const g = this.game;
    const font = g.fontBig;
    const title = 'ヤバい世界の救い方';
    const tw = font.width(title);
    const tx = Math.round(WIDTH / 2 - tw / 2);
    const appear = Math.min(1, Math.max(0, (this.t - 300) / 900));
    const ty = 46 - Math.round((1 - appear) * 14);
    ctx.save();
    ctx.globalAlpha = appear;
    for (let r = 3; r >= 1; r--) {
      for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, r], [-r, r], [r, -r]]) font.draw(ctx, title, tx + dx, ty + dy, r === 3 ? '#0b0820' : '#3a2a10');
    }
    // 文字の中：流れる金色の輝き・きらめき・登場の時の光の爆発（src/ui/titlefx.js）
    this.fx.drawLogo(ctx, this.t, font, title, tx, ty);
    // 下の飾り：金の線と、両はしの結晶
    const ly = ty + 46;
    const line = ctx.createLinearGradient(tx - 30, 0, tx + tw + 30, 0);
    line.addColorStop(0, 'rgba(255,224,138,0)');
    line.addColorStop(0.5, 'rgba(255,224,138,0.95)');
    line.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = line;
    ctx.fillRect(tx - 30, ly, tw + 60, 2);
    for (const gx of [tx - 34, tx + tw + 34]) {
      ctx.fillStyle = '#7ad0ff';
      ctx.beginPath();
      ctx.moveTo(gx, ly - 6);
      ctx.lineTo(gx + 4, ly + 1);
      ctx.lineTo(gx, ly + 8);
      ctx.lineTo(gx - 4, ly + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx - 1, ly - 3, 1, 3);
    }
    ctx.restore();
  }
}
