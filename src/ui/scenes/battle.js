// 戦闘の画面（フロントビュー）。ルールは src/core/battle.js、ここは見せ方と入力だけ
import { HEIGHT, WIDTH } from '../../config.js';
import {
  alive, applyDefeat, createBattle, finishWin, has, mustSkipInput, planEnemies, resolveTurn,
} from '../../core/battle.js';
import { characterIdOf, isDown, itemCount, learnedSkills, totalStats } from '../../core/party.js';
import { COLORS, drawCursor, drawWindow } from '../draw.js';
import { ListMenu } from '../list.js';
import { Menu } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';

const ELEMENT_COLOR = { none: '#8a8a8a', water: '#3b7dd8', wind: '#3aa45a', fire: '#e0503a', thunder: '#e6b800', dark: '#8a4fc8', light: '#e8c84a' };
const AILMENT_COLOR = { poison: '#9b59b6', burn: '#e67e22', sleep: '#5dade2', confusion: '#ec7ab8', paralysis: '#f1c40f' };
const BUFF_LABEL = { atkUp: '攻', defUp: '防', focus: '会', defDown: '防' };
const FRAME_Y = 262;
const FRAME_H = 92;
const GROUND_Y = 212;
const DOWN_RED = '#c0392b';

export class BattleScene extends Scene {
  // enemyIds：出てくる敵、area：data/enemies.json の areas の名前、onEnd(result)：戦闘が終わった時
  // skipRewards：勝っても経験値などを出さずに終える（魔王）
  constructor({ enemyIds, area, boss = false, onEnd, skipRewards = false }) {
    super();
    this.enemyIds = enemyIds;
    this.areaId = area;
    this.boss = boss;
    this.onEnd = onEnd;
    this.skipRewards = skipRewards;
  }

  enter() {
    const g = this.game;
    this.area = g.enemies.areas[this.areaId] ?? { bg: ['#9ccbe8', '#e8f2d8'] };
    this.b = createBattle({ state: g.state, items: g.items, skills: g.skills, enemyData: g.enemies, area: this.area, enemyIds: this.enemyIds, boss: this.boss });
    this.fx = this.b.enemies.map(() => ({ flash: 0, fade: 0, shake: 0 }));
    this.allyFx = this.b.allies.map(() => ({ shake: 0 }));
    this.pops = [];
    this.text = '';
    this.queue = [];
    this.waitT = 0;
    this.t = 0;
    this.introT = 0;
    this.phase = 'intro';
    this.layoutEnemies();
    this.boss = this.b.boss;
    g.audio.playBgm(this.b.enemies.find((e) => e.d.bgm)?.d.bgm ?? (this.boss ? 'boss' : 'battle'));
    const names = this.b.enemies.map((e) => e.name);
    this.play([{ t: 'msg', text: names.length === 1 ? `${names[0]}が あらわれた！` : '魔物の群れが あらわれた！' }], () => this.startTurn());
  }

  // ---- 敵の並び ----
  layoutEnemies() {
    const g = this.game;
    const n = this.b.enemies.length;
    this.enemyBoxes = this.b.enemies.map((e, i) => {
      const img = g.assets.image(`enemy:${e.id}`);
      const box = img ? alphaBox(img) : { x: 0, y: 0, w: 100, h: 100 };
      const s = e.d.boss ? Math.min(1.1, (150 * (e.d.big ?? 1)) / box.h, 250 / box.w) : Math.min(0.75, 130 / box.h, 150 / box.w);
      const w = Math.round(box.w * s);
      const h = Math.round(box.h * s);
      const cx = Math.round(WIDTH / 2 + 45 + (i - (n - 1) / 2) * 150); // 左のコマンドの窓に重ならないよう、少し右に寄せる
      const pic = img ? shrink(img, box, w, h, g.screen.renderScale || 1) : null;
      return { img, pic, box, x: cx - Math.round(w / 2), y: GROUND_Y - h, w, h, cx };
    });
  }

  // ---- 出来事を順番に見せる ----
  play(events, then) {
    this.queue = [...events];
    this.after = then;
    this.phase = 'play';
    this.waitT = 0;
  }

