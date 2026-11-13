// 戦闘の画面（フロントビュー）。ルールは src/core/battle.js、ここは見せ方と入力だけ
import { HEIGHT, WIDTH } from '../../config.js';
import {
  alive, applyDefeat, createBattle, finishWin, has, mustSkipInput, planEnemies, resolveTurn, startTurnEvents,
} from '../../core/battle.js';
import { characterIdOf, fullRecover, isDown, itemCount, learnedSkills, totalStats } from '../../core/party.js';
import { COLORS, drawCursor, drawWindow } from '../draw.js';
import { ListMenu } from '../list.js';
import { Menu } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';
import { battleBackground, drawBackgroundLife, drawIntro, Effects, INTRO_MS } from '../battlefx.js';
import { describeSkill } from '../../core/skilltext.js';

const ELEMENT_COLOR = { none: '#8a8a8a', water: '#3b7dd8', wind: '#3aa45a', fire: '#e0503a', thunder: '#e6b800', dark: '#8a4fc8', light: '#e8c84a' };
const AILMENT_COLOR = { poison: '#9b59b6', burn: '#e67e22', sleep: '#5dade2', confusion: '#ec7ab8', paralysis: '#f1c40f' };
const BUFF_LABEL = { atkUp: '攻', defUp: '防', focus: '会', defDown: '防' };
const FRAME_Y = 280;
const FRAME_H = 76;
const GROUND_Y = 192;
const MSG_Y = 229; // 戦いの文の窓
const CMD = { x: 8, bottom: 274, w: 176, head: 36 }; // コマンドの窓（左下。上に行動する人の顔と名前。下のはしは bottom）
const DOWN_RED = '#ff6a5a';

export class BattleScene extends Scene {
  // enemyIds：出てくる敵、area：data/enemies.json の areas の名前、onEnd(result)：戦闘が終わった時
  // skipRewards：勝っても経験値などを出さずに終える（魔王）
  // gentle：負けても全滅の扱いにしない（お金は減らず、その場で全員が元気になる。旅立ちの前の、町のスライム）
  // tips：戦いの中でシステムが出す説明 [{ on: 'start'（最初のターン）| 'big'（大技の吹き出しが初めて出た時）, say: セリフの名前 }]
  constructor({ enemyIds, area, boss = false, onEnd, skipRewards = false, gentle = false, tips = null }) {
    super();
    this.enemyIds = enemyIds;
    this.areaId = area;
    this.boss = boss;
    this.onEnd = onEnd;
    this.skipRewards = skipRewards;
    this.gentle = gentle;
    this.tips = (tips ?? []).map((t) => ({ ...t }));
  }

  // このターンに出す説明（それぞれ1回だけ）
  takeTip() {
    const big = this.b.intents.some((list) => list?.some((it) => it.special || it.big));
    const t = this.tips.find((x) => !x.done && (x.on === 'start' || (x.on === 'big' && big)));
    if (!t) return null;
    t.done = true;
    return this.game.pick(this.game.dialogues[t.say]) ?? null;
  }

  enter() {
    const g = this.game;
    this.area = g.enemies.areas[this.areaId] ?? { bg: ['#9ccbe8', '#e8f2d8'] };
    this.b = createBattle({ state: g.state, items: g.items, skills: g.skills, enemyData: g.enemies, area: this.area, enemyIds: this.enemyIds, boss: this.boss });
    this.fx = this.b.enemies.map(() => ({ flash: 0, fade: 0, shake: 0, lunge: 0 }));
    this.allyFx = this.b.allies.map(() => ({ shake: 0, bounce: 0, red: 0, green: 0 }));
    this.effects = new Effects();
    this.shakeT = 0;
    this.hitstop = 0;
    this.syncDisp();
    // 背景：エリアごと（影の勇者は専用の闇）
    this.bgId = this.b.enemies.some((e) => e.d.ai === 'shadow') ? 'shadow' : this.areaId;
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
    this.introDur = this.boss ? INTRO_MS.boss : INTRO_MS.normal;
    if (this.boss) {
      g.audio.playSe('warning');
      setTimeout(() => g.audio.playSe('explosion'), 380);
      this.shakeT = 900;
      this.shakePow = 7;
    }
    this.play([{ t: 'msg', text: names.length === 1 ? `${names[0]}が あらわれた！` : '魔物の群れが あらわれた！' }], () => this.startTurn());
  }

  // 画面に出すHP・MP（本当の値は、ターンの計算でもう決まっている。画面では、攻撃などを見せた時に減らす）
  syncDisp() {
    this.disp = {
      ally: this.b.allies.map((u) => ({ hp: u.m.hp, mp: u.m.mp, lag: u.m.hp })),
      enemy: this.b.enemies.map((e) => ({ hp: e.hp, max: e.maxHp, lag: e.hp })),
    };
    this.bossLag = this.b.enemies[0] ? this.b.enemies[0].hp / this.b.enemies[0].maxHp : 1;
  }

