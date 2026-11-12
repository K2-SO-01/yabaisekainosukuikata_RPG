// マップを歩く場面。人と話す、調べる、出口で別のマップへ移る、イベントの台本を動かす
import { HEIGHT, TILE, WIDTH } from '../../config.js';
import { isActive, runScript } from '../../core/events.js';
import { canWalk, entityAt, findStart, stepTarget, tryMove } from '../../core/map.js';
import { addItem, createMember, fullRecover, MEMBER_DEFS } from '../../core/party.js';
import { writeSlot } from '../../core/save.js';
import { addGold, addPlayTime } from '../../core/state.js';
import { fillName } from '../../core/text.js';
import { COLORS, drawWindow } from '../draw.js';
import { say } from '../flow.js';
import { ChoiceScene } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';
import { FieldMenuScene } from './fieldmenu.js';
import { RestScene } from './rest.js';
import { SaveLoadScene } from './saveload.js';
import { openShop } from './shop.js';

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const WALK_MS = 200;
const DASH_MS = 110;
const STEP_FRAMES = [0, 1, 2, 1];
const NPC_STEP_MS = 320;
const CHEST_CLOSED = 863;
const CHEST_OPEN = 871;
const SEARCH_WORDS = { pot: 'つぼ', drawer: 'タンス' };

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
    this.placeLabel = fillName(this.map.props.name ?? '', g.state.player.name);
    loc.placeName = this.placeLabel;
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
    // 行ったことのある町や村（ワープポーションの行き先）
    if (this.map.props.town) {
      g.state.visited ??= [];
      if (!g.state.visited.includes(this.map.props.town)) g.state.visited.push(this.map.props.town);
    }
    // 歩き回る人は、マップに入るたびに元の場所へ戻す
    for (const o of this.map.objects) {
      if (o.type !== 'npc' || !o.props.wander) continue;
      o.home ??= { x: o.x, y: o.y };
      o.x = o.home.x;
      o.y = o.home.y;
      o.mv = null;
      o.wait = 1000 + Math.random() * 2500;
    }
    g.warpTo = (dest) => this.transfer(dest);
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

    this.updateWalkers(dt);

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
      g.scenes.push(new FieldMenuScene({ mapProps: this.map.props }));
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

  // 歩き回る町の人（家から2マスまで。イベント中と、主人公が話しかけている間は止まる）
  updateWalkers(dt) {
    for (const o of this.map.objects) {
      if (o.type !== 'npc' || !o.props.wander || !this.isOn(o)) continue;
      if (o.mv) {
        o.mv.t += dt;
        if (o.mv.t >= NPC_STEP_MS) o.mv = null;
        continue;
      }
      if (this.busy || this.npcDirs.has(o.id)) continue;
      o.wait -= dt;
      if (o.wait > 0) continue;
      o.wait = 1200 + Math.random() * 2800;
      const dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
      const t = stepTarget(o, dir);
      o.facing = dir;
      if (Math.abs(t.x - o.home.x) > 2 || Math.abs(t.y - o.home.y) > 2) continue;
      if (!canWalk(this.map, t.x, t.y, this.isOn)) continue;
      const p = this.moving ? this.moving.to : this.pos;
      if ((t.x === p.x && t.y === p.y) || (t.x === this.pos.x && t.y === this.pos.y)) continue;
      if (this.map.objects.some((x) => x !== o && (x.type === 'exit' || x.type === 'trigger') && x.x === t.x && x.y === t.y)) continue;
      o.mv = { from: { x: o.x, y: o.y }, t: 0 };
      o.x = t.x;
      o.y = t.y;
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
    } catch (err) {
      console.error(err);
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
      notice: (text) => show([typeof text === 'string' ? text : g.screen.touchEnabled ? text.touch : text.pc]),
      // たずねる：セリフの窓を残したまま選択肢を出し、選んだ番号を返す（キャンセルは最後の選択肢）
      choice: (what, items) =>
        new Promise((done) => {
          const lines = Array.isArray(what) ? what : g.dialogues[what] ?? [''];
          const msg = new MessageScene(lines, {
            defaultFaceKey: npc?.props.character ?? null,
            keepOpen: true,
            onDone: () => {
              const finish = (i) => {
                g.scenes.pop(msg);
                done(i);
              };
              g.scenes.push(
                new ChoiceScene({
                  items: items.map((label, i) => ({ label, value: i })),
                  x: WIDTH - 150,
                  y: HEIGHT - 124 - items.length * 26 - 22,
                  width: 130,
                  onSelect: (item) => finish(item.value),
                  onCancel: () => finish(items.length - 1),
                }),
              );
            },
          });
          g.scenes.push(msg);
        }),
      rest: (what) => new Promise((done) => g.scenes.push(new RestScene({ lines: g.dialogues[what] ?? [''], onDone: done }))),
      autosave: () => writeSlot(g.store, 'auto', g.state),
      recover: () => fullRecover(g.state, g.items),
      shop: (id) => openShop(g, id),
      join: (id) => {
        if (g.state.party.some((m) => m.id === id)) return;
        const def = MEMBER_DEFS[id] ?? {};
        g.state.party.push(createMember({ id, job: def.job ?? 'priest', level: def.level ?? 1, equip: def.equip ?? {} }, g.items));
      },
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
    let e = entityAt(this.map, f.x, f.y, this.isOn);
    if (!e) {
      // カウンターの向こうの人（お店の人）とも話せる
      const f2 = stepTarget(f, this.dir);
      const e2 = entityAt(this.map, f2.x, f2.y, this.isOn);
      if (e2?.type === 'npc' && e2.props.counter) e = e2;
    }
    if (!e) return;
    if (e.type === 'search') {
      this.search(e);
      return;
    }
    if (e.type === 'npc') {
      this.npcDirs.set(e.id, OPPOSITE[this.dir]);
      this.run(e.props.script ? g.scripts[e.props.script] : [{ say: e.props.dialogue }], e);
    } else if (e.type === 'savepoint') {
      g.scenes.push(new MessageScene(['光の結晶が、やさしく光っている…'], { onDone: () => this.savePointMenu() }));
    } else if (e.type === 'sign') {
      this.run(e.props.script ? g.scripts[e.props.script] : [{ notice: e.props.text ?? '' }]);
    }
  }

  // 壺・タンス・宝箱を調べる。中身は1回だけ取れる
  async search(o) {
    const g = this.game;
    const st = g.state;
    const p = o.props;
    const key = `got_${st.location.map}_${o.id}`;
    const name = st.player.name;
    const itemName = g.items[p.item]?.name ?? p.item;
    const full = p.item && (st.bag?.[p.item] ?? 0) >= 99;
    this.busy = true;
    g.input.clear();
    try {
      if (p.kind === 'chest') {
        if (st.flags[key]) return await say(g, '宝箱は からっぽだ。');
        if (full) return await say(g, [`${name}は 宝箱を開けた！`, `${itemName}が 入っている。`, 'しかし これ以上 持てない！']);
        st.flags[key] = true;
        g.audio.playSe('chest');
        if (p.gold) {
          addGold(st, Number(p.gold));
          return await say(g, [`${name}は 宝箱を開けた！`, `${p.gold}ゴールドを 手に入れた！`]);
        }
        addItem(st, p.item, Number(p.count ?? 1));
        return await say(g, [`${name}は 宝箱を開けた！`, `${itemName}を 手に入れた！`]);
      }
      const where = SEARCH_WORDS[p.kind] ?? 'つぼ';
      if (st.flags[key] || (!p.item && !p.gold)) return await say(g, `${where}の中は からっぽだ。`);
      if (full) return await say(g, [`${where}の中に ${itemName}が 入っている。`, 'しかし これ以上 持てない！']);
      st.flags[key] = true;
      if (p.gold) {
        addGold(st, Number(p.gold));
        g.audio.playSe('gold_get');
        return await say(g, `${name}は ${where}の中から ${p.gold}ゴールドを 見つけた！`);
      }
      addItem(st, p.item, Number(p.count ?? 1));
      g.audio.playSe('item_get');
      await say(g, `${name}は ${where}の中から ${itemName}を 見つけた！`);
    } finally {
      this.busy = false;
      g.input.clear();
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
    const lift = cameraLift(map.props.lift, p.y / TILE) * TILE;
    const camY = mapH <= HEIGHT ? Math.round((mapH - HEIGHT) / 2) : clamp(snap(p.y - lift + TILE / 2 - HEIGHT / 2), 0, mapH - HEIGHT);

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
        let px = o.x * TILE;
        let py = o.y * TILE;
        let frame = 1;
        if (o.mv) {
          const k = Math.min(1, o.mv.t / NPC_STEP_MS);
          px = (o.mv.from.x + (o.x - o.mv.from.x) * k) * TILE;
          py = (o.mv.from.y + (o.y - o.mv.from.y) * k) * TILE;
          frame = k < 0.5 ? 0 : 2;
        }
        const dir = this.npcDirs.get(o.id) ?? o.facing ?? o.props.dir ?? 'down';
        sprites.push({ y: py, draw: () => drawChar(ctx, img, snap(px) - camX, snap(py) - camY, dir, frame) });
      } else if (o.type === 'search' && o.props.kind === 'chest') {
        const opened = this.game.state.flags[`got_${this.game.state.location.map}_${o.id}`];
        sprites.push({ y: o.y * TILE - 1, draw: () => drawGid(ctx, map, opened ? CHEST_OPEN : CHEST_CLOSED, o.x * TILE - camX, o.y * TILE - camY) });
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
    const name = this.placeLabel;
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

// マップの設定 lift「タイル数,ここまで全部,ここで0」：上にある大きな物（お城など）の近くでは、
// カメラを上へずらして全体が見えるようにする。下へ歩くほど、ふつうのカメラに戻る
function cameraLift(setting, row) {
  if (!setting) return 0;
  const [tiles, full, zero] = String(setting).split(',').map(Number);
  if (row <= full) return tiles;
  if (row >= zero) return 0;
  return (tiles * (zero - row)) / (zero - full);
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

function drawGid(ctx, map, gid, dx, dy) {
  const ts = tilesetFor(map, gid);
  if (!ts?.img) return;
  const local = gid - ts.firstgid;
  ctx.drawImage(ts.img, (local % ts.columns) * TILE, Math.floor(local / ts.columns) * TILE, TILE, TILE, dx, dy, TILE, TILE);
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