  msgDelay() {
    return this.game.settings.animSpeed === 1 ? 420 : 760;
  }

  step(dt) {
    const g = this.game;
    if (this.talking) return;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (g.input.pressed('ok') || g.input.tapped()) this.waitT = Math.min(this.waitT, 60);
      return;
    }
    while (this.queue.length) {
      const e = this.queue.shift();
      const fast = g.settings.animSpeed === 1;
      if (e.t === 'msg') {
        this.prevText = this.text && this.text !== e.text ? this.text : '';
        this.text = e.text;
        this.waitT = this.msgDelay();
        return;
      }
      if (e.t === 'talk') {
        const lines = g.pick(g.dialogues[e.key]) ?? [];
        this.talking = true;
        g.scenes.push(new MessageScene(lines, { onDone: () => (this.talking = false) }));
        return;
      }
      if (e.t === 'transform') {
        this.fx[e.i] = { flash: 0, fade: 0, shake: 0 };
        this.layoutEnemies();
        g.audio.playSe('transform');
        setTimeout(() => g.audio.playSe('dragon_roar'), 700);
        if (e.bgm) g.audio.playBgm(e.bgm);
        this.waitT = 900;
        return;
      }
      if (e.t === 'shake') {
        this.fx[e.i].shake = 600;
        continue;
      }
      if (e.t === 'se') g.audio.playSe(e.name);
      else if (e.t === 'hit') {
        this.pop(e.side, e.i, String(e.amount), e.crit ? '#ffef5a' : '#ffffff');
        if (e.side === 'enemy') this.fx[e.i].flash = 300;
        else this.allyFx[e.i].shake = 300;
        this.waitT = fast ? 120 : 220;
        return;
      } else if (e.t === 'heal') this.pop(e.side, e.i, String(e.amount), '#8ef0a0');
      else if (e.t === 'miss') this.pop(e.side, e.i, 'ミス', '#dddddd');
      else if (e.t === 'down' && e.side === 'enemy') {
        this.fx[e.i].fade = 1;
        this.waitT = fast ? 200 : 380;
        return;
      } else if (e.t === 'fx') {
        this.flashColor = ELEMENT_COLOR[e.element] ?? '#ffffff';
        this.flashT = 260;
      }
    }
    const then = this.after;
    this.after = null;
    then?.();
  }

  pop(side, i, text, color) {
    const p = side === 'enemy' ? { x: this.enemyBoxes[i].cx, y: this.enemyBoxes[i].y + this.enemyBoxes[i].h / 2 } : this.frameCenter(i);
    this.pops.push({ x: p.x, y: p.y, text, color, t: 0 });
  }

  // ---- ターン ----
  startTurn() {
    const b = this.b;
    if (b.result) return this.finish();
    planEnemies(b);
    if (b.intents.some((list) => list?.some((it) => it.special))) this.game.audio.playSe('warning');
    this.text = '';
    this.prevText = '';
    this.commands = [];
    this.who = -1;
    this.nextActor(1);
  }

  nextActor(dir) {
    const b = this.b;
    let i = this.who + dir;
    while (i >= 0 && i < b.allies.length && (!alive(b.allies[i]) || mustSkipInput(b.allies[i]))) {
      this.commands[i] = { type: 'none' };
      i += dir;
    }
    if (i < 0) i = this.firstInputIndex();
    if (i >= b.allies.length) return this.runTurn();
    this.who = i;
    this.openCommandMenu();
  }

  firstInputIndex() {
    return this.b.allies.findIndex((u) => alive(u) && !mustSkipInput(u));
  }

  openCommandMenu(index = this.memory?.[this.who]?.cmd ?? 0) {
    const u = this.b.allies[this.who];
    // 開発用：通常プレイボット（tools/playbot.js）が、コマンドを選ぶ
    const auto = this.game.autoBattle?.(this.b, this.who);
    if (auto) return this.setCommand(auto);
    this.phase = 'command';
    this.menu = new Menu({
      items: [
        { label: 'たたかう', value: 'attack' },
        { label: u.m.job === 'swordsman' ? 'わざ' : 'まほう', value: 'skill' },
        { label: 'どうぐ', value: 'item' },
        { label: 'ぼうぎょ', value: 'guard' },
        { label: 'にげる', value: 'escape' },
      ],
      x: 8, y: 106, width: 128, index,
    });
  }

  runTurn() {
    this.phase = 'play';
    const events = resolveTurn(this.b, this.commands);
    this.play(events, () => this.startTurn());
  }

  finish() {
    const g = this.game;
    const b = this.b;
    if (b.result === 'win') {
      if (this.skipRewards) return this.close('win');
      g.audio.stopBgm(200);
      if (!b.enemies.some((e) => e.d.noJingle)) g.audio.playJingle('jingle_victory');
      this.play(finishWin(b), () => this.close('win'));
    } else if (b.result === 'lose') {
      g.audio.stopBgm(300);
      g.audio.playJingle('jingle_gameover');
      this.play([{ t: 'msg', text: `${b.allies[0].name}たちは 全滅してしまった…` }, { t: 'msg', text: '' }], () => this.close('lose'));
    } else this.close(b.result);
  }

  close(result) {
    const g = this.game;
    this.phase = 'done';
    if (result === 'lose') {
      const homes = [].concat(this.area.home ?? []);
      const visited = g.state.visited ?? [];
      const home = homes.find((h) => !h.town || visited.includes(h.town)) ?? homes[homes.length - 1] ?? { map: 'town', x: 4, y: 24, dir: 'down' };
      applyDefeat(g.state, g.items, home);
    }
    g.scenes.fadeTo(() => {
      g.scenes.pop(this);
      this.onEnd?.(result);
    }, 400);
  }

  // ---- 入力 ----
  update(dt) {
    const g = this.game;
    this.t += dt;
    this.introT += dt;
    for (const f of this.fx) {
      f.flash = Math.max(0, f.flash - dt);
      f.shake = Math.max(0, (f.shake ?? 0) - dt);
      if (f.fade > 0 && f.fade < 2) f.fade = Math.min(2, f.fade + dt / 400);
    }
    for (const f of this.allyFx) f.shake = Math.max(0, f.shake - dt);
    this.flashT = Math.max(0, (this.flashT ?? 0) - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 900);

    if (this.phase === 'play') return this.step(dt);
    if (this.phase === 'command') return this.updateCommand();
    if (this.phase === 'list') return this.updateList();
    if (this.phase === 'target') return this.updateTarget();
    if (this.phase === 'notice') {
      this.noticeT -= dt;
      if (this.noticeT <= 0 || g.input.pressed('ok') || g.input.tapped()) {
        this.text = '';
        this.openCommandMenu(this.noticeBack ?? 0);
      }
    }
  }

  notice(text, back) {
    this.text = text;
    this.phase = 'notice';
    this.noticeT = 1100;
    this.noticeBack = back;
  }

  updateCommand() {
    const g = this.game;
    const r = this.menu.update(g.input, g.audio);
    if (!r) return;
    if (r.type === 'cancel') {
      const prev = this.prevInputIndex();
      if (prev >= 0) {
        this.who = prev;
        this.openCommandMenu();
      }
      return;
    }
    const u = this.b.allies[this.who];
    const v = r.item.value;
    this.cmdIndex = this.menu.index;
    this.memory ??= [];
    this.memory[this.who] = { ...(this.memory[this.who] ?? {}), cmd: this.menu.index };
    if (v === 'attack') return this.chooseTarget('enemy', (t) => this.setCommand({ type: 'attack', target: t }));
    if (v === 'guard') return this.setCommand({ type: 'guard' });
    if (v === 'escape') {
      if (this.b.boss) return this.notice('逃げられない！', 4);
      this.commands = this.b.allies.map(() => ({ type: 'none' }));
      this.commands[this.who] = { type: 'escape' };
      return this.runTurn();
    }
    if (v === 'skill') {
      const ids = learnedSkills(u.m, g.skills);
      if (!ids.length) return this.notice('まだ 何も覚えていない。', 1);
      this.list = new ListMenu({
        items: ids.map((id) => ({ label: g.skills[id].name, right: `MP ${g.skills[id].mp}`, value: id, disabled: g.skills[id].mp > u.m.mp })),
        x: 166, y: 56, w: 300, rows: 6, index: Math.max(0, ids.indexOf(this.memory?.[this.who]?.skill)),
      });
      this.listKind = 'skill';
      this.phase = 'list';
      return;
    }
    if (v === 'item') {
      const usable = Object.keys(g.items).filter((id) => g.items[id].kind === 'item' && this.available(id) > 0);
      if (!usable.length) return this.notice('使える道具を 持っていない。', 2);
      this.list = new ListMenu({
        items: usable.map((id) => ({ label: g.items[id].name, right: `×${this.available(id)}`, value: id })),
        x: 166, y: 56, w: 300, rows: 6,
      });
      this.listKind = 'item';
      this.phase = 'list';
    }
  }

  // 同じターンにほかの人が使う予定の分を引いた個数
  available(id) {
    const reserved = this.commands.filter((c, i) => i < this.who && c?.type === 'item' && c.item === id).length;
    return itemCount(this.game.state, id) - reserved;
  }

  prevInputIndex() {
    for (let i = this.who - 1; i >= 0; i--) {
      const u = this.b.allies[i];
      if (alive(u) && !mustSkipInput(u)) return i;
    }
    return -1;
  }

  updateList() {
    const g = this.game;
    const r = this.list.update(g.input, g.audio);
    if (!r || r.type === 'move') return;
    if (r.type === 'cancel') return this.openCommandMenu(this.cmdIndex);
    const id = r.item.value;
    this.memory[this.who][this.listKind] = id;
    if (this.listKind === 'skill') {
      const sk = g.skills[id];
      const target = sk.target;
      if (target === 'enemy') return this.chooseTarget('enemy', (t) => this.setCommand({ type: 'skill', skill: id, target: t }), 'list');
      if (target === 'ally' || target === 'ally_down') return this.chooseTarget(target, (t) => this.setCommand({ type: 'skill', skill: id, target: t }), 'list');
      return this.setCommand({ type: 'skill', skill: id, target: null });
    }
    const item = g.items[id];
    if (item.use?.warp || item.battle === false) return this.notice('ここでは使えないようだ…', 2);
    this.chooseTarget(item.target === 'ally_down' ? 'ally_down' : 'ally', (t) => this.setCommand({ type: 'item', item: id, target: t }), 'list');
  }

  chooseTarget(kind, done, back = 'command') {
    const b = this.b;
    const list = kind === 'enemy' ? b.enemies : b.allies;
    const ok = (u) => (kind === 'ally_down' ? !alive(u) : alive(u));
    const candidates = list.filter(ok).map((u) => u.index);
    if (!candidates.length) {
      this.game.audio.playSe('buzzer');
      return;
    }
    if (candidates.length === 1 && kind === 'enemy') {
      done(candidates[0]); // 敵が1体だけなら、選ばずにそのまま決める
      return;
    }
    this.target = { kind, candidates, pos: 0, done, back };
    if (kind !== 'enemy') this.target.pos = Math.max(0, candidates.indexOf(this.who));
    this.phase = 'target';
  }

  updateTarget() {
    const g = this.game;
    const input = g.input;
    const tg = this.target;
    const n = tg.candidates.length;
    const tap = input.tap();
    if (tap) {
      const hit = tg.candidates.findIndex((i) => (tg.kind === 'enemy' ? this.hitEnemy(i, tap) : this.hitFrame(i, tap)));
      if (hit >= 0) {
        if (hit === tg.pos) return this.pickTarget();
        tg.pos = hit;
        g.audio.playSe('cursor');
        return;
      }
      g.audio.playSe('cancel');
      return this.backFromTarget();
    }
    if (input.repeat('left') || input.repeat('up')) {
      tg.pos = (tg.pos - 1 + n) % n;
      g.audio.playSe('cursor');
    } else if (input.repeat('right') || input.repeat('down')) {
      tg.pos = (tg.pos + 1) % n;
      g.audio.playSe('cursor');
    } else if (input.pressed('ok')) this.pickTarget();
    else if (input.pressed('cancel')) {
      g.audio.playSe('cancel');
      this.backFromTarget();
    }
  }

  pickTarget() {
    this.game.audio.playSe('ok');
    const t = this.target.candidates[this.target.pos];
    const done = this.target.done;
    this.target = null;
    done(t);
  }

  backFromTarget() {
    const back = this.target.back;
    this.target = null;
    if (back === 'list') this.phase = 'list';
    else this.openCommandMenu(this.cmdIndex ?? 0);
  }

  hitEnemy(i, p) {
    const e = this.enemyBoxes[i];
    return p.x >= e.x - 10 && p.x <= e.x + e.w + 10 && p.y >= e.y - 10 && p.y <= GROUND_Y + 10;
  }

  hitFrame(i, p) {
    const f = this.frameRect(i);
    return p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h;
  }

  setCommand(c) {
    this.commands[this.who] = c;
    this.list = null;
    this.nextActor(1);
  }

  // ---- 描く ----
  frameRect(i) {
    const n = this.b.allies.length;
    const w = Math.floor((WIDTH - 16 - (n - 1) * 6) / n);
    return { x: 8 + i * (w + 6), y: FRAME_Y, w, h: FRAME_H };
  }

  frameCenter(i) {
    const f = this.frameRect(i);
    return { x: f.x + f.w / 2, y: f.y + 10 };
  }

  draw(ctx) {
    const g = this.game;
    const [top, bottom] = this.area.bg ?? ['#9ccbe8', '#e8f2d8'];
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, top);
    grad.addColorStop(0.62, bottom);
    grad.addColorStop(1, shade(bottom, -0.18));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(60, 80, 40, 0.18)';
    ctx.beginPath();
    ctx.ellipse(WIDTH / 2, GROUND_Y + 6, 300, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawEnemies(ctx);
    if (this.flashT > 0) {
      ctx.globalAlpha = (this.flashT / 260) * 0.35;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }
    this.drawFrames(ctx);
    if (this.text && this.phase === 'play' && this.prevText) {
      drawWindow(ctx, 8, 8, WIDTH - 16, 64);
      g.font.draw(ctx, this.prevText, 24, 18, COLORS.textDim);
      g.font.draw(ctx, this.text, 24, 42, COLORS.text);
    } else if (this.text) {
      drawWindow(ctx, 8, 8, WIDTH - 16, 40);
      g.font.draw(ctx, this.text, 24, 20, COLORS.text);
    }
    if (this.phase === 'command' || this.phase === 'list' || (this.phase === 'target' && this.menu)) this.menu?.draw(ctx, g.font);
    if (this.phase === 'list' || (this.phase === 'target' && this.target?.back === 'list')) this.list?.draw(ctx, g.font, { active: this.phase === 'list' });
    if (this.phase === 'target') this.drawTargetCursor(ctx);
    for (const p of this.pops) {
      const k = p.t / 900;
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const y = p.y - 18 - Math.min(1, p.t / 200) * 14;
      const w = g.font.width(p.text);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(Math.round(p.x - w / 2 - 4), Math.round(y - 3), w + 8, 22);
      g.font.draw(ctx, p.text, Math.round(p.x - w / 2), Math.round(y), p.color);
      ctx.globalAlpha = 1;
    }
  }

  drawEnemies(ctx) {
    const g = this.game;
    const b = this.b;
    b.enemies.forEach((e, i) => {
      const box = this.enemyBoxes[i];
      const f = this.fx[i];
      if (!alive(e) && f.fade >= 2) return;
      const appear = Math.min(1, this.introT / 300);
      ctx.globalAlpha = appear * (f.fade > 0 ? Math.max(0, 1 - (f.fade - 1)) : 1);
      if (f.flash > 0 && Math.floor(f.flash / 60) % 2 === 0) ctx.globalAlpha *= 0.25;
      const sx = f.shake > 0 ? Math.round(Math.sin(f.shake / 30) * 4) : 0;
      if (box.pic) ctx.drawImage(box.pic, box.x + sx, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
      if (!alive(e)) return;
      // HPゲージ（数字は出さない）
      const gw = Math.min(110, Math.max(60, box.w));
      const gx = Math.round(box.cx - gw / 2);
      ctx.fillStyle = 'rgba(40,30,20,0.6)';
      ctx.fillRect(gx - 1, GROUND_Y + 8, gw + 2, 7);
      ctx.fillStyle = '#e85a4f';
      ctx.fillRect(gx, GROUND_Y + 9, Math.round((gw * e.hp) / e.maxHp), 5);
      // 状態異常と補助のアイコン
      let ax = gx;
      for (const a of e.ailments) {
        drawSkull(ctx, ax, GROUND_Y + 18, AILMENT_COLOR[a], 0.7);
        ax += 14;
      }
      for (const [k, n] of Object.entries(e.buffs)) {
        g.font.draw(ctx, `${BUFF_LABEL[k]}↓${n}`, ax, GROUND_Y + 17, '#5a7fd0');
        ax += 40;
      }
      if (this.phase !== 'play' || this.text === '') this.drawIntent(ctx, i, box);
    });
  }

  // 頭の上の吹き出し：何をするか（アイコン）と、誰に（顔）。2回以上動くボスは、行動の数だけ縦に重ねる（上から順に実行）
  // ためのターンは黄色い吹き出しに稲妻、必殺技は枠が赤く点滅する
  drawIntent(ctx, i, box) {
    const list = this.b.intents[i];
    if (!list?.length) return;
    const e = this.b.enemies[i];
    const asleep = has(e, 'sleep');
    const h = 32;
    const shown = asleep ? [list[0]] : list;
    // 上に入りきらない時（大きなボスが何回も動く時）は、体の横に上から順に並べる
    if (box.y - 12 - shown.length * (h + 4) < 4) {
      shown.forEach((it, k) => this.drawBubble(ctx, it, box, Math.round(box.y + 6 + k * (h + 4)), asleep, false, Math.round(box.x + box.w + 6)));
      return;
    }
    let y = Math.round(box.y - h - 12);
    for (let k = shown.length - 1; k >= 0; k--) {
      this.drawBubble(ctx, shown[k], box, y, asleep, k === shown.length - 1);
      y -= h + 4;
    }
  }

  drawBubble(ctx, it, box, y, asleep, withTail, left = null) {
    const g = this.game;
    const h = 32;
    const faces = asleep || it.charge || it.targets === 'self' ? [] : it.targets === 'all' ? this.b.allies.map((u) => u.index) : it.targets;
    const iconW = asleep ? 36 : it.ailment && it.icon !== 'skull' ? 44 : 22;
    const faceW = 21;
    const w = 12 + iconW + faces.length * (faceW + 2);
    const x = left != null ? Math.min(left, WIDTH - 4 - w) : Math.round(box.cx - w / 2);
    ctx.fillStyle = it.charge ? '#fff3a0' : '#ffffff';
    roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    if (withTail) {
      ctx.beginPath();
      ctx.moveTo(box.cx - 6, y + h - 1);
      ctx.lineTo(box.cx + 2, y + h + 8);
      ctx.lineTo(box.cx + 6, y + h - 1);
      ctx.fill();
    }
    const blink = it.special && Math.floor(this.t / 250) % 2 === 0;
    ctx.strokeStyle = it.special ? (blink ? '#e02828' : '#ff9a9a') : it.charge ? '#c9a020' : '#8c6a4f';
    ctx.lineWidth = it.special ? 3 : 2;
    roundRect(ctx, x, y, w, h, 7);
    ctx.stroke();
    if (asleep) {
      g.font.draw(ctx, 'Zzz', x + 9, y + 8, '#5dade2');
      return;
    }
    let ix = x + 6;
    if (it.charge) {
      drawBolt(ctx, ix, y + 4);
      return;
    }
    const color = ELEMENT_COLOR[it.element] ?? ELEMENT_COLOR.none;
    if (it.icon === 'sword') drawSword(ctx, ix, y + 5, color);
    else if (it.icon === 'staff') drawStaff(ctx, ix, y + 5, color, this.t);
    else if (it.icon === 'skull') drawSkull(ctx, ix + 2, y + 7, AILMENT_COLOR[it.ailment] ?? '#9b59b6', 1);
    else drawShield(ctx, ix, y + 5);
    ix += 22;
    if (it.ailment && it.icon !== 'skull') {
      drawSkull(ctx, ix + 2, y + 7, AILMENT_COLOR[it.ailment], 1);
      ix += 22;
    }
    for (const idx of faces) {
      const u = this.b.allies[idx];
      ctx.globalAlpha = alive(u) ? 1 : 0.35;
      drawFace(ctx, g, u.m, ix, y + Math.round((h - faceW) / 2), 1);
      ctx.globalAlpha = 1;
      ix += faceW + 2;
    }
  }

  drawFrames(ctx) {
    const g = this.game;
    const st = g.state;
    this.b.allies.forEach((u, i) => {
      const m = u.m;
      const r = this.frameRect(i);
      const sh = this.allyFx[i].shake > 0 ? Math.round(Math.sin(this.allyFx[i].shake / 25) * 3) : 0;
      drawWindow(ctx, r.x + sh, r.y, r.w, r.h);
      const active = (this.phase === 'command' || this.phase === 'list' || this.phase === 'target') && this.who === i;
      if (active) {
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + sh + 5, r.y + 5, r.w - 10, r.h - 10);
      }
      const s = totalStats(m, g.items);
      const down = isDown(m);
      ctx.globalAlpha = down ? 0.35 : 1;
      drawFace(ctx, g, m, r.x + sh + 12, r.y + 12, 2);
      ctx.globalAlpha = 1;
      const tx = r.x + sh + 62;
      g.font.draw(ctx, u.name, tx, r.y + 10, down ? DOWN_RED : COLORS.title);
      g.font.draw(ctx, `HP ${m.hp}/${s.hp}`, tx, r.y + 32, COLORS.text);
      const gw = r.w - 78;
      ctx.fillStyle = '#d8c8a8';
      ctx.fillRect(tx, r.y + 52, gw, 4);
      ctx.fillStyle = m.hp / s.hp < 0.25 ? '#e85a4f' : '#5fbf6a';
      ctx.fillRect(tx, r.y + 52, Math.round((gw * m.hp) / s.hp), 4);
      g.font.draw(ctx, `MP ${m.mp}`, tx, r.y + 62, COLORS.text);
      let ax = r.x + sh + 14;
      for (const a of m.ailments) {
        drawSkull(ctx, ax, r.y + 62, AILMENT_COLOR[a], 0.75);
        ax += 15;
      }
      let bx = tx + 64;
      for (const [k, n] of Object.entries(u.buffs)) {
        g.font.draw(ctx, `${BUFF_LABEL[k]}↑${n}`, bx, r.y + 62, '#d06a3a');
        bx += 42;
      }
    });
  }

  drawTargetCursor(ctx) {
    const g = this.game;
    const tg = this.target;
    const i = tg.candidates[tg.pos];
    const bob = Math.round(Math.sin(this.t / 120) * 3);
    if (tg.kind === 'enemy') {
      const box = this.enemyBoxes[i];
      ctx.save();
      ctx.translate(Math.round(box.cx) + 6, Math.round(box.y) - 4 + bob);
      ctx.rotate(Math.PI / 2);
      drawCursor(ctx, 0, 0);
      ctx.restore();
      this.text = this.b.enemies[i].name;
    } else {
      const r = this.frameRect(i);
      drawCursor(ctx, r.x + r.w / 2 - 3, r.y - 14 + bob);
      this.text = this.b.allies[i].name;
    }
    drawWindow(ctx, 8, 8, WIDTH - 16, 40);
    g.font.draw(ctx, this.text, 24, 20, COLORS.text);
  }
}

