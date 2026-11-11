// マップを歩く場面。人と話す、調べる、出口で別のマップへ移る、イベントの台本を動かす
import { HEIGHT, TILE, WIDTH } from '../../config.js';
import { isActive, runScript } from '../../core/events.js';
import { entityAt, findStart, stepTarget, tryMove } from '../../core/map.js';
import { addPlayTime } from '../../core/state.js';
import { COLORS, drawWindow } from '../draw.js';
import { ChoiceScene } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';
import { FieldMenuScene } from './fieldmenu.js';
import { SaveLoadScene } from './saveload.js';

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const WALK_MS = 200;
const DASH_MS = 110;
const STEP_FRAMES = [0, 1, 2, 1];

export class FieldScene extends Scene {
  enter() {
    const g = this.game;
    const loc = g.state.location;
    this.map = g.maps.get(loc.map);
    if (!this.map) throw new Error(`マップ「${loc.map}」が見つかりません`);
    if (loc.x == null || loc.y == null) {
      const s = findStart(this.map);
      loc.x = s.x;
      loc.y = s.y;
      loc.dir = s.props.dir ?? 'down';
    }
    loc.placeName = this.map.props.name ?? '';
    this.pos = { x: loc.x, y: loc.y };
    this.dir = loc.dir ?? 'down';
    this.moving = null;
    this.stepCount = 0;
    this.time = 0;
    this.npcDirs = new Map();
    this.playerSprite = g.assets.image(`char:${playerCharacterId(g.state)}`);
    this.enterAt = performance.now();
    this.busy = false; // イベントの途中は、歩いたり話しかけたりできない
    this.waitT = 0;
    this.waitDone = null;
    this.autoDone = new Set();
    this.checkAuto = true;
    this.isOn = (o) => isActive(g.state, o);
    g.audio.playBgm(this.map.props.bgm ?? 'town');
  }

  resume() {
    if (!this.busy) this.game.audio.playBgm(this.map.props.bgm ?? 'town');
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    const loc = g.state.location;
    addPlayTime(g.state, dt);
    this.time += dt;

    if (this.waitT > 0) {
      this.waitT -= dt;
      if (this.waitT <= 0 && this.waitDone) {
        const done = this.waitDone;
        this.waitDone = null;
        done();
      }
    }

    let carry = 0; // 1歩が終わった時のあまりの時間。次の1歩に回して、歩きが止まって見えないようにする
    if (this.moving) {
      const m = this.moving;
      m.t += dt;
      if (m.t < m.dur) return;
      carry = m.t - m.dur;
      this.pos = m.to;
      loc.x = m.to.x;
      loc.y = m.to.y;
      this.moving = null;
      this.stepCount++;
      if (this.afterStep()) return;
    }
    if (this.busy) return;
    if (this.checkAuto) {
      this.checkAuto = false;
      if (this.runAuto()) return;
    }

    if (input.pressed('cancel')) {
      g.scenes.push(new FieldMenuScene());
      return;
    }
    if (input.pressed('ok')) {
      this.interact();
      return;
    }
    const dir = input.heldDir() ?? input.pressedDir();
    if (!dir) return;
    this.dir = dir;
    loc.dir = dir;
    const to = tryMove(this.map, this.pos, dir, this.isOn);
    if (to) {
      const dashing = g.state.flags.dash !== false && (g.settings.alwaysDash ? !input.dash() : input.dash());
      const dur = (dashing ? DASH_MS : WALK_MS) * (g.settings.moveSpeed === 1 ? 0.8 : 1);
      this.moving = { from: { ...this.pos }, to, t: Math.min(carry, dur * 0.9), dur };
    }
  }

  // 1歩進んだあと：出口や、ふむと始まるイベントを調べる
  afterStep() {
    const e = entityAt(this.map, this.pos.x, this.pos.y, this.isOn);
    if (!e) return false;
    if (e.type === 'exit') {
      this.busy = true;
      this.transfer(e.props);
      return true;
    }
    if (e.type === 'trigger' && e.props.script) {
      this.run(this.game.scripts[e.props.script]);
      return true;
    }
    return false;
  }

  // マップに入った時などに、自動で始まるイベント
  runAuto() {
    const e = this.map.objects.find((o) => o.type === 'auto' && this.isOn(o) && !this.autoDone.has(o.id));
    if (!e) return false;
    this.autoDone.add(e.id);
    this.run(this.game.scripts[e.props.script]);
    return true;
  }

