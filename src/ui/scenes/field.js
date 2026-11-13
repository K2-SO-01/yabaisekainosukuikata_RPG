// マップを歩く場面。人と話す、調べる、出口で別のマップへ移る、イベントの台本を動かす
import { HEIGHT, TILE, WIDTH } from '../../config.js';
import { isActive, runScript } from '../../core/events.js';
import { encounterRoll, rollEncounter } from '../../core/battle.js';
import { canWalk, DIRS, entityAt, findStart, stepTarget, tryMove } from '../../core/map.js';
import { addItem, createMember, fullRecover, MEMBER_DEFS, partnerOf, totalStats } from '../../core/party.js';
import { markCleared, writeSlot } from '../../core/save.js';
import { addGold, addPlayTime } from '../../core/state.js';
import { fillName } from '../../core/text.js';
import { COLORS, drawWindow } from '../draw.js';
import { ask, say } from '../flow.js';
import { ChoiceScene } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';
import { BattleScene } from './battle.js';
import { BlackTextScene, EndRollScene, TheEndScene } from './ending.js';
import { FanfareScene } from './fanfare.js';
import { TitleScene } from './title.js';
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
    // 前の版の家やお店の中でセーブしたデータは、城下町の同じ建物の中へ
    const MOVED = { home: [4, 21], house2: [3, 12], house3: [4, 28], shop_weapon: [33, 12], shop_item: [27, 21] };
    if (!g.maps.has(loc.map) && MOVED[loc.map]) Object.assign(loc, { map: 'town', x: MOVED[loc.map][0], y: MOVED[loc.map][1], dir: 'down' });
    this.map = g.maps.get(loc.map);
    if (!this.map) throw new Error(`マップ「${loc.map}」が見つかりません`);
    // 地図を作り直す前のセーブで、今は壁や地図の外になる場所なら、そのマップの始まりの場所へ
    if (loc.x != null && loc.y != null && !canWalk(this.map, loc.x, loc.y, () => false)) {
      loc.x = null;
      loc.y = null;
    }
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
    // 人は、マップに入るたびに元の場所・元の向きへ戻す（歩き回る人や、イベントで動いた人）
    for (const o of this.map.objects) {
      if (o.type !== 'npc') continue;
      o.home ??= { x: o.x, y: o.y };
      o.x = o.home.x;
      o.y = o.home.y;
      o.mv = null;
      o.facing = undefined;
      o.wait = 1000 + Math.random() * 2500;
    }
    g.warpTo = (dest) => this.transfer(dest);
    this.resetEncounter();
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
    this.flashT = Math.max(0, (this.flashT ?? 0) - dt);

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
      if (this.moveDone) {
        // イベントで歩かせた1歩：出口やイベントは調べない
        const done = this.moveDone;
        this.moveDone = null;
        done();
        return;
      }
      if (this.afterStep()) return;
      if (this.checkEncounter()) return;
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
    // 画面をタップ：そのマスまで1マスずつ歩く。人や物をタップすると、となりまで歩いて話す・調べる
    const tap = input.tap();
    if (tap && !input.tapFromPad() && this.cam) {
      this.planWalk(Math.floor((tap.x + this.cam.x) / TILE), Math.floor((tap.y + this.cam.y) / TILE));
    }
    if (input.pressed('ok')) {
      this.interact();
      return;
    }
    let dir = input.heldDir() ?? input.pressedDir();
    if (dir) this.walkPlan = null;
    else dir = this.nextPlannedStep();
    if (!dir) return;
    this.dir = dir;
    loc.dir = dir;
    const to = tryMove(this.map, this.pos, dir, this.isOn);
    if (!to && this.walkPlan) {
      // 町の人が道に出てきた：道を探しなおす（だめならやめる）
      const p = this.walkPlan;
      this.walkPlan = null;
      if (!p.retried) this.planWalk(p.tx, p.ty, true);
      return;
    }
    if (!to) {
      const f = stepTarget(this.pos, dir);
      const b = entityAt(this.map, f.x, f.y, this.isOn);
      if (b?.type === 'block' && (input.pressedDir() || this.time - (this.bumpAt ?? -9999) > 900)) {
        this.bumpAt = this.time;
        this.run([{ say: b.props.msg }]);
      }
      return;
    }
    if (to) {
      const dashing = g.state.flags.dash !== false && (g.settings.alwaysDash ? !input.dash() : input.dash());
      const dur = (dashing ? DASH_MS : WALK_MS) * (g.settings.moveSpeed === 1 ? 0.8 : 1);
      this.moving = { from: { ...this.pos }, to, t: Math.min(carry, dur * 0.9), dur };
    }
  }

  // 歩き回る町の人（家から2マスまで。イベント中と、主人公が話しかけている間は止まる）
  updateWalkers(dt) {
    for (const o of this.map.objects) {
      if (o.type !== 'npc' || !this.isOn(o)) continue;
      if (o.mv) {
        o.mv.t += dt;
        if (o.mv.t >= (o.mv.dur ?? NPC_STEP_MS)) {
          const done = o.mv.done;
          o.mv = null;
          done?.();
        }
        continue;
      }
      if (!o.props.wander) continue;
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

  // 道をふさぐもの：water（沈んだ道）、gust（突風）、sign（看板）、statue（炎の銅像）、barrier（雷の結界）
  drawBlock(ctx, map, o, x, y) {
    const t = this.time;
    const k = o.props.kind;
    if (k === 'water') drawGid(ctx, map, 1200 + 454, x, y);
    else if (k === 'sign') {
      const img = this.game.assets.image('img:blockers');
      if (img) ctx.drawImage(img, 64, 0, 32, 32, x, y, 32, 32);
      else drawGid(ctx, map, 230, x, y);
    }
    else if (k === 'gust') {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const off = ((t / 6 + i * 11) % 32) - 4;
        ctx.beginPath();
        ctx.moveTo(x + off, y + 6 + i * 9);
        ctx.quadraticCurveTo(x + off + 8, y + 2 + i * 9, x + off + 16, y + 6 + i * 9);
        ctx.stroke();
      }
    } else if (k === 'statue') {
      // 炎の銅像：炎の四天王の銅像（tools/draw_blockers.ps1）。頭の炎がゆらめく
      // 2マスにまたがる像は、いちばん下のマスで1回だけ描く
      if (map.objects.some((b) => b.type === 'block' && b.props.kind === 'statue' && b.x === o.x && b.y === o.y + 1 && this.isOn(b))) return;
      const img = this.game.assets.image('img:blockers');
      const sx = x + TILE / 2 - 32, sy = y + TILE - 96;
      if (img) ctx.drawImage(img, 0, 0, 64, 96, sx, sy, 64, 96);
      for (let i = 0; i < 4; i++) {
        const h = 2 + ((Math.sin(t / 110 + i * 1.9) + 1) * 2);
        ctx.fillStyle = i % 2 ? 'rgba(255,220,90,0.85)' : 'rgba(255,110,40,0.8)';
        ctx.fillRect(sx + 26 + i * 4, sy + 6 - h, 2, h);
      }
    } else if (k === 'barrier') {
      ctx.fillStyle = `rgba(255,240,120,${0.25 + 0.15 * Math.sin(t / 90)})`;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,200,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const p = Math.floor(t / 80) % 4;
      ctx.moveTo(x + 8 + p * 4, y);
      ctx.lineTo(x + 20 - p * 2, y + 12);
      ctx.lineTo(x + 10 + p * 3, y + 20);
      ctx.lineTo(x + 22, y + 32);
      ctx.stroke();
    }
  }

  // 今いる建物（屋根を消す範囲）。props.w・props.h が建物の大きさ（いちばん下の段は表の壁）
  houseAt(p) {
    return this.map.objects.find((o) => o.type === 'house' && p.x >= o.x && p.x < o.x + Number(o.props.w) && p.y >= o.y && p.y < o.y + Number(o.props.h) - 1) ?? null;
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

  // ---- エンカウント（フィールドとダンジョンだけ。30〜40歩に1回くらい。長い城はエリアの steps で少なめ） ----
  // エンカウントは確率方式（src/core/battle.js の encounterRoll）。ここでは「前の戦闘から何歩目か」を数える
  resetEncounter() {
    this.encSteps = 0;
  }

  checkEncounter() {
    const g = this.game;
    const areaId = this.map.props.area;
    if (!areaId || g.dev?.noEncounter) return false;
    const area = g.enemies?.areas?.[areaId];
    if (!area) return false;
    if (this.map.objects.some((o) => o.type === 'savepoint' && Math.abs(o.x - this.pos.x) <= 3 && Math.abs(o.y - this.pos.y) <= 3)) return false;
    this.encSteps++;
    if (!encounterRoll(area, this.encSteps)) return false;
    this.resetEncounter();
    this.startBattle({ enemyIds: rollEncounter(area), area: areaId });
    return true;
  }

  // ---- タップで歩く ----
  // (tx, ty) のマスへの道を探す。人・物のマスなら、そのとなり（お店の人はカウンター越しも）まで行って、向いて話す
  planWalk(tx, ty, retried = false) {
    const map = this.map;
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
    if (tx === this.pos.x && ty === this.pos.y) {
      this.walkPlan = null;
      this.interact();
      return;
    }
    const e = entityAt(map, tx, ty, this.isOn);
    const target = e && !['exit', 'trigger'].includes(e.type) && !e.props.walkable;
    let goals;
    if (target) {
      goals = [];
      for (const [d, [dx, dy]] of Object.entries(DIRS)) {
        goals.push({ x: tx - dx, y: ty - dy, face: d });
        if (e.type === 'npc' && e.props.counter) goals.push({ x: tx - 2 * dx, y: ty - 2 * dy, face: d });
      }
    } else {
      if (!canWalk(map, tx, ty, this.isOn)) return;
      goals = [{ x: tx, y: ty }];
    }
    const here = goals.find((q) => q.x === this.pos.x && q.y === this.pos.y);
    if (here) {
      this.dir = here.face;
      this.game.state.location.dir = here.face;
      this.walkPlan = null;
      this.interact();
      return;
    }
    const path = this.findPath(goals);
    this.walkPlan = path ? { path, goal: path.goal, tx, ty, retried, talk: target } : null;
  }

  // 幅優先で、いちばん近い目的地までのマスの並びを返す（出口やイベントのマスは、目的地の時だけ通る）
  findPath(goals) {
    const map = this.map;
    const W = map.width;
    const key = (x, y) => y * W + x;
    const goalOf = new Map(goals.map((q) => [key(q.x, q.y), q]));
    const start = key(this.pos.x, this.pos.y);
    const prev = new Map([[start, -1]]);
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      if (goalOf.has(c) && c !== start) {
        const path = [];
        for (let k = c; k !== start; k = prev.get(k)) path.unshift({ x: k % W, y: Math.floor(k / W) });
        path.goal = goalOf.get(c);
        return path;
      }
      const x = c % W;
      const y = Math.floor(c / W);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx;
        const ny = y + dy;
        const k = key(nx, ny);
        if (prev.has(k) || !canWalk(map, nx, ny, this.isOn)) continue;
        if (!goalOf.has(k) && map.objects.some((o) => (o.type === 'exit' || o.type === 'trigger') && o.x === nx && o.y === ny && this.isOn(o))) continue;
        prev.set(k, c);
        queue.push(k);
      }
    }
    return null;
  }

  // 決めた道の、次の1歩の向き。着いたら向きを変えて話す・調べる
  nextPlannedStep() {
    const p = this.walkPlan;
    if (!p) return null;
    while (p.path.length && p.path[0].x === this.pos.x && p.path[0].y === this.pos.y) p.path.shift();
    if (!p.path.length) {
      this.walkPlan = null;
      if (p.goal?.face) {
        this.dir = p.goal.face;
        this.game.state.location.dir = p.goal.face;
        if (p.talk) this.interact();
      }
      return null;
    }
    const n = p.path[0];
    const d = Object.entries(DIRS).find(([, [dx, dy]]) => this.pos.x + dx === n.x && this.pos.y + dy === n.y);
    if (!d) {
      this.walkPlan = null;
      return null;
    }
    return d[0];
  }

  startBattle({ enemyIds, area, boss = false, onEnd, fromScript = false, skipRewards = false, gentle = false, tips = null }) {
    this.walkPlan = null;
    const g = this.game;
    this.busy = true;
    this.moving = null;
    g.input.clearPresses();
    g.audio.playSe('ok');
    g.scenes.fadeTo(() => {
      g.scenes.push(
        new BattleScene({
          enemyIds, area, boss, skipRewards, gentle, tips,
          onEnd: (result) => {
            if (result === 'lose' && !gentle) {
              g.scenes.replaceAll(new FieldScene());
              return;
            }
            if (!fromScript) this.busy = false;
            g.input.clearPresses();
            g.audio.playBgm(this.map.props.bgm ?? 'town');
            onEnd?.(result);
          },
        }),
      );
    }, 250);
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
    this.walkPlan = null;
    const g = this.game;
    this.busy = true;
    g.input.clearPresses();
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
      say: (what) => show(Array.isArray(what) ? what : g.pick(g.dialogues[what]) ?? [`（セリフ「${what}」が見つかりません）`]),
      notice: (text) => show([typeof text === 'string' ? text : g.screen.touchEnabled ? text.touch : text.pc]),
      fanfare: (opts) =>
        new Promise((done) => {
          const raw = typeof opts.text === 'string' && g.dialogues[opts.text] ? g.pick(g.dialogues[opts.text]) : [].concat(opts.text ?? []);
          const lines = raw.map((l) => fillName(l, g.state.player.name).replace(/〇〇/g, g.state.player.name));
          g.scenes.push(new FanfareScene({ lines, kind: opts.kind, se: 'se' in opts ? opts.se : 'item_get', jingle: opts.jingle ?? null, onDone: done }));
        }),
      // たずねる：セリフの窓を残したまま選択肢を出し、選んだ番号を返す（キャンセルは最後の選択肢）
      choice: (what, items) =>
        new Promise((done) => {
          const lines = Array.isArray(what) ? what : g.pick(g.dialogues[what]) ?? [''];
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
      rest: (what) => new Promise((done) => g.scenes.push(new RestScene({ lines: g.pick(g.dialogues[what]) ?? [''], onDone: done }))),
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
      // 宿屋：pay が false なら、お金を取らず質問もしない（炎の村に着いた時）。初めての時だけ宿屋イベント
      inn: async (opts = {}, pay = true) => {
        const st = g.state;
        const face = npc?.props.character ?? null;
        if (pay) {
          const i = await ask(g, 'inn_hello', ['はい', 'いいえ'], { face });
          if (i !== 0) return say(g, 'inn_no', { face });
          if ((st.gold ?? 0) < 50) return say(g, 'inn_no_money', { face });
          st.gold -= 50;
        }
        const ev = !!opts.event && !(opts.flag && st.flags[opts.flag]) && !(opts.unless && st.flags[opts.unless]);
        const lines = ev ? g.pick(g.dialogues[opts.event]) ?? [] : [];
        if (ev && opts.flag) st.flags[opts.flag] = true;
        await new Promise((done) => g.scenes.push(new RestScene({ lines, night: ev, onDone: done })));
        fullRecover(st, g.items);
        writeSlot(g.store, 'auto', st);
        g.audio.playBgm(this.map.props.bgm ?? 'town');
        await say(g, 'inn_morning', { face: pay ? face : 'innkeeper' });
      },
      battle: (opts) =>
        new Promise((done) => {
          this.startBattle({ enemyIds: opts.enemies, area: opts.area ?? this.map.props.area ?? 'field_town', boss: true, fromScript: true, skipRewards: !!opts.skipRewards, gentle: !!opts.gentle, tips: opts.tips ?? null, onEnd: done });
        }),
      // レオ／リナ：Lv7、その職業のLv7までの技、専用技、風の村でいちばん安い武器・防具一式
      joinPartner: () => {
        const st = g.state;
        if (st.party.some((m) => m.id === 'partner')) return;
        const p = partnerOf(st);
        const equip = p.job === 'mage' ? { weapon: 'sage_staff', armor: 'magic_robe', helm: 'iron_helm' } : { weapon: 'knight_sword', armor: 'iron_armor', shield: 'iron_shield', helm: 'iron_helm' };
        const m = createMember({ id: 'partner', job: p.job, level: 7, equip }, g.items);
        m.extraSkills = [p.job === 'mage' ? 'lightning_bolt' : 'lightning_slash'];
        st.party.push(m);
      },
      learnLight: () => {
        const hero = g.state.party.find((m) => m.id === 'hero');
        hero.extraSkills ??= [];
        const id = hero.job === 'mage' ? 'holy' : 'holy_slash';
        if (!hero.extraSkills.includes(id)) hero.extraSkills.push(id);
        g.audio.playSe('awaken');
      },
      // 師匠の形見：レオ／リナが、師匠の奥義の弟子版を受け継ぐ（剣士は雷鳴斬、魔法使いは雷鳴の陣）
      learnKeepsake: () => {
        const p = g.state.party.find((m) => m.id === 'partner');
        if (!p) return;
        p.extraSkills ??= [];
        const id = p.job === 'mage' ? 'heir_spell' : 'heir_slash';
        if (!p.extraSkills.includes(id)) p.extraSkills.push(id);
        g.audio.playSe('awaken');
      },
      flash: (color) =>
        new Promise((done) => {
          this.flashColor = color || '#ffffff';
          this.flashT = 900;
          this.waitT = 900;
          this.waitDone = done;
        }),
      endroll: () => new Promise((done) => g.scenes.push(new EndRollScene(done))),
      epilogue: (key) => new Promise((done) => g.scenes.push(new BlackTextScene(g.pick(g.dialogues[key]) ?? [], done))),
      theEnd: () =>
        new Promise(() => {
          g.state.flags.cleared = true;
          markCleared(g.store, g.state);
          g.scenes.push(new TheEndScene(() => g.scenes.fadeTo(() => g.scenes.replaceAll(new TitleScene()), 800)));
        }),
      // マップの人を、名前で探して歩かせる（ms は1歩の時間。短いほど速い）
      moveNpc: async (name, steps, ms) => {
        const o = this.map.objects.find((x) => x.type === 'npc' && x.name === name && this.isOn(x));
        if (!o) return;
        for (const dir of steps) {
          const t = stepTarget(o, dir);
          o.facing = dir;
          await new Promise((done) => {
            o.mv = { from: { x: o.x, y: o.y }, t: 0, dur: ms ?? NPC_STEP_MS, done };
            o.x = t.x;
            o.y = t.y;
          });
        }
      },
      faceNpc: (name, dir) => {
        const o = this.map.objects.find((x) => x.type === 'npc' && x.name === name);
        if (o) o.facing = dir;
      },
      // 主人公を歩かせる（向きは変えずに、後ろへ下がることもできる）
      movePlayer: async (dirs) => {
        for (const dir of dirs) {
          const to = stepTarget(this.pos, dir);
          await new Promise((done) => {
            this.moveDone = done;
            this.moving = { from: { ...this.pos }, to, t: 0, dur: WALK_MS };
          });
        }
      },
      facePlayer: (dir) => {
        this.dir = dir;
        g.state.location.dir = dir;
      },
    };
  }

  transfer(to) {
    this.walkPlan = null;
    const g = this.game;
    g.scenes.fadeTo(() => {
      const loc = g.state.location;
      loc.map = to.map;
      loc.x = to.x != null ? Number(to.x) : null;
      loc.y = to.y != null ? Number(to.y) : null;
      // 階段：x・y が 'start' なら、その階の始まり。'end' なら、その階の終わり（下の階への階段のそば）
      if (to.x === 'end') {
        const mark = g.maps.get(to.map)?.objects.find((o) => o.type === 'mark');
        if (mark) Object.assign(loc, { x: mark.x, y: mark.y });
      }
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
      // 光の結晶は、調べると全員のHP・MPが全回復する（倒れた仲間も起き上がり、状態異常も治る）
      const st = g.state;
      const hurt = st.party.some((m) => {
        const s = totalStats(m, g.items);
        return m.hp < s.hp || m.mp < s.mp || m.ailments?.length;
      });
      const lines = ['光の結晶が、やさしく光っている…'];
      if (hurt) {
        fullRecover(st, g.items);
        g.audio.playSe('heal');
        lines.push('あたたかい光に つつまれて、みんなの HPと MPが 回復した！');
      }
      g.scenes.push(new MessageScene(lines, { onDone: () => this.savePointMenu() }));
    } else if (e.type === 'block') {
      this.run([{ say: e.props.msg }]);
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
    g.input.clearPresses();
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
        const got = p.itemMage && st.player.job === 'mage' ? p.itemMage : p.item;
        addItem(st, got, Number(p.count ?? 1));
        if (g.items[got]?.rare) {
          // めずらしい物は、豪華なお知らせで
          await say(g, [`${name}は 宝箱を開けた！`]);
          return await new Promise((done) => g.scenes.push(new FanfareScene({ lines: [`${g.items[got]?.name ?? got}を 手に入れた！`], kind: 'おたから', se: null, jingle: 'jingle_rare', onDone: done })));
        }
        return await say(g, [`${name}は 宝箱を開けた！`, `${g.items[got]?.name ?? got}を 手に入れた！`]);
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
      g.input.clearPresses();
    }
  }

  savePointMenu() {
    const g = this.game;
    g.scenes.push(
      new ChoiceScene({
        items: [
          { label: 'セーブ', value: 'save' },
          { label: 'ロード', value: 'load' },
          // クリアしたあとは、どの光の結晶からでも裏ボス「影の勇者」に挑める
          ...(g.state.flags.cleared ? [{ label: '影に挑む', value: 'shadow' }] : []),
          // スマホでは「とじる」を出さない（右上の「もどる」で閉じられる）
          ...(g.screen.touchEnabled ? [] : [{ label: 'とじる', value: 'close' }]),
        ],
        x: 24,
        y: 24,
        width: 150,
        onSelect: (item) => {
          if (item.value === 'save') g.scenes.push(new SaveLoadScene({ mode: 'save' }));
          else if (item.value === 'load') g.scenes.push(new SaveLoadScene({ mode: 'load' }));
          else if (item.value === 'shadow') this.fightShadow();
        },
      }),
    );
  }

  // 裏ボス「影の勇者」：主人公と同じ見た目の影。勝つと証（shadow_defeated）と称号
  fightShadow() {
    const p = this.game.state.player;
    const id = `shadow_${p.gender === 'female' ? 'f' : 'm'}_${p.job === 'mage' ? 'mage' : 'sword'}`;
    this.run([
      { bgmStop: 600 },
      { flash: '#200010' },
      { say: 'shadow_appear' },
      { battle: { enemies: [id], area: 'demon' } },
      { flag: 'shadow_defeated' },
      { say: 'shadow_down' },
      { fanfare: { text: 'shadow_title', kind: '称号', jingle: 'jingle_rare' } },
      { bgm: this.map.props.bgm ?? 'field' },
    ]);
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
    this.cam = { x: camX, y: camY };

    ctx.fillStyle = map.props.back ?? '#1b1722';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const name of map.layerOrder) {
      if (name === 'collision' || name === 'roof') continue;
      const layer = map.layers[name];
      if (layer.visible) drawTileLayer(ctx, map, layer, camX, camY);
    }

    // 人を、下にいる順に描く（手前の人が上に重なる）
    const sprites = [];
    for (const o of map.objects) {
      if (!this.isOn(o)) continue;
      if (o.type === 'npc') {
        if (o.props.enemy) {
          const pic = bossPicture(this.game, o.props.enemy);
          if (pic) sprites.push({ y: o.y * TILE, draw: () => ctx.drawImage(pic, Math.round(o.x * TILE - camX + TILE / 2 - pic.width / 2), Math.round(o.y * TILE - camY + TILE - pic.height)) });
          continue;
        }
        const img = this.game.assets.image(`char:${o.props.character}`);
        let px = o.x * TILE;
        let py = o.y * TILE;
        let frame = 1;
        if (o.mv) {
          const k = Math.min(1, o.mv.t / (o.mv.dur ?? NPC_STEP_MS));
          px = (o.mv.from.x + (o.x - o.mv.from.x) * k) * TILE;
          py = (o.mv.from.y + (o.y - o.mv.from.y) * k) * TILE;
          frame = k < 0.5 ? 0 : 2;
        }
        const dir = this.npcDirs.get(o.id) ?? o.facing ?? o.props.dir ?? 'down';
        sprites.push({ y: py, draw: () => drawChar(ctx, img, snap(px) - camX, snap(py) - camY, dir, frame) });
      } else if (o.type === 'block') {
        sprites.push({ y: o.y * TILE - 2, draw: () => this.drawBlock(ctx, map, o, o.x * TILE - camX, o.y * TILE - camY) });
      } else if (o.type === 'search' && o.props.kind === 'chest') {
        const opened = this.game.state.flags[`got_${this.game.state.location.map}_${o.id}`];
        sprites.push({ y: o.y * TILE - 1, draw: () => drawGid(ctx, map, opened ? CHEST_OPEN : CHEST_CLOSED, o.x * TILE - camX, o.y * TILE - camY) });
      } else if (o.type === 'sign' && o.props.kind === 'keepsake') {
        sprites.push({ y: o.y * TILE, draw: () => drawKeepsake(ctx, o.x * TILE - camX, o.y * TILE - camY, this.time) });
      } else if (o.type === 'savepoint') {
        sprites.push({ y: o.y * TILE, draw: () => drawCrystal(ctx, o.x * TILE - camX, o.y * TILE - camY, this.time, this.game.assets.image('img:blockers')) });
      }
    }
    const frame = this.moving ? STEP_FRAMES[Math.floor(this.stepCount * 2 + (this.moving.t / this.moving.dur) * 2) % 4] : 1;
    sprites.push({ y: p.y, draw: () => drawChar(ctx, this.playerSprite, snap(p.x) - camX, snap(p.y) - camY, this.dir, frame) });
    sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

    // 屋根：建物の中にいる時は、その建物の屋根だけ消して中を見せる
    if (map.layers.roof) drawTileLayer(ctx, map, map.layers.roof, camX, camY, this.houseAt(this.moving ? this.moving.to : this.pos));
    this.drawGuides(ctx, camX, camY);

    if (map.props.tint) {
      ctx.fillStyle = map.props.tint;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (map.props.storm) {
      // ときどき稲光
      const k = (this.time % 7000) / 7000;
      if (k > 0.93 && k < 0.95) {
        ctx.fillStyle = 'rgba(255,255,240,0.45)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
    if (this.flashT > 0) {
      ctx.globalAlpha = Math.min(1, this.flashT / 500);
      ctx.fillStyle = this.flashColor ?? '#ffffff';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }
    this.drawBanner(ctx);
  }

  // 行き先の目印（マップの guide。フラグで出たり消えたりする）：その場所の上で金の矢印がはね、名前の札を出す。
  // 画面の外にある時は、画面のふちに、そちらを向いた矢印と名前を出す。その建物の中にいる時は出さない
  drawGuides(ctx, camX, camY) {
    const g = this.game;
    const here = this.houseAt(this.moving ? this.moving.to : this.pos);
    for (const o of this.map.objects) {
      if (o.type !== 'guide' || !this.isOn(o)) continue;
      if (here && (this.houseAt(o) ?? this.houseAt({ x: o.x, y: o.y - 1 })) === here) continue; // 戸口の目印も、中にいる時は出さない
      if (this.map.objects.some((n) => n.type === 'npc' && n.x === o.x && n.y === o.y && this.isOn(n))) continue; // だれか（門をふさぐスライムなど）が立っている間は出さない
      const label = o.props.label ?? o.name;
      const cx = o.x * TILE - camX + TILE / 2;
      const top = o.y * TILE - camY;
      const bob = Math.round(Math.sin(this.time / 170) * 3);
      const pulse = (Math.sin(this.time / 220) + 1) / 2;
      ctx.save();
      if (cx > 16 && cx < WIDTH - 16 && top > 40 && top < HEIGHT - 16) {
        // 足もとの光の輪
        ctx.fillStyle = `rgba(255,224,138,${(0.22 + 0.2 * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(cx, top + TILE - 6, 14 + pulse * 3, 6 + pulse, 0, 0, Math.PI * 2);
        ctx.fill();
        guideArrow(ctx, cx, top - 6 + bob, Math.PI / 2);
        guideTag(ctx, g.font, label, cx, top - 38 + bob);
      } else {
        // 画面の外：まん中から目印へ向かう線が、画面のふちと交わる所に
        const mx = WIDTH / 2;
        const my = HEIGHT / 2;
        const dx = cx - mx;
        const dy = top + TILE / 2 - my;
        const k = Math.min((WIDTH / 2 - 26) / Math.max(1, Math.abs(dx)), (HEIGHT / 2 - 26) / Math.max(1, Math.abs(dy)));
        const ex = mx + dx * k;
        const ey = my + dy * k;
        const a = Math.atan2(dy, dx);
        guideArrow(ctx, ex + Math.cos(a) * bob, ey + Math.sin(a) * bob, a);
        // 札は、矢印のうしろ（画面の内がわ）に、矢印と重ならないように
        const tw = g.font.width(label) + 16;
        const back = 24 + Math.abs(Math.cos(a)) * (tw / 2) + Math.abs(Math.sin(a)) * 12;
        const tx = Math.max(tw / 2 + 4, Math.min(WIDTH - tw / 2 - 4, ex - Math.cos(a) * back));
        const ty = Math.max(14, Math.min(HEIGHT - 14, ey - Math.sin(a) * back));
        guideTag(ctx, g.font, label, tx, ty);
      }
      ctx.restore();
    }
  }

  // マップに入った時、場所の名前を画面の上に2秒ほど出す
  // 場所の名前：左からすべりこむ帯。町は金、フィールドは緑、ダンジョンは紫
  drawBanner(ctx) {
    const name = this.placeLabel;
    const t = performance.now() - this.enterAt; // 会話の途中でも消えるように、実際の時間で数える
    if (!name || t > 2600) return;
    const g = this.game;
    const kind = this.map.props.dungeon ? 'dungeon' : this.map.props.area ? 'field' : 'town';
    const theme = { town: ['rgba(48,30,10,', '#ffd36e'], field: ['rgba(14,40,26,', '#8ae8a8'], dungeon: ['rgba(34,14,48,', '#c89aff'] }[kind];
    const k = Math.min(1, t / 380);
    const e = 1 - (1 - k) ** 3;
    const alpha = t < 2100 ? 1 : Math.max(0, 1 - (t - 2100) / 500);
    const font = g.fontBig ?? g.font;
    const tw = font.width(name);
    const w = Math.min(WIDTH, Math.max(320, tw + 170));
    const h = 54;
    const y = 22;
    const x = Math.round(WIDTH / 2 - w / 2 - (1 - e) * WIDTH * 0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    // 帯（両はしはすけていく）
    const band = ctx.createLinearGradient(x, 0, x + w, 0);
    band.addColorStop(0, `${theme[0]}0)`);
    band.addColorStop(0.18, `${theme[0]}0.88)`);
    band.addColorStop(0.82, `${theme[0]}0.88)`);
    band.addColorStop(1, `${theme[0]}0)`);
    ctx.fillStyle = band;
    ctx.fillRect(x, y, w, h);
    // 上下の細い線
    const line = ctx.createLinearGradient(x, 0, x + w, 0);
    line.addColorStop(0, 'rgba(0,0,0,0)');
    line.addColorStop(0.5, theme[1]);
    line.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = line;
    ctx.fillRect(x, y + 3, w, 2);
    ctx.fillRect(x, y + h - 5, w, 2);
    // 名前の両わきのひし形
    ctx.fillStyle = theme[1];
    for (const dx of [-tw / 2 - 26, tw / 2 + 18]) {
      const cx = Math.round(x + w / 2 + dx);
      const cy = y + h / 2;
      for (let i = 0; i < 4; i++) ctx.fillRect(cx + 4 - i, cy - 3 + i, 1 + i * 2, 1), ctx.fillRect(cx + 4 - i, cy + 3 - i, 1 + i * 2, 1);
    }
    // 名前（かげ付き）
    const ty = y + Math.round((h - (font === g.fontBig ? 34 : 18)) / 2);
    font.drawCentered(ctx, name, x + w / 2 + 2, ty + 2, '#000000');
    font.drawCentered(ctx, name, x + w / 2, ty, '#fff6e0');
    // 光が横切る
    const sw = (t - 450) / 600;
    if (sw > 0 && sw < 1) {
      const sx = x + w * sw;
      const gl = ctx.createLinearGradient(sx - 50, 0, sx + 50, 0);
      gl.addColorStop(0, 'rgba(255,255,255,0)');
      gl.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(sx - 50, y, 100, h);
    }
    ctx.restore();
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

// skip：この範囲の建物の屋根は描かない（中にいる時）
function drawTileLayer(ctx, map, layer, camX, camY, skip = null) {
  const frame = Math.floor(performance.now() / 220);
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.width - 1, Math.floor((camX + WIDTH) / TILE));
  const y1 = Math.min(map.height - 1, Math.floor((camY + HEIGHT) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const gid = layer.data[y * map.width + x] & 0x1fffffff;
      if (!gid) continue;
      if (skip && x >= skip.x && x < skip.x + Number(skip.props.w) && y >= skip.y && y < skip.y + Number(skip.props.h)) continue;
      const ts = tilesetFor(map, gid);
      const dx = x * TILE - camX;
      const dy = y * TILE - camY;
      if (!ts?.img) {
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(dx, dy, TILE, TILE);
        continue;
      }
      const local = gid - ts.firstgid;
      // 水などの動くタイル：同じ絵が右へ8列ずつ並んでいる（frames 枚）
      const col = (local % ts.columns) + (ts.frames > 1 ? (frame % ts.frames) * 8 : 0);
      ctx.drawImage(ts.img, col * TILE, Math.floor(local / ts.columns) * TILE, TILE, TILE, dx, dy, TILE, TILE);
    }
  }
}

// ボス部屋に置くボスの姿（戦闘の画像を縮小したもの）。一度だけ作って取っておく
const BOSS_PICS = new Map();
function bossPicture(g, id) {
  if (BOSS_PICS.has(id)) return BOSS_PICS.get(id);
  const img = g.assets.image(`enemy:${id}`);
  if (!img) return null;
  const t = document.createElement('canvas');
  t.width = img.width;
  t.height = img.height;
  const tx = t.getContext('2d');
  tx.drawImage(img, 0, 0);
  const d = tx.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let yy = 0; yy < t.height; yy += 2) for (let xx = 0; xx < t.width; xx += 2) if (d[(yy * t.width + xx) * 4 + 3] > 20) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
  const bw = x1 - x0 + 2, bh = y1 - y0 + 2;
  const sc = Math.min(80 / bh, 96 / bw);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(bw * sc));
  out.height = Math.max(1, Math.round(bh * sc));
  const ox = out.getContext('2d');
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(img, x0, y0, bw, bh, 0, 0, out.width, out.height);
  BOSS_PICS.set(id, out);
  return out;
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

// 光の結晶（セーブポイント）：台座の上に、女神の光のかけらが浮かんで光る（絵は tools/draw_blockers.ps1）
function drawCrystal(ctx, x, y, t, img) {
  const bob = Math.round(Math.sin(t / 400) * 2);
  const glow = 0.22 + 0.14 * Math.sin(t / 300);
  ctx.fillStyle = `rgba(255, 250, 210, ${glow})`;
  ctx.beginPath();
  ctx.arc(x + 16, y + 10 + bob, 13, 0, Math.PI * 2);
  ctx.fill();
  if (!img) return;
  ctx.drawImage(img, 64, 64, 32, 14, x, y + 18, 32, 14);
  ctx.drawImage(img, 72, 32, 16, 21, x + 8, y - 2 + bob, 16, 21);
  // ときどき、きらりと光る
  const k = (t % 2400) / 2400;
  if (k < 0.12) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x + 21, y + 1 + bob, 1, 5);
    ctx.fillRect(x + 19, y + 3 + bob, 5, 1);
  }
}

// 師匠の形見：灰の上の古い書きつけ（巻物）。ときどき、きらりと光る
// 目印の矢印（金色に黒いふち）。(x, y) が矢印の先、a が向き（下向きは π/2）
function guideArrow(ctx, x, y, a) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(a);
  for (const [grow, color] of [[2, '#1a1208'], [0, '#ffd36e']]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(grow, 0);
    ctx.lineTo(-16 - grow, -11 - grow);
    ctx.lineTo(-16 - grow, 11 + grow);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#fff6d8';
  ctx.fillRect(-14, -7, 2, 14);
  ctx.restore();
}

// 目印の名前の札（まん中が (x, y)）
function guideTag(ctx, font, text, x, y) {
  const w = font.width(text) + 16;
  const h = 22;
  const l = Math.round(x - w / 2);
  const t = Math.round(y - h / 2);
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(l - 2, t - 2, w + 4, h + 4);
  ctx.fillStyle = '#ffd36e';
  ctx.fillRect(l - 1, t - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(20,16,44,0.95)';
  ctx.fillRect(l + 1, t + 1, w - 2, h - 2);
  font.draw(ctx, text, l + 8, t + 2, '#ffe08a');
}

function drawKeepsake(ctx, x, y, t) {
  const px = (dx, dy, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, w, h);
  };
  // 灰
  px(6, 24, 20, 4, 'rgba(60,60,70,0.55)');
  px(9, 22, 14, 2, 'rgba(90,90,100,0.5)');
  // 巻物
  px(8, 14, 16, 9, '#3a2a18');
  px(9, 15, 14, 7, '#e8dcb8');
  px(9, 15, 14, 1, '#fff6d8');
  px(7, 13, 2, 11, '#8a5a2a');
  px(23, 13, 2, 11, '#8a5a2a');
  px(11, 17, 8, 1, '#7a6a4a');
  px(11, 19, 10, 1, '#7a6a4a');
  // 雷の色のひも
  px(15, 14, 2, 9, '#e6b800');
  // きらり
  const k = (t % 1600) / 1600;
  if (k < 0.5) {
    const a = Math.sin((k / 0.5) * Math.PI);
    ctx.globalAlpha = a;
    px(15, 4, 1, 9, '#ffffff');
    px(11, 8, 9, 1, '#ffffff');
    px(14, 7, 3, 3, '#fff3a0');
    ctx.globalAlpha = 1;
  }
}