// ---- 小さな絵 ----
// 顔のアイコン：歩く絵の顔（21×21）を、整数倍のまま描く（ドット絵の粒の大きさをそろえる）
function drawFace(ctx, g, m, x, y, scale) {
  const img = g.assets.image(`char:${faceKey(g, m)}`);
  const size = 21 * scale;
  ctx.fillStyle = '#f3e3c5';
  ctx.fillRect(x, y, size, size);
  if (img) ctx.drawImage(img, 37, 2, 21, 21, x, y, size, size);
}

// 大きな絵（480×480）を、表示する大きさまで半分ずつ縮める（なめらかに縮めて、ギザギザやちらつきを防ぐ）
function shrink(img, box, w, h, renderScale) {
  let src = document.createElement('canvas');
  src.width = box.w;
  src.height = box.h;
  src.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const tw = Math.max(1, Math.round(w * renderScale));
  const th = Math.max(1, Math.round(h * renderScale));
  while (src.width / 2 >= tw && src.height / 2 >= th) {
    const half = document.createElement('canvas');
    half.width = Math.round(src.width / 2);
    half.height = Math.round(src.height / 2);
    const c = half.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, half.width, half.height);
    src = half;
  }
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, tw, th);
  return out;
}
function faceKey(g, m) {
  return characterIdOf(g.state, m);
}