  async run(commands, npc = null) {
    const g = this.game;
    this.busy = true;
    g.input.clear();
    try {
      await runScript(commands, { state: g.state, scripts: g.scripts, ui: this.ui(npc) });
    } finally {
      this.busy = false;
      if (npc) this.npcDirs.delete(npc.id);
      this.checkAuto = true; // フラグが変わって、次のイベントが始まるかもしれない
    }
  }

  // 台本から頼まれる、画面の仕事
  ui(npc) {
    const g = this.game;
    const show = (lines) =>
      new Promise((done) => g.scenes.push(new MessageScene(lines, { defaultFaceKey: npc?.props.character ?? null, onDone: done })));
    return {
      say: (what) => show(Array.isArray(what) ? what : g.dialogues[what] ?? [`（セリフ「${what}」が見つかりません）`]),
      notice: (text) => show([text]),
      se: (name) => g.audio.playSe(name),
      bgm: (name) => g.audio.playBgm(name),
      bgmStop: (ms) => g.audio.stopBgm(ms ?? 500),
      wait: (ms) =>
        new Promise((done) => {
          this.waitT = ms;
          this.waitDone = done;
        }),
      transfer: (to) => new Promise(() => this.transfer(to)), // 別のマップへ移るので、この先は実行しない
    };
  }

  transfer(to) {
    const g = this.game;
    g.scenes.fadeTo(() => {
      const loc = g.state.location;
      loc.map = to.map;
      loc.x = to.x != null ? Number(to.x) : null;
      loc.y = to.y != null ? Number(to.y) : null;
      loc.dir = to.dir ?? loc.dir;
      g.scenes.replaceAll(new FieldScene());
    }, 300);
  }

  interact() {
    const g = this.game;
    const f = stepTarget(this.pos, this.dir);
    const e = entityAt(this.map, f.x, f.y, this.isOn);
    if (!e) return;
    if (e.type === 'npc') {
      this.npcDirs.set(e.id, OPPOSITE[this.dir]);
      this.run(e.props.script ? g.scripts[e.props.script] : [{ say: e.props.dialogue }], e);
    } else if (e.type === 'savepoint') {
      g.scenes.push(new MessageScene(['光の結晶が、やさしく光っている…'], { onDone: () => this.savePointMenu() }));
    } else if (e.type === 'sign') {
      this.run(e.props.script ? g.scripts[e.props.script] : [{ notice: e.props.text ?? '' }]);
    }
  }

  savePointMenu() {
    const g = this.game;
    g.scenes.push(
      new ChoiceScene({
        items: [
          { label: 'セーブ', value: 'save' },
          { label: 'ロード', value: 'load' },
          { label: 'とじる', value: 'close' },
        ],
        x: 24,
        y: 24,
        width: 150,
        onSelect: (item) => {
          if (item.value === 'save') g.scenes.push(new SaveLoadScene({ mode: 'save' }));
          else if (item.value === 'load') g.scenes.push(new SaveLoadScene({ mode: 'load' }));
        },
      }),
    );
  }

  playerPixel() {
    if (!this.moving) return { x: this.pos.x * TILE, y: this.pos.y * TILE };
    const m = this.moving;
    const k = Math.min(1, m.t / m.dur);
    return { x: (m.from.x + (m.to.x - m.from.x) * k) * TILE, y: (m.from.y + (m.to.y - m.from.y) * k) * TILE };
  }

  draw(ctx) {
    const map = this.map;
    const p = this.playerPixel();
    const mapW = map.width * TILE;
    const mapH = map.height * TILE;
    // 位置は、実際の画面の1画素の単位にそろえる（なめらかに動き、タイルのすき間も出ない）
    const S = this.game.screen.renderScale || 1;
    const snap = (v) => Math.round(v * S) / S;
    const camX = mapW <= WIDTH ? Math.round((mapW - WIDTH) / 2) : clamp(snap(p.x + TILE / 2 - WIDTH / 2), 0, mapW - WIDTH);
    const camY = mapH <= HEIGHT ? Math.round((mapH - HEIGHT) / 2) : clamp(snap(p.y + TILE / 2 - HEIGHT / 2), 0, mapH - HEIGHT);

    ctx.fillStyle = map.props.back ?? '#1b1722';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const name of map.layerOrder) {
      if (name === 'collision') continue;
      const layer = map.layers[name];
      if (layer.visible) drawTileLayer(ctx, map, layer, camX, camY);
    }

