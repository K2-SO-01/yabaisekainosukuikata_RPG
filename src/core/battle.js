// 戦闘のルール（画面には依存しない）。企画書6章・4章の通り
// 使い方：createBattle → planEnemies（敵の予告）→ コマンドを集めて resolveTurn → b.events を画面が順に見せる
// → b.result が 'win' なら finishWin、'lose' なら全滅、'escape' なら逃げた
import { addItem, applyRecovery, gainExp, healAmount, isDown, itemCount, memberName, removeItem, totalStats } from './party.js';
import { addGold } from './state.js';
import { recordHabits, think as thinkWithBrain } from './brain.js';

const STRONG = { water: 'fire', fire: 'wind', wind: 'thunder', thunder: 'water' }; // 左が右に強い
export const MAJOR_AILMENTS = ['sleep', 'confusion', 'paralysis'];
const BATTLE_ONLY = MAJOR_AILMENTS; // 戦闘が終わると治る
const ELEMENT_SE = { fire: 'magic_fire', thunder: 'magic_thunder', water: 'magic_water', wind: 'magic_wind', light: 'magic_holy', dark: 'magic_dark' };
const AILMENT_TEXT = {
  poison: '{t}は 毒に おかされた！',
  burn: '{t}は やけどを 負った！',
  sleep: '{t}は 眠ってしまった！',
  confusion: '{t}は 混乱した！',
  paralysis: '{t}は 体が しびれた！',
};
const BUFF_TEXT = { atkUp: '味方全員の 攻撃力が 上がった！', defUp: '味方全員の 防御力が 上がった！', focus: '味方全員の 会心率が 上がった！' };
const BUFF_TURNS = 3;

// 属性の倍率（弱点1.5倍、相性が悪い・同じ属性は0.5倍）
export function elementRate(atk, def) {
  if (!atk || atk === 'none' || !def || def === 'none') return 1;
  if ((atk === 'light' && def === 'dark') || (atk === 'dark' && def === 'light')) return 1.5;
  if (STRONG[atk] === def) return 1.5;
  if (STRONG[def] === atk || atk === def) return 0.5;
  return 1;
}

function makeEnemy(enemyData, id, index, name) {
  const d = enemyData.enemies[id];
  return { side: 'enemy', index, id, name: name ?? d.name, d, hp: d.hp, maxHp: d.hp, ailments: [], buffs: {}, guard: false, cover: false, coverOthers: false, sleepCount: 0, confuseCount: 0, history: [], cycle0: 0 };
}

export function createBattle({ state, items, skills, enemyData, area, enemyIds, rng = Math.random, boss = false, think = null }) {
  const count = {};
  for (const id of enemyIds) count[id] = (count[id] ?? 0) + 1;
  const seen = {};
  const enemies = enemyIds.map((id, i) => {
    let name = enemyData.enemies[id].name;
    if (count[id] > 1) {
      seen[id] = (seen[id] ?? 0) + 1;
      name += 'ABCDE'[seen[id] - 1];
    }
    return makeEnemy(enemyData, id, i, name);
  });
  const allies = state.party.map((m, i) => ({
    side: 'ally', index: i, m, name: memberName(state, m), buffs: {}, guard: false, cover: false, sleepCount: 0, confuseCount: 0,
  }));
  return { state, items, skills, enemyData, area, rng, think, boss: boss || enemies.some((e) => e.d.boss), enemies, allies, turn: 0, intents: [], events: [], result: null };
}

// ---- 小さな道具 ----
export const alive = (u) => (u.side === 'ally' ? !isDown(u.m) : u.hp > 0);
const hpOf = (u) => (u.side === 'ally' ? u.m.hp : u.hp);
const ailmentsOf = (u) => (u.side === 'ally' ? u.m.ailments : u.ailments);
export const has = (u, a) => ailmentsOf(u).includes(a);
const living = (list) => list.filter(alive);
const pickOne = (b, list) => list[Math.floor(b.rng() * list.length)];

function maxHp(b, u) {
  return u.side === 'ally' ? totalStats(u.m, b.items).hp : u.maxHp;
}

export function stat(b, u, k) {
  let v = u.side === 'ally' ? totalStats(u.m, b.items)[k] : u.d[k];
  if (k === 'atk') {
    if (u.buffs.atkUp) v *= 1.5;
    if (has(u, 'burn')) v *= 0.75;
  } else if (k === 'def') {
    if (u.buffs.defUp) v *= 1.5;
    if (u.buffs.defDown) v *= 0.7;
  } else if (k === 'mat') {
    if (has(u, 'poison')) v *= 0.75;
    if (u.side === 'enemy' && u.buffs.atkUp) v *= 1.3; // 敵の「ちからをためる」は魔法も少し強くする
  }
  return v;
}