  // ---- 敵の並び ----
  layoutEnemies() {
    const g = this.game;
    const n = this.b.enemies.length;
    this.enemyBoxes = this.b.enemies.map((e, i) => {
      const img = g.assets.image(`enemy:${e.id}`);
      const box = img ? alphaBox(img) : { x: 0, y: 0, w: 100, h: 100 };
      const s = e.d.boss ? Math.min(1.1, Math.min(150 * (e.d.big ?? 1), GROUND_Y - 44) / box.h, 260 / box.w) : Math.min(0.75, 120 / box.h, 150 / box.w);
      const w = Math.round(box.w * s);
      const h = Math.round(box.h * s);
      const cx = Math.round(WIDTH / 2 + 68 + (i - (n - 1) / 2) * 148); // 左のコマンドの窓に重ならないよう、少し右に寄せる
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
    return 760;
  }

  step(dt) {
    const g = this.game;
    if (this.talking) return;
    if (this.hitstop > 0) return; // 当たった瞬間、少しだけ止める
    if (this.textShown < (this.text?.length ?? 0)) this.textShown += dt / 22;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (g.input.pressed('ok') || g.input.tapped()) {
        this.textShown = 999;
        this.waitT = Math.min(this.waitT, 60);
      }
      return;
    }
    const fast = false; // 速さは、時間を2倍に進めて決める（update の speed）
    while (this.queue.length) {
      const e = this.queue.shift();
      if (e.t === 'msg') {
        this.prevText = this.text && this.text !== e.text ? this.text : '';
        this.text = e.text;
        this.textShown = 0;
        this.waitT = this.msgDelay() + e.text.length * (fast ? 10 : 22);
        return;
      }
      if (e.t === 'talk') {
        const lines = g.pick(g.dialogues[e.key]) ?? [];
        this.talking = true;
        g.scenes.push(new MessageScene(lines, { onDone: () => (this.talking = false) }));
        return;
      }
      if (e.t === 'transform') {
        this.fx[e.i] = { flash: 0, fade: 0, shake: 0, lunge: 0 };
        this.layoutEnemies();
        const en = this.b.enemies[e.i];
        this.disp.enemy[e.i] = { hp: en.hp, max: en.maxHp, lag: en.hp };
        this.bossLag = 1;
        g.audio.playSe('transform');
        setTimeout(() => g.audio.playSe('dragon_roar'), 700);
        if (e.bgm) g.audio.playBgm(e.bgm);
        this.shakeT = 1200;
        this.shakePow = 8;
        this.flashColor = '#ffffff';
        this.flashT = 260;
        this.waitT = 1100;
        return;
      }
      if (e.t === 'shake') {
        this.fx[e.i].shake = 600;
        continue;
      }
      if (e.t === 'act') {
        // 行動する人：仲間は枠がはね、敵は前に出る
        if (e.side === 'ally') this.allyFx[e.i].bounce = 280;
        else {
          this.fx[e.i].lunge = 260;
          if (e.special) {
            this.shakeT = 700;
            this.shakePow = 9;
            this.flashColor = '#ff2030';
            this.flashT = 260;
          }
        }
        this.lastActor = e;
        this.recentFx = false;
        this.waitT = fast ? 90 : 160;
        return;
      }
      if (e.t === 'mp') {
        const d = this.disp.ally[e.i];
        if (d) d.mp = Math.max(0, d.mp + e.amount);
        continue;
      }
      if (e.t === 'se') {
        g.audio.playSe(e.name);
        // 補助の技は、矢印のエフェクト
        if (e.name === 'buff' || e.name === 'debuff') {
          const up = e.name === 'buff';
          const enemyAct = this.lastActor?.side === 'enemy';
          if (up === enemyAct || (!up && !enemyAct)) {
            // 敵が自分を強くする／仲間が敵を弱くする → 敵の上
            for (const box of this.enemyBoxes) this.effects.spawn(up ? 'buff' : 'debuff', box.cx, box.y + box.h / 2);
          } else this.b.allies.forEach((u, i) => this.effects.spawn(up ? 'buff' : 'debuff', this.frameCenter(i).x, this.frameRect(i).y + 30));
        }
      } else if (e.t === 'hit') {
        const crit = !!e.crit;
        if (e.side === 'enemy') {
          const d = this.disp.enemy[e.i];
          d.lag = Math.max(d.lag ?? d.hp, d.hp);
          d.hp = Math.max(0, d.hp - e.amount);
          this.fx[e.i].flash = 300;
          const box = this.enemyBoxes[e.i];
          if (!this.recentFx && e.amount > 0) this.effects.spawn('slash', box.cx, box.y + box.h / 2, { big: crit });
          this.effects.spawn('impact', box.cx + (Math.random() - 0.5) * 20, box.y + box.h / 2);
        } else {
          const d = this.disp.ally[e.i];
          d.lag = Math.max(d.lag ?? d.hp, d.hp);
          d.hp = Math.max(0, d.hp - e.amount);
          this.allyFx[e.i].shake = 300;
          this.allyFx[e.i].red = 300;
          const c = this.frameCenter(e.i);
          if (!this.recentFx && e.amount > 0) this.effects.spawn('claw', c.x, c.y + 26);
        }
        if (e.amount > 0) this.pop(e.side, e.i, String(e.amount), crit ? '#ffef5a' : e.side === 'ally' ? '#ff9a8a' : '#ffffff', crit);
        else this.pop(e.side, e.i, '0', '#cccccc');
        this.hitstop = crit ? 150 : e.amount > 0 ? 60 : 0;
        if (crit) {
          this.shakeT = 380;
          this.shakePow = 6;
        }
        this.waitT = fast ? 140 : 260;
        return;
      } else if (e.t === 'heal') {
        if (e.side === 'enemy') {
          const d = this.disp.enemy[e.i];
          d.hp = Math.min(d.max, d.hp + e.amount);
          const box = this.enemyBoxes[e.i];
          this.effects.spawn('heal', box.cx, box.y + box.h / 2);
        } else {
          const d = this.disp.ally[e.i];
          d.hp += e.amount;
          this.allyFx[e.i].green = 450;
          const c = this.frameCenter(e.i);
          this.effects.spawn('heal', c.x, c.y + 20);
        }
        this.pop(e.side, e.i, String(e.amount), '#8ef0a0');
      } else if (e.t === 'revive') {
        const d = this.disp.ally[e.i];
        if (d) d.hp = e.hp ?? this.b.allies[e.i].m.hp;
        this.allyFx[e.i].green = 600;
        const c = this.frameCenter(e.i);
        this.effects.spawn('magic', c.x, c.y + 20, { element: 'light' });
      } else if (e.t === 'ailment') {
        const p = e.side === 'enemy' ? { x: this.enemyBoxes[e.i].cx, y: this.enemyBoxes[e.i].y + 20 } : { x: this.frameCenter(e.i).x, y: this.frameRect(e.i).y + 20 };
        this.effects.spawn('status', p.x, p.y);
      } else if (e.t === 'miss') this.pop(e.side, e.i, 'ミス', '#dddddd');
      else if (e.t === 'down' && e.side === 'enemy') {
        this.disp.enemy[e.i].hp = 0;
        this.fx[e.i].fade = 1;
        this.waitT = fast ? 220 : 420;
        return;
      } else if (e.t === 'down' && e.side === 'ally') {
        this.disp.ally[e.i].hp = 0;
      } else if (e.t === 'fx') {
        // 魔法：ねらった相手の場所に、属性のエフェクト
        const targets = e.targets ?? [];
        for (const ti of targets) {
          const p = e.side === 'enemy' ? { x: this.enemyBoxes[ti].cx, y: this.enemyBoxes[ti].y + this.enemyBoxes[ti].h / 2 } : { x: this.frameCenter(ti).x, y: this.frameRect(ti).y + 30 };
          if (e.kind === 'magic') this.effects.spawn('magic', p.x, p.y, { element: e.element });
          else this.effects.spawn('slash', p.x, p.y, { element: e.element });
        }
        this.recentFx = true;
        this.flashColor = ELEMENT_COLOR[e.element] ?? '#ffffff';
        this.flashT = 200;
        this.waitT = e.kind === 'magic' ? (fast ? 260 : 460) : fast ? 120 : 200;
        return;
      }
    }
    const then = this.after;
    this.after = null;
    then?.();
  }

  pop(side, i, text, color, big = false) {
    const p = side === 'enemy' ? { x: this.enemyBoxes[i].cx + (Math.random() - 0.5) * 16, y: this.enemyBoxes[i].y + this.enemyBoxes[i].h / 2 } : this.frameCenter(i);
    this.pops.push({ x: p.x, y: p.y, text, color, t: 0, big, label: big ? '会心！' : null });
  }

  // ---- ターン ----
  startTurn() {
    const b = this.b;
    this.syncDisp(); // 見せ終わったら、画面の数字を本当の値にそろえる（毒・MPなど）
    if (b.result) return this.finish();
    planEnemies(b);
    if (b.intents.some((list) => list?.some((it) => it.special || it.big))) this.game.audio.playSe('warning');
    // ターンの始めの出来事（ルークのビビり覚醒）を見せてから、コマンドを選ぶ
    const begin = () => {
      this.text = '';
      this.prevText = '';
      this.commands = [];
      this.who = -1;
      this.nextActor(1);
    };
    const ev = startTurnEvents(b);
    const go = () => (ev.length ? this.play(ev, begin) : begin());
    // システムの説明（吹き出しが見えている状態で出す）
    const tip = this.takeTip();
    if (!tip) return go();
    this.text = ''; // 吹き出しを見せたまま説明する
    this.talking = true;
    this.game.scenes.push(new MessageScene(tip, { onDone: () => { this.talking = false; go(); } }));
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
        ...(this.lastCommands && this.who === this.firstInputIndex() ? [{ label: 'くり返す', value: 'repeat' }] : []),
        // 開発者モード：すぐに勝つ
        ...(this.game.state?.modes?.dev ? [{ label: '勝つ（開発）', value: 'win' }] : []),
      ],
      x: CMD.x, y: 0, width: CMD.w, index,
    });
    // 窓の下のはしをそろえる（項目が多い時は上にのびる）
    this.cmdY = CMD.bottom - (CMD.head + 18 + this.menu.items.length * 26);
    this.menu.y = this.cmdY + CMD.head;
  }

  toggleSpeed() {
    const g = this.game;
    g.settings.animSpeed = g.settings.animSpeed === 1 ? 0 : 1;
    g.saveSettings?.();
    g.audio.playSe('cursor');
  }

  // くり返す：前のターンと同じ行動を、まだ選んでいない全員に入れる（MPや道具が足りない時は、たたかう）
  repeatLast() {
    const g = this.game;
    const last = this.lastCommands ?? [];
    for (let i = this.who; i < this.b.allies.length; i++) {
      const u = this.b.allies[i];
      if (!alive(u) || mustSkipInput(u)) {
        this.commands[i] = { type: 'none' };
        continue;
      }
      let c = last[i] ? { ...last[i] } : { type: 'attack', target: 0 };
      if (c.type === 'skill' && (g.skills[c.skill]?.mp ?? 0) > u.m.mp) c = { type: 'attack', target: c.target ?? 0 };
      if (c.type === 'item' && itemCount(g.state, c.item) <= this.commands.filter((x, k) => k < i && x?.type === 'item' && x.item === c.item).length) c = { type: 'attack', target: 0 };
      if (c.type === 'escape' || c.type === 'none') c = { type: 'attack', target: 0 };
      this.commands[i] = c;
    }
    this.runTurn();
  }

  runTurn() {
    this.lastCommands = this.commands.map((c) => ({ ...c }));
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
      // 勝った時の画面：経験値・お金・落とした物・レベルアップを、まとめて見せる
      const st = g.state;
      const before = { gold: st.gold ?? 0, bag: { ...(st.bag ?? {}) }, levels: b.allies.map((u) => u.m.level) };
      const ev = finishWin(b);
      const exp = b.enemies.reduce((n, e) => n + (e.noReward ? 0 : e.d.exp), 0);
      const drops = Object.entries(st.bag ?? {}).filter(([id, n]) => n > (before.bag[id] ?? 0)).map(([id]) => g.items[id]?.name ?? id);
      const levelUps = b.allies.map((u, i) => ({ name: u.name, level: u.m.level, up: u.m.level > before.levels[i] })).filter((x) => x.up);
      const learned = ev.filter((x) => x.t === 'msg' && x.text.includes('覚えた')).map((x) => x.text);
      if (levelUps.length) setTimeout(() => g.audio.playSe('levelup'), 1200);
      this.syncDisp();
      this.text = '';
      this.victory = { t: 0, exp, gold: (st.gold ?? 0) - before.gold, drops, levelUps, learned, sparks: Array.from({ length: 24 }, (_, i) => ({ a: (i / 24) * Math.PI * 2, o: Math.random(), c: i % 2 ? '#ffe27a' : '#ffffff' })) };
      this.phase = 'victory';
    } else if (b.result === 'lose') {
      g.audio.stopBgm(300);
      g.audio.playJingle('jingle_gameover');
      const text = this.gentle ? `${b.allies[0].name}は 力つきてしまった…` : `${b.allies[0].name}たちは 全滅してしまった…`;
      this.play([{ t: 'msg', text }, { t: 'msg', text: '' }], () => this.close('lose'));
    } else this.close(b.result);
  }

  close(result) {
    const g = this.game;
    this.phase = 'done';
    if (result === 'lose' && this.gentle) {
      fullRecover(g.state, g.items);
    } else if (result === 'lose') {
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
    // 戦闘の速さ：×2 の時は、時間を2倍に進める（Shift キー、またはコマンドの窓の「×1／×2」で切りかえ）
    if (g.input.pressed('dash')) this.toggleSpeed();
    if (g.settings.animSpeed === 1) dt *= 2;
    this.t += dt;
    this.introT += dt;
    this.effects.update(this.hitstop > 0 ? 0 : dt);
    this.hitstop = Math.max(0, this.hitstop - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    for (const f of this.fx) f.lunge = Math.max(0, (f.lunge ?? 0) - dt);
    for (const f of this.allyFx) {
      f.bounce = Math.max(0, f.bounce - dt);
      f.red = Math.max(0, f.red - dt);
      f.green = Math.max(0, f.green - dt);
    }
    // 減ったHPのあとを、少しおくれて追いかける
    for (const d of [...this.disp.ally, ...this.disp.enemy]) if (d.lag > d.hp) d.lag = Math.max(d.hp, d.lag - dt * 0.12 * Math.max(1, (d.lag - d.hp) / 20));
    const e0 = this.disp.enemy[0];
    if (e0) {
      const k = Math.max(0, e0.hp / e0.max);
      this.bossLag = this.bossLag > k ? Math.max(k, this.bossLag - dt / 1400) : k;
    }
    if (this.introT < this.introDur) return; // 始まりの演出の間は待つ
    if (this.phase === 'victory') {
      this.victory.t += dt;
      if (this.victory.t > 1400 && (g.input.pressed('ok') || g.input.tapped())) this.close('win');
      for (const p of this.pops) p.t += dt;
      return;
    }
    for (const f of this.fx) {
      f.flash = Math.max(0, f.flash - dt);
      f.shake = Math.max(0, (f.shake ?? 0) - dt);
      if (f.fade > 0 && f.fade < 2) f.fade = Math.min(2, f.fade + dt / 400);
    }
    for (const f of this.allyFx) f.shake = Math.max(0, f.shake - dt);
    this.flashT = Math.max(0, (this.flashT ?? 0) - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1000);

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
    // 「×1／×2」をタップ
    const tap = g.input.tap();
    const sp = this.speedChip;
    if (tap && sp && tap.x >= sp.x && tap.x <= sp.x + sp.w && tap.y >= sp.y && tap.y <= sp.y + sp.h) return this.toggleSpeed();
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
    if (v === 'attack') return this.chooseTarget('enemy', (t) => this.setCommand({ type: 'attack', target: t }), 'command', 'たたかう');
    if (v === 'guard') return this.setCommand({ type: 'guard' });
    if (v === 'repeat') return this.repeatLast();
    if (v === 'win') {
      for (const e of this.b.enemies) e.hp = 0;
      this.b.result = 'win';
      this.syncDisp();
      return this.finish();
    }
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
        // ビビり覚醒のターンは、MPを使わない
        items: ids.map((id) => ({ label: g.skills[id].name, right: `MP ${u.panic ? 0 : g.skills[id].mp}`, value: id, disabled: !u.panic && g.skills[id].mp > u.m.mp })),
        x: 192, y: 56, w: 300, rows: 6, index: Math.max(0, ids.indexOf(this.memory?.[this.who]?.skill)),
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
        x: 192, y: 56, w: 300, rows: 6,
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
      if (target === 'enemy') return this.chooseTarget('enemy', (t) => this.setCommand({ type: 'skill', skill: id, target: t }), 'list', sk.name);
      if (target === 'ally' || target === 'ally_down') return this.chooseTarget(target, (t) => this.setCommand({ type: 'skill', skill: id, target: t }), 'list', sk.name);
      return this.setCommand({ type: 'skill', skill: id, target: null });
    }
    const item = g.items[id];
    if (item.use?.warp || item.battle === false) return this.notice('ここでは使えないようだ…', 2);
    this.chooseTarget(item.target === 'ally_down' ? 'ally_down' : 'ally', (t) => this.setCommand({ type: 'item', item: id, target: t }), 'list', item.name);
  }

  // label：使うもの（たたかう・技の名前・道具の名前）。相手を選ぶ間、下の窓に「だれが：何を ▶ だれに」と出す
  chooseTarget(kind, done, back = 'command', label = '') {
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
    this.target = { kind, candidates, pos: 0, done, back, label };
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
    return p.x >= e.x - 10 && p.x <= e.x + e.w + 10 && p.y >= e.y - 10 && p.y <= GROUND_Y + 34; // 名前の所をタップしても選べる
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
  // 画面の並び：上＝ボスの名前とHP（ボス戦だけ）、まん中＝敵、その下＝戦いの文の窓、いちばん下＝仲間の枠
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
    ctx.save();
    // 画面の揺れ（会心・必殺技・ボスの登場）
    if (this.shakeT > 0) {
      const a = Math.min(1, this.shakeT / 300) * (this.shakePow ?? 4);
      ctx.translate(Math.round(Math.sin(this.t / 23) * a), Math.round(Math.cos(this.t / 31) * a * 0.6));
    }
    // 背景（エリアごとのドット絵）
    const bg = battleBackground(this.bgId, this.area.bg ?? ['#9ccbe8', '#e8f2d8']);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    drawBackgroundLife(ctx, this.bgId, this.t);
    // 敵の足もとの影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const box of this.enemyBoxes) {
      ctx.beginPath();
      ctx.ellipse(box.cx, GROUND_Y + 2, Math.max(30, box.w * 0.42), 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawEnemies(ctx);
    this.effects.draw(ctx);
    if (this.flashT > 0) {
      ctx.globalAlpha = (this.flashT / 260) * 0.35;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);
      ctx.globalAlpha = 1;
    }
    if (this.boss && this.phase !== 'victory' && this.disp.enemy[0]?.hp > 0) this.drawBossBar(ctx);
    this.drawFrames(ctx);
    ctx.restore();

    // 戦いの文の窓
    if (this.text && this.phase !== 'target') this.drawMessage(ctx);
    // 相手を選ぶ間は、コマンドの窓と一覧を隠す（敵が隠れないように）
    if (this.phase === 'command' || this.phase === 'list') this.drawCommandPanel(ctx);
    if (this.phase === 'list') {
      this.list?.draw(ctx, g.font, { active: this.phase === 'list' });
      this.drawListInfo(ctx);
    }
    if (this.phase === 'target') this.drawTargetCursor(ctx);
    this.drawPops(ctx);
    if (this.phase === 'victory') this.drawVictory(ctx);
    // 戦いが始まる時の演出
    drawIntro(ctx, this.introT, this.boss, this.b.enemies[0]?.name ?? '', g.font, g.fontBig);
  }

  // コマンドの窓：上に行動する人の顔・名前・レベル、下に大きなボタン（アイコン付き）
  drawCommandPanel(ctx) {
    const g = this.game;
    const u = this.b.allies[this.who];
    const menu = this.menu;
    if (!u || !menu) return;
    const top = this.cmdY ?? 90;
    const h = CMD.head + 9 + menu.items.length * 26 + 9;
    drawWindow(ctx, CMD.x, top, CMD.w, h);
    // 速さの切りかえ（×1／×2）
    const fast = g.settings.animSpeed === 1;
    this.speedChip = { x: CMD.x + CMD.w - 44, y: top + 9, w: 34, h: 20 };
    const sc = this.speedChip;
    ctx.fillStyle = fast ? 'rgba(255,224,138,0.3)' : 'rgba(122,208,255,0.15)';
    ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
    ctx.strokeStyle = fast ? COLORS.title : COLORS.textDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(sc.x + 0.5, sc.y + 0.5, sc.w - 1, sc.h - 1);
    g.font.drawCentered(ctx, fast ? '×2' : '×1', sc.x + sc.w / 2, sc.y + 2, fast ? COLORS.title : COLORS.textDim);
    const face = g.assets.image(`face:${faceKey(g, u.m)}`);
    if (face) {
      ctx.fillStyle = COLORS.winInner;
      ctx.fillRect(CMD.x + 9, top + 7, 33, 33);
      ctx.drawImage(face, CMD.x + 10, top + 8, 31, 31);
    }
    g.font.draw(ctx, u.name, CMD.x + 50, top + 7, COLORS.title);
    g.font.draw(ctx, `Lv${u.m.level}`, CMD.x + 50, top + 23, COLORS.textDim);
    ctx.fillStyle = 'rgba(216,192,122,0.5)';
    ctx.fillRect(CMD.x + 8, top + CMD.head + 6, CMD.w - 16, 1);
    menu.w = CMD.w;
    const active = this.phase === 'command';
    menu.items.forEach((it, i) => {
      const ry = menu.y + 9 + i * 26;
      const sel = i === menu.index;
      if (sel) {
        ctx.fillStyle = active ? 'rgba(122,208,255,0.22)' : 'rgba(154,156,200,0.15)';
        ctx.fillRect(CMD.x + 8, ry, CMD.w - 16, 24);
        ctx.fillStyle = active ? COLORS.accent : COLORS.textDim;
        ctx.fillRect(CMD.x + 8, ry, 2, 24);
      }
      const icon = it.value === 'attack' ? 'sword' : it.value === 'skill' ? (u.m.job === 'swordsman' ? 'spark' : 'staff') : it.value === 'item' ? 'bag' : it.value === 'guard' ? 'shield' : it.value === 'repeat' ? 'repeat' : 'foot';
      drawCommandIcon(ctx, icon, CMD.x + 16, ry + 3, this.t);
      g.font.draw(ctx, it.label, CMD.x + 46, ry + 4, sel ? COLORS.text : COLORS.textDim);
    });
  }

  // 一覧の下に、選んでいる技・道具の説明
  drawListInfo(ctx) {
    const g = this.game;
    const it = this.list?.items?.[this.list.index];
    if (!it) return;
    const text = this.listKind === 'skill' ? describeSkill(g.skills[it.value]) : g.items[it.value]?.desc ?? '';
    if (!text) return;
    const y = this.list.y + this.list.h + 4;
    drawWindow(ctx, this.list.x, y, this.list.w, 32);
    g.font.draw(ctx, text, this.list.x + 14, y + 8, COLORS.text);
  }

  // 戦いの文：紺の窓に金のふち。1文字ずつ出し、数字は黄色に
  drawMessage(ctx) {
    const g = this.game;
    const x = 8;
    const y = MSG_Y;
    const w = WIDTH - 16;
    const two = !!this.prevText && this.phase === 'play';
    const h = 46;
    const bgc = ctx.createLinearGradient(0, y, 0, y + h);
    bgc.addColorStop(0, 'rgba(26,22,58,0.92)');
    bgc.addColorStop(1, 'rgba(12,10,30,0.92)');
    ctx.fillStyle = '#c8a24a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#5a4316';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = bgc;
    ctx.fillRect(x, y, w, h);
    const shown = Math.floor(this.textShown ?? 999);
    if (two) {
      drawColored(g.font, ctx, this.prevText, x + 16, y + 4, '#a8a2c8', Infinity);
      drawColored(g.font, ctx, this.text, x + 16, y + 24, '#ffffff', shown);
    } else drawColored(g.font, ctx, this.text, x + 16, y + 14, '#ffffff', shown);
  }

  // ボス戦：画面の上のまん中に、名前とHPのバー
  drawBossBar(ctx) {
    const g = this.game;
    const e = this.b.enemies[0];
    if (!e) return;
    const d = this.disp.enemy[0];
    const w = 300;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = 26;
    const k = Math.max(0, d.hp / d.max);
    const lag = Math.max(k, this.bossLag ?? k);
    g.font.drawCentered(ctx, e.name, WIDTH / 2 + 1, 7, '#000000');
    g.font.drawCentered(ctx, e.name, WIDTH / 2, 6, '#ffe8e8');
    ctx.fillStyle = '#1a0c10';
    ctx.fillRect(x - 3, y - 3, w + 6, 14);
    ctx.fillStyle = '#c8a24a';
    ctx.fillRect(x - 2, y - 2, w + 4, 12);
    ctx.fillStyle = '#2a1418';
    ctx.fillRect(x, y, w, 8);
    // 減った分は、しばらく白く残って追いかける
    ctx.fillStyle = '#ffe0a0';
    ctx.fillRect(x, y, Math.round(w * lag), 8);
    const bar = ctx.createLinearGradient(0, y, 0, y + 8);
    bar.addColorStop(0, k < 0.3 ? '#ff7a5a' : '#ff5a6a');
    bar.addColorStop(1, k < 0.3 ? '#a8201a' : '#a01830');
    ctx.fillStyle = bar;
    ctx.fillRect(x, y, Math.round(w * k), 8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y, Math.round(w * k), 2);
  }

  drawEnemies(ctx) {
    const g = this.game;
    const b = this.b;
    b.enemies.forEach((e, i) => {
      const box = this.enemyBoxes[i];
      const f = this.fx[i];
      const d = this.disp.enemy[i];
      if (d.hp <= 0 && f.fade >= 2) return;
      const appear = Math.min(1, this.introT / (this.boss ? INTRO_MS.boss : INTRO_MS.normal));
      // 敵を選んでいる時：選んでいる敵は足もとが光って少し大きく、ほかの敵は薄暗く
      const tg = this.phase === 'target' && this.target?.kind === 'enemy' ? this.target : null;
      const sel = !!tg && tg.candidates[tg.pos] === i;
      const pulse = (Math.sin(this.t / 140) + 1) / 2;
      if (sel) {
        ctx.fillStyle = `rgba(255,224,138,${(0.3 + 0.25 * pulse).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(box.cx, GROUND_Y + 2, Math.max(36, box.w * 0.5) + 6, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.globalAlpha = appear * (f.fade > 0 ? Math.max(0, 1 - (f.fade - 1)) : 1);
      if (tg && !sel) ctx.globalAlpha *= 0.35;
      if (f.flash > 0 && Math.floor(f.flash / 60) % 2 === 0) ctx.globalAlpha *= 0.25;
      const sx = f.shake > 0 ? Math.round(Math.sin(f.shake / 30) * 5) : 0;
      // 攻撃する時は、少し前に出て大きくなる
      const lunge = f.lunge > 0 ? Math.sin((1 - f.lunge / 260) * Math.PI) : 0;
      const sc = 1 + lunge * 0.1 + (sel ? 0.06 : 0);
      // ゆっくり息をするように上下する（ボスは大きく）
      const breathe = Math.round(Math.sin(this.t / 600 + i) * (e.d.boss ? 2 : 1));
      if (box.pic) {
        const w = box.w * sc;
        const h = box.h * sc;
        ctx.drawImage(box.pic, Math.round(box.cx - w / 2 + sx), Math.round(GROUND_Y - h + lunge * 8 + breathe), Math.round(w), Math.round(h));
        // 倒れる時は、赤く光ってくずれる
        if (f.fade > 0 && f.fade < 2) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#ff3040';
          ctx.fillRect(box.x, box.y, box.w, box.h);
        }
      }
      ctx.restore();
      if (d.hp <= 0) return;
      if (!e.d.boss) {
        // 雑魚：足もとにHPゲージと名前
        const gw = Math.min(96, Math.max(56, box.w * 0.8));
        const gx = Math.round(box.cx - gw / 2);
        const gy = GROUND_Y + 6;
        ctx.fillStyle = 'rgba(10,8,20,0.75)';
        ctx.fillRect(gx - 2, gy - 2, gw + 4, 8);
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(gx, gy, Math.round((gw * Math.max(d.hp, d.lag ?? d.hp)) / d.max), 4);
        ctx.fillStyle = d.hp / d.max < 0.3 ? '#ff7a5a' : '#e85a4f';
        ctx.fillRect(gx, gy, Math.round((gw * d.hp) / d.max), 4);
        const nw = g.font.width(e.name);
        if (tg && !sel) ctx.globalAlpha = 0.4;
        ctx.fillStyle = sel ? '#ffe08a' : 'rgba(10,8,20,0.55)';
        ctx.fillRect(Math.round(box.cx - nw / 2 - 6), gy + 7, nw + 12, 19);
        g.font.drawCentered(ctx, e.name, box.cx, gy + 9, sel ? '#2a1c08' : '#ffffff');
        ctx.globalAlpha = 1;
      }
      // 状態異常と、弱った・強くなったのしるし
      let ax = Math.round(box.cx + (e.d.boss ? box.w / 2 - 10 : 30));
      let ay = e.d.boss ? GROUND_Y - 18 : GROUND_Y - 14;
      for (const a of e.ailments) {
        drawSkull(ctx, ax, ay, AILMENT_COLOR[a], 0.7);
        ax += 14;
      }
      for (const [k, n] of Object.entries(e.buffs)) {
        const up = k !== 'defDown';
        g.font.draw(ctx, `${BUFF_LABEL[k]}${up ? '↑' : '↓'}${n}`, ax, ay - 2, up ? '#ff8a5a' : '#7aa8ff');
        ax += 40;
      }
      if (this.phase !== 'play' || this.text === '') this.drawIntent(ctx, i, box);
    });
  }

  // ダメージや回復の数字：はねて落ちる。会心は大きな黄色
  drawPops(ctx) {
    const g = this.game;
    for (const p of this.pops) {
      const k = p.t / 1000;
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const tt = Math.min(p.t, 420) / 420;
      const hop = tt < 0.6 ? Math.sin((tt / 0.6) * Math.PI) * 22 : Math.sin(((tt - 0.6) / 0.4) * Math.PI) * 6;
      const font = p.big && g.fontBig ? g.fontBig : g.font;
      const w = font.width(p.text);
      const x = Math.round(p.x - w / 2);
      const y = Math.round(p.y - 22 - hop);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) font.draw(ctx, p.text, x + dx, y + dy, '#120a10');
      font.draw(ctx, p.text, x, y, p.color);
      if (p.label) g.font.drawCentered(ctx, p.label, p.x, y - 16, '#ffef5a');
      ctx.globalAlpha = 1;
    }
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
    const danger = it.special || it.big; // 必殺技と大技は、赤く点滅
    const blink = danger && Math.floor(this.t / 250) % 2 === 0;
    ctx.strokeStyle = danger ? (blink ? '#e02828' : '#ff9a9a') : it.charge ? '#c9a020' : '#8c6a4f';
    ctx.lineWidth = danger ? 3 : 2;
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
    else if (it.icon === 'heart') drawHeart(ctx, ix + 1, y + 8);
    else if (it.icon === 'up' || it.icon === 'down') drawArrow(ctx, ix + 3, y + 6, it.icon === 'up');
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

  // 仲間の枠：行動する人ははねて光り、ダメージを受けた人はゆれて赤く光る。回復は緑。HPが少ないと枠が赤く点滅
  drawFrames(ctx) {
    const g = this.game;
    this.b.allies.forEach((u, i) => {
      const m = u.m;
      const d = this.disp.ally[i];
      const fx = this.allyFx[i];
      const r = this.frameRect(i);
      const sh = fx.shake > 0 ? Math.round(Math.sin(fx.shake / 25) * 4) : 0;
      const hop = fx.bounce > 0 ? Math.round(Math.sin((1 - fx.bounce / 280) * Math.PI) * 10) : 0;
      // 味方を選んでいる時：選んでいる人の枠は金色に光って少し上がり、ほかの人は薄暗く
      const tgA = this.phase === 'target' && this.target && this.target.kind !== 'enemy' ? this.target : null;
      const selA = !!tgA && tgA.candidates[tgA.pos] === i;
      const x = r.x + sh;
      const y = r.y - hop - (selA ? 5 : 0);
      const s = totalStats(m, g.items);
      const down = d.hp <= 0;
      const low = !down && d.hp / s.hp < 0.25;
      drawWindow(ctx, x, y, r.w, r.h);
      // コマンドを選んでいる間は、選んでいない人を薄暗く
      const choosing = tgA ? !selA : (this.phase === 'command' || this.phase === 'list' || this.phase === 'target') && this.who !== i;
      if (selA) {
        const p = (Math.sin(this.t / 140) + 1) / 2;
        ctx.fillStyle = `rgba(255,224,138,${(0.14 + 0.12 * p).toFixed(3)})`;
        ctx.fillRect(x + 3, y + 3, r.w - 6, r.h - 6);
        ctx.strokeStyle = p > 0.5 ? '#fff0b8' : '#ffd36e';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3.5, y + 3.5, r.w - 7, r.h - 7);
      }
      // 光（行動・ダメージ・回復）
      const glow = fx.bounce > 0 ? ['rgba(255,230,140,', fx.bounce / 280] : fx.red > 0 ? ['rgba(255,40,40,', fx.red / 300] : fx.green > 0 ? ['rgba(90,255,140,', fx.green / 450] : null;
      if (glow) {
        ctx.fillStyle = `${glow[0]}${(0.35 * glow[1]).toFixed(3)})`;
        ctx.fillRect(x + 4, y + 4, r.w - 8, r.h - 8);
      }
      const active = !tgA && (this.phase === 'command' || this.phase === 'list' || this.phase === 'target') && this.who === i;
      if (active || low) {
        ctx.strokeStyle = active ? COLORS.accent : Math.floor(this.t / 300) % 2 ? '#ff3a3a' : '#a01818';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 5, y + 5, r.w - 10, r.h - 10);
      }
      ctx.globalAlpha = down ? 0.35 : 1;
      drawFace(ctx, g, m, x + 12, y + 12, 2);
      ctx.globalAlpha = 1;
      const tx = x + 62;
      const nx = g.font.draw(ctx, u.name, tx, y + 8, down ? DOWN_RED : COLORS.title);
      // ビビり覚醒のターンは、レベルの所に金色で「覚醒！」（点滅）
      if (u.panic) g.font.draw(ctx, '覚醒！', nx + 8, y + 8, Math.floor(this.t / 200) % 2 ? COLORS.title : '#ffffff');
      else g.font.draw(ctx, `Lv${m.level}`, nx + 8, y + 8, COLORS.textDim);
      g.font.draw(ctx, `HP ${Math.max(0, Math.round(d.hp))}/${s.hp}`, tx, y + 28, low ? '#ff6a5a' : COLORS.text);
      const gw = r.w - 78;
      ctx.fillStyle = '#0a0e22';
      ctx.fillRect(tx, y + 48, gw, 5);
      ctx.fillStyle = '#ffd38a';
      ctx.fillRect(tx, y + 48, Math.round((gw * Math.max(0, Math.max(d.hp, d.lag ?? d.hp))) / s.hp), 5);
      ctx.fillStyle = d.hp / s.hp < 0.25 ? '#e85a4f' : '#5fbf6a';
      ctx.fillRect(tx, y + 48, Math.round((gw * Math.max(0, d.hp)) / s.hp), 5);
      g.font.draw(ctx, `MP ${Math.max(0, Math.round(d.mp))}`, tx, y + 56, COLORS.text);
      ctx.fillStyle = '#0a0e22';
      ctx.fillRect(tx + 64, y + 63, gw - 64, 3);
      ctx.fillStyle = '#5a8ae8';
      ctx.fillRect(tx + 64, y + 63, Math.round(((gw - 64) * Math.max(0, d.mp)) / Math.max(1, s.mp)), 3);
      let ax = x + 14;
      for (const a of m.ailments) {
        drawSkull(ctx, ax, y + 62, AILMENT_COLOR[a], 0.75);
        ax += 15;
      }
      // 強くなった・弱ったのしるしは、HPの右に
      let bx = x + r.w - 46;
      for (const [k, n] of Object.entries(u.buffs)) {
        const up = k !== 'defDown';
        g.font.draw(ctx, `${BUFF_LABEL[k]}${up ? '↑' : '↓'}${n}`, bx, y + 28, up ? '#ffa070' : '#9ac8ff');
        bx -= 42;
      }
      if (choosing) {
        ctx.fillStyle = 'rgba(0,0,12,0.5)';
        ctx.fillRect(x, y, r.w, r.h);
      }
    });
  }

  // 相手を選ぶ時のしるし：選んでいる相手を金色のかぎかっこで囲み、大きな矢印でさす。
  // 下の窓には「だれが：何を ▶ だれに」と、決め方を出す
  drawTargetCursor(ctx) {
    const g = this.game;
    const tg = this.target;
    const i = tg.candidates[tg.pos];
    const bob = Math.round(Math.sin(this.t / 120) * 3);
    const enemy = tg.kind === 'enemy';
    const name = enemy ? this.b.enemies[i].name : this.b.allies[i].name;
    const actor = this.b.allies[this.who];
    this.text = `${actor?.name ?? ''}：${tg.label || ''} ▶ ${name}`;
    this.textShown = 999;
    this.drawMessage(ctx);
    // しるしは、文の窓より手前に描く（味方の枠の上の矢印が、窓に隠れないように）
    if (enemy) {
      const box = this.enemyBoxes[i];
      drawBrackets(ctx, box.x, box.y, box.w, GROUND_Y - box.y, this.t);
      drawBigArrow(ctx, box.x - 24 + bob, Math.round(box.y + (GROUND_Y - box.y) / 2), 'right');
    } else {
      const r = this.frameRect(i);
      drawBrackets(ctx, r.x + 2, r.y - 3, r.w - 4, r.h - 4, this.t);
      drawBigArrow(ctx, Math.round(r.x + r.w / 2), r.y - 26 + bob, 'down');
    }
    // 決め方の説明は、文のすぐ右に（味方の枠をさす矢印と重ならないように）
    const hint = g.screen.touchEnabled ? 'もう一度タップで決定' : '←→でえらぶ';
    const hx = 24 + g.font.width(this.text) + 28;
    if (hx + g.font.width(hint) < WIDTH - 20) g.font.draw(ctx, hint, hx, MSG_Y + 14, COLORS.textDim);
  }

  // 勝った時：「勝利！」と、経験値・お金が数え上がり、レベルアップが光る
  drawVictory(ctx) {
    const g = this.game;
    const v = this.victory;
    const t = v.t;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 250) * 0.55;
    ctx.fillStyle = '#05030c';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    // 「勝利！」が上から落ちてきて、はねる
    const dropK = Math.min(1, t / 420);
    const dy = (1 - dropK) * -80 + (dropK >= 1 ? 0 : Math.sin(dropK * Math.PI) * 6);
    const title = '勝利！';
    const f = g.fontBig ?? g.font;
    f.drawCentered(ctx, title, WIDTH / 2 + 3, 30 + dy + 3, '#3a1a00');
    f.drawCentered(ctx, title, WIDTH / 2, 30 + dy, '#ffe27a');
    for (const s of v.sparks) {
      const life = ((t / 1400 + s.o) % 1);
      ctx.globalAlpha = Math.sin(life * Math.PI);
      ctx.fillStyle = s.c;
      const x = WIDTH / 2 + Math.cos(s.a) * (60 + life * 120);
      const y = 46 + Math.sin(s.a) * (20 + life * 40);
      ctx.fillRect(Math.round(x), Math.round(y) - 2, 1, 5);
      ctx.fillRect(Math.round(x) - 2, Math.round(y), 5, 1);
    }
    ctx.globalAlpha = 1;
    // 結果の窓
    const w = 420;
    const rows = 2 + v.drops.length + v.levelUps.length + v.learned.length;
    const h = 30 + rows * 24;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = 82;
    drawWindow(ctx, x, y, w, h);
    const count = (n) => Math.round(n * Math.min(1, Math.max(0, (t - 400) / 700)));
    let ry = y + 14;
    g.font.draw(ctx, 'けいけんち', x + 24, ry, COLORS.title);
    g.font.draw(ctx, `+${count(v.exp)}`, x + 200, ry, COLORS.text);
    ry += 24;
    g.font.draw(ctx, 'ゴールド', x + 24, ry, COLORS.title);
    g.font.draw(ctx, `+${count(v.gold)} G`, x + 200, ry, '#ffd36e');
    ry += 24;
    for (const dItem of v.drops) {
      if (t > 1100) g.font.draw(ctx, `${dItem} を 手に入れた！`, x + 24, ry, '#8ef0a0');
      ry += 24;
    }
    for (const lu of v.levelUps) {
      if (t > 1200) {
        const glow = Math.floor(t / 200) % 2 === 0;
        ctx.fillStyle = glow ? 'rgba(255,220,90,0.35)' : 'rgba(255,220,90,0.15)';
        ctx.fillRect(x + 12, ry - 3, w - 24, 22);
        g.font.draw(ctx, `${lu.name}は レベル${lu.level}に 上がった！`, x + 24, ry, '#ff6a5a');
      }
      ry += 24;
    }
    for (const ln of v.learned) {
      if (t > 1300) g.font.draw(ctx, ln, x + 24, ry, '#9ac8ff');
      ry += 24;
    }
    if (t > 1400 && Math.floor(t / 380) % 2 === 0) drawNextArrow(ctx, x + w - 26, y + h - 16);
    ctx.restore();
  }
}

// ---- 小さな絵 ----
// 顔のアイコン：歩く絵の顔（21×21）を、整数倍のまま描く（ドット絵の粒の大きさをそろえる）
function drawFace(ctx, g, m, x, y, scale) {
  const img = g.assets.image(`char:${faceKey(g, m)}`);
  const size = 21 * scale;
  ctx.fillStyle = '#33407a';
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

// 回復の予告（ハート）
function drawHeart(ctx, x, y) {
  ctx.fillStyle = '#e8506a';
  const rows = [[2, 4, 10, 4], [0, 6, 16, 4], [2, 10, 12, 2], [4, 12, 8, 2], [6, 14, 4, 2]];
  ctx.fillRect(x + 2, y + 2, 4, 2);
  ctx.fillRect(x + 10, y + 2, 4, 2);
  for (const [dx, dy, w, h] of rows) ctx.fillRect(x + dx, y + dy - 2, w, h);
}

// 強くする（上向き・赤）／弱くする（下向き・青）の予告
function drawArrow(ctx, x, y, up) {
  ctx.fillStyle = up ? '#e0543a' : '#3a78d8';
  for (let i = 0; i < 6; i++) {
    const w = 2 + i * 2;
    ctx.fillRect(x + 7 - i, up ? y + i : y + 15 - i, w, 1);
  }
  ctx.fillRect(x + 5, up ? y + 6 : y + 3, 4, 7);
}

// 戦いの文を描く。数字（ダメージ・回復の量など）は黄色にする。maxChars まで（1文字ずつ出すため）
function drawColored(font, ctx, text, x, y, color, maxChars = Infinity) {
  let cx = x;
  let n = 0;
  let run = '';
  let runDigit = null;
  const flush = () => {
    if (!run) return;
    // かげ
    font.draw(ctx, run, cx + 1, y + 1, '#000000');
    cx = font.draw(ctx, run, cx, y, runDigit ? '#ffe27a' : color);
    run = '';
  };
  for (const ch of String(text)) {
    if (n++ >= maxChars) break;
    const digit = /[0-9０-９]/.test(ch);
    if (runDigit !== null && digit !== runDigit) flush();
    runDigit = digit;
    run += ch;
  }
  flush();
}

// 「次へ」の小さな三角
function drawNextArrow(ctx, x, y) {
  ctx.fillStyle = '#ff6a5a';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y);
  ctx.lineTo(x + 5, y + 6);
  ctx.fill();
}

// コマンドのアイコン（剣・技の光・杖・袋・盾・足あと）。16×16くらい
function drawCommandIcon(ctx, kind, x, y, t) {
  const px = (dx, dy, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  if (kind === 'sword') {
    for (let i = 0; i < 11; i++) px(4 + i, 12 - i, 2, 2, i > 8 ? '#ffffff' : '#d8e0f0');
    px(2, 12, 6, 2, '#d8c07a');
    px(3, 14, 2, 3, '#8a5a2a');
  } else if (kind === 'spark') {
    for (let i = 0; i < 9; i++) px(3 + i, 11 - i, 2, 2, '#d8e0f0');
    const k = Math.floor(t / 150) % 2;
    px(11, 1, 1, 5, '#ffe27a');
    px(9, 3, 5, 1, '#ffe27a');
    if (k) px(4, 2, 2, 2, '#ffffff');
  } else if (kind === 'staff') {
    for (let i = 0; i < 11; i++) px(3 + i, 15 - i, 2, 2, '#a0703a');
    px(12, 1, 4, 4, '#7ad0ff');
    px(13, 2, 1, 1, '#ffffff');
  } else if (kind === 'bag') {
    px(3, 6, 12, 10, '#c8964a');
    px(4, 7, 10, 2, '#e0b070');
    px(6, 3, 6, 3, '#8a5a2a');
    px(8, 9, 2, 2, '#ffe27a');
  } else if (kind === 'shield') {
    px(3, 2, 12, 9, '#7a8aa0');
    px(5, 11, 8, 3, '#7a8aa0');
    px(7, 14, 4, 2, '#7a8aa0');
    px(6, 4, 3, 7, '#c9d4e2');
    px(8, 2, 2, 12, '#d8c07a');
  } else if (kind === 'repeat') {
    // ぐるっと回る矢印
    const c = '#8ef0a0';
    px(4, 3, 8, 2, c);
    px(12, 3, 2, 8, c);
    px(4, 11, 8, 2, c);
    px(2, 5, 2, 6, c);
    px(14, 9, 2, 1, c);
    px(10, 9, 6, 1, c);
    px(11, 10, 4, 1, c);
    px(12, 11, 2, 1, c);
  } else {
    // 足あと
    px(3, 8, 4, 6, '#c8b8a0');
    px(4, 5, 2, 2, '#c8b8a0');
    px(10, 3, 4, 6, '#c8b8a0');
    px(11, 0, 2, 2, '#c8b8a0');
  }
}

// 相手を選ぶ時の、四すみのかぎかっこ（金色。少し広がったり縮んだりする）
function drawBrackets(ctx, x, y, w, h, t) {
  const p = Math.round(((Math.sin(t / 140) + 1) / 2) * 4);
  const x0 = Math.round(x) - 5 - p;
  const y0 = Math.round(y) - 5 - p;
  const x1 = Math.round(x + w) + 5 + p;
  const y1 = Math.round(y + h) + 5 + p;
  const len = 12;
  const corner = (cx, cy, dx, dy) => {
    for (const [c, pad] of [['#1a1208', 1], ['#ffd36e', 0]]) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.min(cx, cx + dx * len) - pad, cy - (dy < 0 ? 3 : 0) - pad, len + pad * 2, 3 + pad * 2);
      ctx.fillRect(cx - (dx < 0 ? 3 : 0) - pad, Math.min(cy, cy + dy * len) - pad, 3 + pad * 2, len + pad * 2);
    }
  };
  corner(x0, y0, 1, 1);
  corner(x1, y0, -1, 1);
  corner(x0, y1, 1, -1);
  corner(x1, y1, -1, -1);
}

// 相手をさす、大きな矢印（金色に黒いふち）。(x, y) が矢印の根もと側のまん中
function drawBigArrow(ctx, x, y, dir) {
  const tri = (grow, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (dir === 'down') {
      ctx.moveTo(x, y + 14 + grow);
      ctx.lineTo(x - 10 - grow, y - grow);
      ctx.lineTo(x + 10 + grow, y - grow);
    } else {
      ctx.moveTo(x + 14 + grow, y);
      ctx.lineTo(x - grow, y - 10 - grow);
      ctx.lineTo(x - grow, y + 10 + grow);
    }
    ctx.closePath();
    ctx.fill();
  };
  tri(2, '#1a1208');
  tri(0, '#ffd36e');
  ctx.fillStyle = '#fff6d8';
  if (dir === 'down') ctx.fillRect(x - 6, y + 1, 12, 2);
  else ctx.fillRect(x + 1, y - 6, 2, 12);
}