    // 人を、下にいる順に描く（手前の人が上に重なる）
    const sprites = [];
    for (const o of map.objects) {
      if (!this.isOn(o)) continue;
      if (o.type === 'npc') {
        const img = this.game.assets.image(`char:${o.props.character}`);
        sprites.push({ y: o.y * TILE, draw: () => drawChar(ctx, img, o.x * TILE - camX, o.y * TILE - camY, this.npcDirs.get(o.id) ?? o.props.dir ?? 'down', 1) });
      } else if (o.type === 'savepoint') {
        sprites.push({ y: o.y * TILE, draw: () => drawCrystal(ctx, o.x * TILE - camX, o.y * TILE - camY, this.time) });
      }
    }
    const frame = this.moving ? STEP_FRAMES[Math.floor(this.stepCount * 2 + (this.moving.t / this.moving.dur) * 2) % 4] : 1;
    sprites.push({ y: p.y, draw: () => drawChar(ctx, this.playerSprite, snap(p.x) - camX, snap(p.y) - camY, this.dir, frame) });
    sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

    this.drawBanner(ctx);
  }

  // マップに入った時、場所の名前を画面の上に2秒ほど出す
  drawBanner(ctx) {
    const name = this.map.props.name;
    const t = performance.now() - this.enterAt; // 会話の途中でも消えるように、実際の時間で数える
    if (!name || t > 2400) return;
    const a = t < 2000 ? 1 : 1 - (t - 2000) / 400;
    ctx.globalAlpha = Math.max(0, a);
    const w = this.game.font.width(name) + 48;
    drawWindow(ctx, WIDTH / 2 - w / 2, 14, w, 36);
    this.game.font.drawCentered(ctx, name, WIDTH / 2, 24, COLORS.title);
    ctx.globalAlpha = 1;
  }
}

function playerCharacterId(state) {
  const p = state.player;
  return `hero_${p.gender === 'female' ? 'f' : 'm'}_${p.job === 'mage' ? 'mage' : 'sword'}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function drawTileLayer(ctx, map, layer, camX, camY) {
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.width - 1, Math.floor((camX + WIDTH) / TILE));
  const y1 = Math.min(map.height - 1, Math.floor((camY + HEIGHT) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const gid = layer.data[y * map.width + x] & 0x1fffffff;
      if (!gid) continue;
      const ts = tilesetFor(map, gid);
      const dx = x * TILE - camX;
      const dy = y * TILE - camY;
      if (!ts?.img) {
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(dx, dy, TILE, TILE);
        continue;
      }
      const local = gid - ts.firstgid;
      ctx.drawImage(ts.img, (local % ts.columns) * TILE, Math.floor(local / ts.columns) * TILE, TILE, TILE, dx, dy, TILE, TILE);
    }
  }
}

function tilesetFor(map, gid) {
  let found = null;
  for (const ts of map.tilesetImages) if (ts.firstgid <= gid && (!found || ts.firstgid > found.firstgid)) found = ts;
  return found;
}

function drawChar(ctx, img, x, y, dir, frame) {
  if (!img) {
    ctx.fillStyle = '#e8a0a0';
    ctx.fillRect(x + 6, y + 4, 20, 26);
    return;
  }
  ctx.drawImage(img, frame * 32, (DIR_ROW[dir] ?? 0) * 32, 32, 32, x, y, 32, 32);
}

// 光の結晶（セーブポイント）。段階9までの仮の絵
function drawCrystal(ctx, x, y, t) {
  const bob = Math.round(Math.sin(t / 400) * 2);
  const glow = 0.25 + 0.15 * Math.sin(t / 300);
  ctx.fillStyle = `rgba(255, 250, 200, ${glow})`;
  ctx.fillRect(x + 4, y + 4 + bob, 24, 24);
  ctx.fillStyle = 'rgba(80, 60, 40, 0.25)';
  ctx.fillRect(x + 9, y + 28, 14, 3);
  const rows = [2, 4, 6, 8, 10, 12, 12, 10, 8, 6, 4, 2];
  rows.forEach((w, i) => {
    ctx.fillStyle = i < 6 ? '#bfe9ff' : '#8fd3f5';
    ctx.fillRect(x + 16 - w / 2, y + 7 + Math.round(i * 1.6) + bob, w, 2);
  });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 13, y + 10 + bob, 2, 4);
}