function setHp(b, u, v) {
  const hp = Math.max(0, Math.min(maxHp(b, u), Math.floor(v)));
  if (u.side === 'ally') u.m.hp = hp;
  else u.hp = hp;
}

function emit(b, e) {
  b.events.push(e);
}

function msg(b, text, vars = {}) {
  emit(b, { t: 'msg', text: text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') });
}

// ---- 敵の予告（どの敵も「行動の一覧」。ボスは2回・3回動くことがある） ----
function iconFor(sk) {
  if (sk.kind === 'physical') return 'sword';
  if (sk.kind === 'magic') return 'staff';
  if (sk.kind === 'status') return 'skull';
  if (sk.kind === 'heal') return 'heart';
  if (sk.kind === 'buff') return 'up';
  if (sk.kind === 'debuff') return 'down';
  return 'shield';
}

function makeIntent(b, e, sid, allies, extra = {}) {
  const sk = b.enemyData.skills[sid];
  const targets = sk.target === 'one' ? [pickOne(b, allies).index] : sk.target === 'all' ? 'all' : 'self';
  return { actor: e.index, sid, sk, targets, icon: iconFor(sk), element: sk.element ?? 'none', ailment: sk.inflict ?? null, ...extra };
}

// 通常技を選ぶ（同じ技を3回続けては選ばない）
function pickNormal(b, e) {
  const h = e.history;
  let opts = e.d.actions;
  if (h.length >= 2 && h[h.length - 1] === h[h.length - 2] && opts.length > 1) opts = opts.filter((s) => s !== h[h.length - 1]);
  const sid = pickOne(b, opts);
  h.push(sid);
  return sid;
}

// ボスは4ターン周期：通常 → 通常 → ため → 必殺
function planBoss(b, e, allies) {
  const n = ((b.turn - e.cycle0) % 4) + 1;
  if (n === 3) return [{ actor: e.index, charge: true, sk: { kind: 'charge' }, icon: 'charge', targets: 'self', element: 'none' }];
  if (n === 4) {
    const list = [makeIntent(b, e, e.d.special, allies, { special: true })];
    if (e.d.specialPlus) list.push(makeIntent(b, e, pickNormal(b, e), allies));
    return list;
  }
  return Array.from({ length: e.d.acts ?? 1 }, () => makeIntent(b, e, pickNormal(b, e), allies));
}

export function planEnemies(b) {
  const allies = living(b.allies);
  b.intents = b.enemies.map((e) => {
    if (!alive(e)) return null;
    // 頭で考えるボス（裏ボス）：作戦の表（b.enemyData.brains）を見て、行動とねらう相手を決める
    if (e.d.ai) {
      const plan = b.think ? b.think(b, e, allies) : thinkWithBrain(b, e, allies, b.enemyData.brains?.[e.d.ai]);
      if (plan?.length) {
        return plan.map((p) => {
          e.history.push(p.sid);
          const sk = b.enemyData.skills[p.sid];
          const targets = sk.target === 'one' ? [p.target ?? pickOne(b, allies).index] : sk.target === 'all' ? 'all' : 'self';
          return { actor: e.index, sid: p.sid, sk, targets, icon: iconFor(sk), element: sk.element ?? 'none', ailment: sk.inflict ?? null };
        });
      }
      // 作戦の表がない時は、でたらめに選ぶ（学習前の状態）
      return Array.from({ length: e.d.acts ?? 1 }, () => makeIntent(b, e, pickNormal(b, e), allies));
    }
    if (e.d.boss) return planBoss(b, e, allies);
    return [makeIntent(b, e, pickOne(b, e.d.actions), allies)];
  });
  return b.intents;
}

// コマンド入力を飛ばす（必ず眠っている番）かどうか
export function mustSkipInput(u) {
  return has(u, 'sleep') && u.sleepCount === 0;
}

const isGuardKind = (it) => it?.sk?.kind === 'guard' || it?.sk?.kind === 'guard_others';

// ---- 1ターン ----
// commands[味方の番号] = { type: 'attack'|'skill'|'item'|'guard'|'escape'|'none', skill, item, target }
export function resolveTurn(b, commands) {
  recordHabits(b, commands); // プレイヤーの戦い方の癖（裏ボスが読む）
  b.turn++;
  b.events = [];
  b.transformed = false;
  const all = [...b.allies, ...b.enemies];
  for (const u of all) {
    u.guard = false;
    u.cover = false;
    u.coverOthers = false;
    u.blocked = null;
    u.woke = false;
  }
  // 眠り・麻痺で動けるかを、ターンの最初に決める（ぼうぎょ・かばうも、動けない時は発動しない）
  for (const u of all) if (alive(u)) rollCanAct(b, u);

  // ぼうぎょ・かばう（行動順に関係なく最初に発動）
  b.allies.forEach((u, i) => {
    const c = commands[i];
    if (!alive(u) || u.blocked || !c) return;
    if (c.type === 'guard') {
      u.guard = true;
      msg(b, '{a}は 身を守っている！', { a: u.name });
    } else if (c.type === 'skill' && b.skills[c.skill]?.effect === 'cover' && u.m.mp >= b.skills[c.skill].mp) {
      u.m.mp -= b.skills[c.skill].mp;
      emit(b, { t: 'mp', i: u.index, amount: -b.skills[c.skill].mp });
      u.guard = true;
      u.cover = true;
      emit(b, { t: 'se', name: 'buff' });
      msg(b, '{a}は 仲間を かばっている！', { a: u.name });
    }
  });
  b.enemies.forEach((e) => {
    const list = b.intents[e.index] ?? [];
    if (!alive(e) || e.blocked) return;
    for (const it of list) {
      if (it.sk.kind === 'guard') e.guard = true;
      else if (it.sk.kind === 'guard_others') e.coverOthers = true;
      else continue;
      msg(b, it.sk.text, { actor: e.name });
    }
  });

  // にげる（だれか1人が選べば全員で。成功率50%）
  let escaping = false;
  if (b.allies.some((u, i) => alive(u) && commands[i]?.type === 'escape')) {
    if (b.rng() < 0.5) {
      emit(b, { t: 'se', name: 'escape' });
      msg(b, '{a}たちは 逃げ出した！', { a: b.allies[0].name });
      b.result = 'escape';
      endBattleAilments(b);
      return b.events;
    }
    msg(b, 'しかし 回り込まれてしまった！');
    escaping = true;
  }

  // 素早さの高い順（同じなら味方が先、味方同士は並び順）。「常に先制」のボスはいつも最初
  const actors = [];
  b.allies.forEach((u, i) => {
    const c = escaping ? null : commands[i];
    if (!alive(u)) return;
    // 眠り・麻痺で動けない人も順番は来る（「眠っている…」などを出すため）
    if (u.blocked || (c && !['guard', 'escape', 'none'].includes(c.type) && !(c.type === 'skill' && b.skills[c.skill]?.effect === 'cover'))) actors.push({ u, c });
  });
  for (const e of b.enemies) {
    const list = b.intents[e.index] ?? [];
    if (alive(e) && list.length && (e.blocked || list.some((it) => !isGuardKind(it)))) actors.push({ u: e, c: null });
  }
  const speed = (u) => (u.side === 'enemy' && u.d.first ? Infinity : stat(b, u, 'spd'));
  actors.sort((x, y) => speed(y.u) - speed(x.u) || (x.u.side === y.u.side ? x.u.index - y.u.index : x.u.side === 'ally' ? -1 : 1));

  for (const { u, c } of actors) {
    if (!alive(u)) continue;
    if (u.blocked === 'sleep' && has(u, 'sleep')) {
      emit(b, { t: 'zzz', side: u.side, i: u.index });
      msg(b, '{a}は 眠っている…', { a: u.name });
      continue;
    }
    if (u.blocked === 'paralysis') {
      msg(b, '{a}は しびれて 動けない！', { a: u.name });
      continue;
    }
    if (u.woke) msg(b, '{a}は 目を覚ました！', { a: u.name });
    if (u.side === 'ally' && (!c || ['guard', 'escape', 'none'].includes(c.type))) continue;
    if (has(u, 'confusion')) {
      u.confuseCount++;
      if (u.confuseCount === 1 || b.rng() < 1 / 3) {
        msg(b, '{a}は 混乱している！', { a: u.name });
        const side = u.side === 'ally' ? b.allies : b.enemies;
        const t = pickOne(b, living(side));
        msg(b, '{a}の 攻撃！', { a: u.name });
        hitWith(b, u, [t], { kind: 'physical', power: 1, element: 'none' });
        if (checkEnd(b)) break;
        continue;
      }
    }
    if (u.side === 'ally') {
      emit(b, { t: 'act', side: 'ally', i: u.index, kind: c.type === 'skill' ? b.skills[c.skill]?.kind : c.type });
      allyAction(b, u, c);
    }
    else {
      // ボスは自分の番が来たら、予告した行動を続けて行う
      for (const it of b.intents[u.index] ?? []) {
        if (!alive(u) || b.result || b.transformed) break;
        if (it.charge) {
          emit(b, { t: 'shake', side: 'enemy', i: u.index });
          emit(b, { t: 'se', name: 'charge' });
          msg(b, u.d.chargeText ?? '{a}は 力を ためている…', { a: u.name });
          continue;
        }
        if (isGuardKind(it)) continue;
        emit(b, { t: 'act', side: 'enemy', i: u.index, kind: it.sk.kind, special: !!it.special });
        enemyAction(b, u, it);
        if (checkEnd(b)) break;
      }
    }
    if (checkEnd(b) || b.transformed) break;
  }

  if (!b.result && !b.transformed) endOfTurn(b);
  return b.events;
}

function rollCanAct(b, u) {
  if (has(u, 'sleep')) {
    u.sleepCount++;
    if (u.sleepCount === 1 || (u.sleepCount === 2 && b.rng() < 0.5)) {
      u.blocked = 'sleep';
      return;
    }
    removeAilment(u, 'sleep');
    u.woke = true;
    return;
  }
  if (has(u, 'paralysis') && b.rng() < 0.25) u.blocked = 'paralysis';
}

function removeAilment(u, a) {
  const list = ailmentsOf(u);
  const i = list.indexOf(a);
  if (i >= 0) list.splice(i, 1);
}

// 状態異常をかける。かかったら true
function inflict(b, u, type, chance) {
  if (!alive(u)) return false;
  if (u.side === 'enemy') {
    if ((u.d.immune ?? []).includes(type)) return false;
    if (u.d.boss) {
      if (MAJOR_AILMENTS.includes(type)) return false; // 眠り・混乱・麻痺はボスに効かない
      chance /= 2;
    }
  } else {
    // 状態異常よけのアクセサリーは、かかる確率を半分にする
    const acc = b.items[u.m.equip?.accessory];
    if ((acc?.resist ?? []).includes(type)) chance /= 2;
  }
  if (b.rng() >= chance) return false;
  const list = ailmentsOf(u);
  if (type === 'poison' || type === 'burn') {
    if (list.includes(type)) return false;
    list.push(type);
  } else {
    for (const a of MAJOR_AILMENTS) removeAilment(u, a);
    list.push(type);
    u.sleepCount = 0;
    u.confuseCount = 0;
  }
  return true;
}

function sayAilment(b, t, type, ok) {
  if (ok) {
    emit(b, { t: 'se', name: 'status' });
    emit(b, { t: 'ailment', side: t.side, i: t.index });
    msg(b, AILMENT_TEXT[type], { t: t.name });
  } else msg(b, 'しかし {t}には 効かなかった！', { t: t.name });
}

// ダメージを計算する（ミス・会心・ブレ・属性・ぼうぎょ）
function calcDamage(b, actor, target, { kind, power, element }) {
  if (kind === 'physical' && b.rng() < 0.05) return { miss: true };
  if (kind === 'physical' && target.side === 'enemy' && target.d.physImmune) return { amount: 0, immune: true };
  const critRate = actor.side === 'ally' ? (actor.buffs.focus ? 0.2 : 0.05) : 0.02;
  const crit = b.rng() < critRate;
  const a = stat(b, actor, kind === 'magic' ? 'mat' : 'atk');
  const def = crit ? 0 : stat(b, target, 'def');
  let dmg = ((a * 100) / (100 + def)) * power;
  if (crit) dmg *= 1.5;
  dmg *= 0.9 + b.rng() * 0.2;
  if (target.side === 'enemy') dmg *= elementRate(element, target.d.element);
  if (target.guard) dmg *= 0.5;
  return { amount: Math.max(1, Math.floor(dmg)), crit };
}

// 何人かに攻撃を当てる。当たった人の一覧を返す（状態異常の追加などに使う）
function hitWith(b, actor, targets, spec) {
  const hit = [];
  if (spec.kind === 'magic' || spec.element !== 'none') emit(b, { t: 'fx', kind: spec.kind, element: spec.element, side: targets[0]?.side, targets: targets.map((t) => t.index) });
  for (const t of targets) {
    if (!alive(t)) continue;
    const r = calcDamage(b, actor, t, spec);
    if (r.miss) {
      emit(b, { t: 'se', name: 'miss' });
      emit(b, { t: 'miss', side: t.side, i: t.index });
      msg(b, 'ミス！ {t}に ダメージを 与えられない！', { t: t.name });
      continue;
    }
    if (r.immune) {
      emit(b, { t: 'hit', side: t.side, i: t.index, amount: 0 });
      msg(b, '{t}には 効かない！', { t: t.name });
      continue;
    }
    if (r.crit) {
      emit(b, { t: 'se', name: 'critical' });
      msg(b, '会心の一撃！');
    } else emit(b, { t: 'se', name: hitSe(actor, t, spec) });
    setHp(b, t, hpOf(t) - r.amount);
    emit(b, { t: 'hit', side: t.side, i: t.index, amount: r.amount, crit: r.crit });
    msg(b, t.side === 'ally' ? '{t}は {n}の ダメージを 受けた！' : '{t}に {n}の ダメージ！', { t: t.name, n: r.amount });
    if (has(t, 'sleep') && alive(t)) {
      removeAilment(t, 'sleep');
      msg(b, '{t}は 目を覚ました！', { t: t.name });
    }
    hit.push(t);
    if (!alive(t)) knockOut(b, t);
  }
  return hit;
}

function hitSe(actor, target, spec) {
  if (spec.kind === 'magic') return ELEMENT_SE[spec.element] ?? 'hit';
  if (target.side === 'ally') return 'damage';
  if (actor.side === 'ally' && actor.m.job === 'swordsman') return 'slash';
  return 'hit';
}

function knockOut(b, u) {
  if (u.side === 'ally') {
    u.m.hp = 0;
    u.m.ailments.length = 0;
    u.buffs = {};
    u.cover = false;
    emit(b, { t: 'se', name: 'dead' });
    emit(b, { t: 'down', side: 'ally', i: u.index });
    msg(b, '{t}は 倒れてしまった！', { t: u.name });
    return;
  }
  // 魔王の第一形態：同じ戦闘の続きで、第二形態に変身する（このターンの残りの行動は打ち切り）
  if (u.d.next) {
    const nd = b.enemyData.enemies[u.d.next];
    b.transformed = true;
    emit(b, { t: 'talk', key: u.d.transformTalk });
    Object.assign(u, { id: u.d.next, d: nd, name: nd.name, hp: nd.hp, maxHp: nd.hp, ailments: [], buffs: {}, history: [], cycle0: b.turn });
    emit(b, { t: 'transform', i: u.index, id: u.id, bgm: nd.bgm });
    return;
  }
  u.ailments.length = 0;
  countKill(b, u);
  emit(b, { t: 'se', name: 'enemy_down' });
  emit(b, { t: 'down', side: 'enemy', i: u.index });
  msg(b, '{t}を やっつけた！', { t: u.name });
}

// 冒険の記録：倒した敵の数（同じ数なら、先にその数に達した敵が「一番多く倒した敵」）
function countKill(b, u) {
  if (u.noReward) return;
  const st = (b.state.stats ??= {});
  st.kills ??= {};
  st.kills[u.id] = (st.kills[u.id] ?? 0) + 1;
  st.totalKills = (st.totalKills ?? 0) + 1;
  if (!st.topKill || st.kills[u.id] > st.topKill.n) st.topKill = { id: u.id, name: u.d.name, n: st.kills[u.id] };
}

function retargetEnemy(b, i) {
  const t = b.enemies[i];
  if (t && alive(t)) return t;
  return pickOne(b, living(b.enemies));
}

function retargetAlly(b, i, { down = false } = {}) {
  const t = b.allies[i];
  if (t && (down ? !alive(t) : alive(t))) return t;
  if (down) return null;
  return pickOne(b, living(b.allies));
}

// 敵の「なかまをかばう」：ほかの敵をねらった単体攻撃を、自分が受ける
function enemyCover(b, t) {
  const c = b.enemies.find((e) => e.coverOthers && alive(e) && e !== t);
  if (!c) return t;
  msg(b, '{c}が {t}を かばった！', { c: c.name, t: t.name });
  return c;
}

// ---- 味方の行動 ----
function allyAction(b, u, c) {
  const m = u.m;
  if (c.type === 'attack') {
    let t = retargetEnemy(b, c.target);
    if (!t) return;
    msg(b, '{a}の 攻撃！', { a: u.name });
    t = enemyCover(b, t);
    hitWith(b, u, [t], { kind: 'physical', power: 1, element: b.items[m.equip.weapon]?.element ?? 'none' });
    return;
  }
  if (c.type === 'item') return useItem(b, u, c);
  const sk = b.skills[c.skill];
  if (!sk) return;
  if (m.mp < sk.mp) {
    msg(b, '{a}は {s}を 使おうとした！', { a: u.name, s: sk.name });
    msg(b, 'しかし MPが 足りない！');
    return;
  }
  m.mp -= sk.mp;
  emit(b, { t: 'mp', i: u.index, amount: -sk.mp });
  const verb = sk.kind === 'physical' ? '{a}の {s}！' : m.job === 'swordsman' ? '{a}は {s}を 使った！' : '{a}は {s}を となえた！';
  msg(b, verb, { a: u.name, s: sk.name });
  if (sk.kind === 'physical' || sk.kind === 'magic') {
    let targets = sk.target === 'enemies' ? living(b.enemies) : [retargetEnemy(b, c.target)].filter(Boolean);
    if (sk.target !== 'enemies' && targets[0]) targets = [enemyCover(b, targets[0])];
    if (sk.kind === 'physical' && sk.element && sk.element !== 'none') emit(b, { t: 'se', name: 'slash' });
    const hit = hitWith(b, u, targets, { kind: sk.kind, power: sk.power, element: sk.element ?? 'none' });
    if (sk.inflict) for (const t of hit) if (alive(t) && inflict(b, t, sk.inflict, 0.5)) sayAilment(b, t, sk.inflict, true);
  } else if (sk.kind === 'status') {
    let t = retargetEnemy(b, c.target);
    if (!t) return;
    t = enemyCover(b, t);
    emit(b, { t: 'se', name: 'poison' });
    sayAilment(b, t, sk.inflict, inflict(b, t, sk.inflict, 0.5));
  } else if (sk.kind === 'support') {
    if (sk.buff) {
      emit(b, { t: 'se', name: 'buff' });
      for (const t of living(b.allies)) t.buffs[sk.buff] = BUFF_TURNS;
      msg(b, BUFF_TEXT[sk.buff]);
    } else if (sk.debuff) {
      const t = retargetEnemy(b, c.target);
      if (!t) return;
      emit(b, { t: 'se', name: 'debuff' });
      t.buffs[sk.debuff] = BUFF_TURNS;
      msg(b, '{t}の 防御力が 下がった！', { t: t.name });
    }
  } else if (sk.kind === 'heal') {
    const effect = sk.revive ? { revive: sk.revive } : sk.cure ? { cure: true } : { hp: healAmount(m, sk, b.items) };
    let targets;
    if (sk.target === 'allies') targets = living(b.allies);
    else if (sk.target === 'ally_down') targets = [retargetAlly(b, c.target, { down: true })].filter(Boolean);
    else targets = [retargetAlly(b, c.target)].filter(Boolean);
    let any = false;
    for (const t of targets) any = recoverOne(b, t, effect) || any;
    if (!any) msg(b, 'しかし 何も起こらなかった！');
  }
}

function recoverOne(b, t, effect) {
  const r = applyRecovery(t.m, effect, b.items);
  if (!r) return false;
  if (r.revived) {
    emit(b, { t: 'se', name: 'revive' });
    emit(b, { t: 'revive', side: 'ally', i: t.index, hp: t.m.hp });
    msg(b, '{t}は 生き返った！', { t: t.name });
    return true;
  }
  if (r.hp || r.mp) emit(b, { t: 'se', name: 'heal' });
  if (r.hp) {
    emit(b, { t: 'heal', side: 'ally', i: t.index, amount: r.hp });
    msg(b, '{t}の HPが {n} 回復した！', { t: t.name, n: r.hp });
  }
  if (r.mp) {
    emit(b, { t: 'mp', i: t.index, amount: r.mp });
    msg(b, '{t}の MPが {n} 回復した！', { t: t.name, n: r.mp });
  }
  if (r.cured) {
    emit(b, { t: 'se', name: 'cure' });
    msg(b, '{t}の 状態異常が 治った！', { t: t.name });
  }
  return true;
}

function useItem(b, u, c) {
  const item = b.items[c.item];
  if (!item) return;
  if (itemCount(b.state, c.item) <= 0) {
    msg(b, '{a}は {i}を 使おうとした！', { a: u.name, i: item.name });
    msg(b, 'しかし {i}は もう なかった！', { i: item.name });
    return;
  }
  removeItem(b.state, c.item, 1);
  msg(b, '{a}は {i}を 使った！', { a: u.name, i: item.name });
  const t = item.target === 'ally_down' ? retargetAlly(b, c.target, { down: true }) : retargetAlly(b, c.target);
  if (!t || !recoverOne(b, t, item.use)) msg(b, 'しかし 何も起こらなかった！');
}

// ---- 敵の行動 ----
function enemyAction(b, e, it) {
  const sk = it.sk;
  // 自分を回復する・強くする、相手を弱くする（裏ボスなどが使う）
  if (sk.kind === 'heal') {
    msg(b, sk.text, { actor: e.name });
    const n = Math.floor(e.maxHp * (sk.power ?? 0.2));
    const before = e.hp;
    setHp(b, e, e.hp + n);
    if (sk.cure) for (const a of ['poison', 'burn']) removeAilment(e, a);
    emit(b, { t: 'se', name: 'heal' });
    emit(b, { t: 'heal', side: 'enemy', i: e.index, amount: e.hp - before });
    msg(b, '{a}の HPが {n} 回復した！', { a: e.name, n: e.hp - before });
    return;
  }
  if (sk.kind === 'buff') {
    msg(b, sk.text, { actor: e.name });
    emit(b, { t: 'se', name: 'buff' });
    e.buffs[sk.buff] = BUFF_TURNS + 1;
    msg(b, sk.buff === 'defUp' ? '{a}の 防御力が 上がった！' : '{a}の 攻撃力が 上がった！', { a: e.name });
    return;
  }
  if (sk.kind === 'debuff') {
    const t = retargetAlly(b, it.targets[0]);
    if (!t) return;
    msg(b, sk.text, { actor: e.name });
    emit(b, { t: 'se', name: 'debuff' });
    t.buffs[sk.debuff] = BUFF_TURNS;
    msg(b, '{t}の 防御力が 下がった！', { t: t.name });
    return;
  }
  const coverer = b.allies.find((a) => a.cover && alive(a));
  let targets;
  if (it.targets === 'all') targets = living(b.allies);
  else {
    let t = retargetAlly(b, it.targets[0]);
    if (coverer && t && t !== coverer && sk.target === 'one') {
      msg(b, sk.text, { actor: e.name });
      msg(b, '{c}が {a}を かばった！', { c: coverer.name, a: t.name });
      return enemyHit(b, e, sk, [coverer], it);
    }
    targets = t ? [t] : [];
  }
  msg(b, sk.text, { actor: e.name });
  enemyHit(b, e, sk, targets, it);
}

function enemyHit(b, e, sk, targets, it) {
  // 状態異常のかかる確率：雑魚の技は30%、ボスの状態異常だけの技は50%、ボスの攻撃つきは30%、「必ず」は100%
  const chance = sk.chance ?? (e.d.boss && sk.kind === 'status' ? 0.5 : 0.3);
  if (sk.kind === 'status') {
    for (const t of targets) sayAilment(b, t, sk.inflict, inflict(b, t, sk.inflict, chance));
    return;
  }
  if (it?.special) emit(b, { t: 'se', name: 'explosion' });
  const hit = hitWith(b, e, targets, { kind: sk.kind, power: sk.power ?? 1, element: sk.element ?? 'none' });
  if (sk.inflict) for (const t of hit) if (alive(t) && inflict(b, t, sk.inflict, chance)) sayAilment(b, t, sk.inflict, true);
  // ばくはつ：使った敵は倒れる（経験値とゴールドはもらえない）
  if (sk.selfDestruct && alive(e)) {
    e.hp = 0;
    e.noReward = true;
    emit(b, { t: 'se', name: 'enemy_down' });
    emit(b, { t: 'down', side: 'enemy', i: e.index });
    msg(b, '{a}は くだけちった！', { a: e.name });
  }
}

// ---- ターンの終わり ----
function endOfTurn(b) {
  for (const u of [...b.allies, ...b.enemies]) {
    if (!alive(u)) continue;
    for (const [a, word] of [['poison', '毒'], ['burn', 'やけど']]) {
      if (!has(u, a) || !alive(u)) continue;
      const n = Math.max(1, Math.floor(maxHp(b, u) / (u.side === 'enemy' && u.d.boss ? 32 : 16)));
      setHp(b, u, hpOf(u) - n);
      emit(b, { t: 'hit', side: u.side, i: u.index, amount: n });
      msg(b, '{t}は {w}の ダメージを {n} 受けた！', { t: u.name, w: word, n });
      if (!alive(u)) knockOut(b, u);
    }
    for (const k of Object.keys(u.buffs)) {
      u.buffs[k]--;
      if (u.buffs[k] <= 0) delete u.buffs[k];
    }
  }
  checkEnd(b);
}

function checkEnd(b) {
  if (b.result) return true;
  // 味方が全員倒れたら、同時に敵がいなくなっても（ばくはつ など）全滅
  if (!living(b.allies).length) b.result = 'lose';
  else if (!living(b.enemies).length) b.result = 'win';
  if (b.result && b.result !== 'lose') endBattleAilments(b);
  return !!b.result;
}

function endBattleAilments(b) {
  for (const a of b.allies) for (const x of BATTLE_ONLY) removeAilment(a, x);
}

// ---- 勝った時：経験値・ゴールド・ドロップ ----
export function finishWin(b) {
  b.events = [];
  const exp = b.enemies.reduce((n, e) => n + (e.noReward ? 0 : e.d.exp), 0);
  const gold = b.enemies.reduce((n, e) => n + (e.noReward ? 0 : Math.floor(e.d.gold[0] + b.rng() * (e.d.gold[1] - e.d.gold[0] + 1))), 0);
  msg(b, b.boss ? '{e}を たおした！' : '魔物たちを やっつけた！', { e: b.enemies[0].name });
  if (exp > 0) msg(b, '{n}ポイントの 経験値を かくとく！', { n: exp });
  if (gold > 0) {
    addGold(b.state, gold);
    msg(b, '{n}ゴールドを 手に入れた！', { n: gold });
  }
  for (const e of b.enemies) {
    if (e.noReward || !e.d.drop || b.rng() >= 0.3) continue;
    const item = b.items[e.d.drop];
    if (addItem(b.state, e.d.drop, 1)) msg(b, '{e}は {i}を 落としていった！', { e: e.name, i: item.name });
  }
  for (const u of b.allies) {
    if (!alive(u)) continue;
    const r = gainExp(u.m, exp, b.items, b.skills);
    for (const lv of r.levels) {
      emit(b, { t: 'se', name: 'levelup' });
      msg(b, '{a}は レベル{n}に 上がった！', { a: u.name, n: lv });
    }
    for (const id of r.learned) msg(b, '{a}は {s}を 覚えた！', { a: u.name, s: b.skills[id].name });
  }
  return b.events;
}

// 全滅：いちばん近い戻り先へ。所持金は半分（切り捨て）、全員HP・MP満タン、状態異常なし
export function applyDefeat(state, items, home) {
  state.gold = Math.floor((state.gold ?? 0) / 2);
  state.stats ??= {};
  state.stats.defeats = (state.stats.defeats ?? 0) + 1;
  for (const m of state.party) {
    const s = totalStats(m, items);
    m.hp = s.hp;
    m.mp = s.mp;
    m.ailments = [];
  }
  Object.assign(state.location, { map: home.map, x: home.x, y: home.y, dir: home.dir ?? 'down' });
}

// 1回の戦闘の敵の組み合わせ（1〜3体。数の出やすさはエリアの groups、なければ 1体35%・2体40%・3体25%）
export function rollEncounter(area, rng = Math.random) {
  const w = area.groups ?? [0.35, 0.4, 0.25];
  let r = rng() * w.reduce((a, b) => a + b, 0);
  let n = 1;
  for (let i = 0; i < w.length; i++) {
    if (r < w[i]) {
      n = i + 1;
      break;
    }
    r -= w[i];
  }
  return Array.from({ length: n }, () => area.enemies[Math.floor(rng() * area.enemies.length)]);
}

// ---- エンカウント（確率方式） ----
// 前の戦闘のあと（マップに入ったあと）しばらくは出ない（grace 歩）。そのあとは1歩ごとに p の確率で出る。
// 平均の歩数は、エリアの steps（[最小, 最大]、なければ [30, 40]）のまん中に合わせる
export function encounterParams(area) {
  const [lo, hi] = area?.steps ?? [30, 40];
  const avg = (lo + hi) / 2;
  const grace = Math.round(avg * 0.3);
  return { grace, p: 1 / (avg - grace) };
}

// 1歩歩いた時に、戦闘になるか（stepsSince：前の戦闘から何歩目か）
export function encounterRoll(area, stepsSince, rng = Math.random) {
  const { grace, p } = encounterParams(area);
  return stepsSince > grace && rng() < p;
}
