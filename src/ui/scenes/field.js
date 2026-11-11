// マップを歩く場面（段階1では、操作と会話とセーブを試すための「テストの部屋」）
import { HEIGHT, TILE, WIDTH } from '../../config.js';
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
const WALK_MS = 210;
const DASH_MS = 115;
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
    this.animT = 0;
    this.time = 0;
    this.npcDirs = new Map();
    this.playerSprite = g.assets.image(`char:${playerCharacterId(g.state)}`);
    this.bannerT = 0;
    g.audio.playBgm(this.map.props.bgm ?? 'town');
  }

  resume() {
    this.game.audio.playBgm(this.map.props.bgm ?? 'town');
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    const loc = g.state.location;
    addPlayTime(g.state, dt);
    this.time += dt;
    this.bannerT += dt;

    if (this.moving) {
      const m = this.moving;
      m.t += dt;
      this.animT += dt;
      if (m.t < m.dur) return;
      this.pos = m.to;
      loc.x = m.to.x;
      loc.y = m.to.y;
      this.moving = null;
      this.stepCount++;
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
    if (!dir) {
      this.animT = 0;
      return;
    }
    this.dir = dir;
    loc.dir = dir;
    const to = tryMove(this.map, this.pos, dir);
    if (to) this.moving = { from: { ...this.pos }, to, t: 0, dur: input.dash() ? DASH_MS : WALK_MS };
  }

  interact() {
    const g = this.game;
    const f = stepTarget(this.pos, this.dir);
    const e = entityAt(this.map, f.x, f.y);
    if (!e) return;
    if (e.type === 'npc') {
      this.npcDirs.set(e.id, OPPOSITE[this.dir]);
      const lines = g.dialogues[e.props.dialogue] ?? ['……。'];
      g.scenes.push(new MessageScene(lines, { defaultFaceKey: e.props.character, onDone: () => this.npcDirs.delete(e.id) }));
    } else if (e.type === 'savepoint') {
      g.scenes.push(new MessageScene(['光の結晶が、やさしく光っている…'], { onDone: () => this.savePointMenu() }));
    } else if (e.type === 'sign') {
      g.scenes.push(new MessageScene([e.props.text ?? '']));
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
    const camX = mapW <= WIDTH ? Math.round((mapW - WIDTH) / 2) : clamp(Math.round(p.x + TILE / 2 - WIDTH / 2), 0, mapW - WIDTH);
    const camY = mapH <= HEIGHT ? Math.round((mapH - HEIGHT) / 2) : clamp(Math.round(p.y + TILE / 2 - HEIGHT / 2), 0, mapH - HEIGHT);

    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const name of map.layerOrder) {
      if (name === 'collision') continue;
      const layer = map.layers[name];
      if (layer.visible) drawTileLayer(ctx, map, layer, camX, camY);
    }

    // 人を、下にいる順に描く（手前の人が上に重なる）
    const sprites = [];
    for (const o of map.objects) {
      if (o.type === 'npc') {
        const img = this.game.assets.image(`char:${o.props.character}`);
        sprites.push({ y: o.y * TILE, draw: () => drawChar(ctx, img, o.x * TILE - camX, o.y * TILE - camY, this.npcDirs.get(o.id) ?? o.props.dir ?? 'down', 1) });
      } else if (o.type === 'savepoint') {
        sprites.push({ y: o.y * TILE, draw: () => drawCrystal(ctx, o.x * TILE - camX, o.y * TILE - camY, this.time) });
      }
    }
    const frame = this.moving ? STEP_FRAMES[Math.floor((this.stepCount * 2 + this.moving.t / this.moving.dur * 2)) % 4] : 1;
    sprites.push({ y: p.y, draw: () => drawChar(ctx, this.playerSprite, p.x - camX, p.y - camY, this.dir, frame) });
    sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

    this.drawBanner(ctx);
  }

  // マップに入った時、場所の名前を画面の上に2秒ほど出す
  drawBanner(ctx) {
    const name = this.map.props.name;
    if (!name || this.bannerT > 2400) return;
    const a = this.bannerT < 2000 ? 1 : 1 - (this.bannerT - 2000) / 400;
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
  x = Math.round(x);
  y = Math.round(y);
  if (!img) {
    ctx.fillStyle = '#e8a0a0';
    ctx.fillRect(x + 6, y + 4, 20, 26);
    return;
  }
  ctx.drawImage(img, frame * 32, (DIR_ROW[dir] ?? 0) * 32, 32, 32, x, y, 32, 32);
}

// 光の結晶（セーブポイント）。段階9までの仮の絵
function drawCrystal(ctx, x, y, t) {
  x = Math.round(x);
  y = Math.round(y);
  const bob = Math.round(Math.sin(t / 400) * 2);
  const glow = 0.25 + 0.15 * Math.sin(t / 300);
  ctx.fillStyle = `rgba(255, 250, 200, ${glow})`;
  ctx.fillRect(x + 4, y + 4 + bob, 24, 24);
  ctx.fillStyle = 'rgba(80, 60, 40, 0.25)';
  ctx.fillRect(x + 9, y + 28, 14, 3);
  const rows = [2, 4, 6, 8, 10, 12, 12, 10, 8, 6, 4, 2];
  rows.forEach((w, i) => {
    const yy = y + 7 + i * 1.6 + bob;
    ctx.fillStyle = i < 6 ? '#bfe9ff' : '#8fd3f5';
    ctx.fillRect(x + 16 - w / 2, Math.round(yy), w, 2);
  });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 13, y + 10 + bob, 2, 4);
}