// 画像の、透明でない部分の範囲（モンスター画像は 480×480 の中に小さく描かれているため）
function alphaBox(img) {
  if (img._box) return img._box;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) {
    for (let xx = 0; xx < c.width; xx += 2) {
      if (d[(y * c.width + xx) * 4 + 3] > 20) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  img._box = x1 > x0 ? { x: x0, y: y0, w: x1 - x0 + 2, h: y1 - y0 + 2 } : { x: 0, y: 0, w: img.width, h: img.height };
  return img._box;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function drawSword(ctx, x, y, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 13; i++) ctx.fillRect(x + 6 + i, y + 15 - i, 3, 3);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(x + 2, y + 15, 7, 3);
  ctx.fillRect(x + 4, y + 13, 3, 7);
  ctx.fillRect(x + 1, y + 18, 3, 3);
}

function drawStaff(ctx, x, y, color, t) {
  ctx.fillStyle = '#8b5a2b';
  for (let i = 0; i < 14; i++) ctx.fillRect(x + 3 + i, y + 20 - i, 2, 2);
  const glow = 0.5 + 0.5 * Math.sin(t / 150);
  ctx.fillStyle = color;
  ctx.fillRect(x + 14, y + 1, 7, 7);
  ctx.globalAlpha = 0.35 + glow * 0.4;
  ctx.fillRect(x + 12, y - 1, 11, 11);
  ctx.globalAlpha = 1;
}

function drawSkull(ctx, x, y, color, s = 1) {
  const p = (dx, dy, w, h) => ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.ceil(w * s), Math.ceil(h * s));
  ctx.fillStyle = color;
  p(2, 0, 12, 2); p(0, 2, 16, 8); p(3, 10, 10, 4);
  ctx.fillStyle = '#ffffff';
  p(3, 4, 4, 4); p(9, 4, 4, 4);
  ctx.fillStyle = '#3a2a2a';
  p(4, 5, 2, 2); p(10, 5, 2, 2); p(5, 12, 1, 2); p(8, 12, 1, 2); p(11, 12, 1, 2);
}

function drawBolt(ctx, x, y) {
  ctx.fillStyle = '#e6b800';
  const pts = [[10, 0], [4, 12], [9, 12], [6, 24], [16, 9], [11, 9], [14, 0]];
  ctx.beginPath();
  pts.forEach(([px, py], k) => (k ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
  ctx.closePath();
  ctx.fill();
}

function drawShield(ctx, x, y) {
  ctx.fillStyle = '#7a8aa0';
  ctx.fillRect(x + 3, y + 1, 16, 12);
  ctx.fillRect(x + 5, y + 13, 12, 4);
  ctx.fillRect(x + 8, y + 17, 6, 3);
  ctx.fillStyle = '#c9d4e2';
  ctx.fillRect(x + 6, y + 4, 4, 8);
}
