// バランス確認ボット（企画書14章）。ゲームの戦闘・成長・お金のルール（src/core）をそのまま使い、
// 最初から魔王までを、画面なしで何度も自動で遊ばせて、結果を表とCSVで出す
import { applyDefeat, createBattle, elementRate, encounterRoll, finishWin, mustSkipInput, planEnemies, resolveTurn, rollEncounter, startTurnEvents, alive } from '../src/core/battle.js';
import { addItem, applyRecovery, canEquip, createMember, fullRecover, healAmount, isDown, itemCount, learnedSkills, removeItem, sellPrice, slotOf, totalStats, partnerOf } from '../src/core/party.js';
import { createNewGame } from '../src/core/state.js';
import { createRng } from '../src/core/rng.js';
import { canWalk, findStart, parseTiledMap } from '../src/core/map.js';

const json = (p) => fetch(p).then((r) => r.json());
const [items, skills, enemyData, shops] = await Promise.all(['../data/items.json', '../data/skills.json', '../data/enemies.json', '../data/shops.json'].map(json));
// 裏ボスの作戦の表（まだ学習していなければ無し）
enemyData.brains = { shadow: await fetch('../data/brains/shadow.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) };

// ---- 道のり（効率よく進んだ時の順番）。walk：[マップ, 出発, 到着]（'start' はそのマップの始まり） ----
const CHAPTERS = [
  {
    name: '水の王', boss: ['boss_water'], area: 'lake', target: 6,
    before: [{ walk: ['field_town', [18, 13], [39, 13]] }, { townTrip: true }, { walk: ['field_water', [1, 13], [18, 15]] }, { shop: 'water' }, { inn: true }],
    dungeon: [{ walk: ['field_water', [18, 16], [14, 2]] }, { walk: ['lake_cave_1', 'start', [23, 16]] }],
    chests: ['bluelake', 'wake_pendant'],
  },
  {
    name: '風の王', boss: ['boss_wind'], area: 'tower', target: 10,
    before: [{ walk: ['field_water', [18, 16], [34, 1]] }, { walk: ['field_wind', [32, 25], [30, 12]] }, { join: 'partner' }, { shop: 'wind' }, { inn: true }],
    dungeon: [{ walk: ['field_wind', [30, 13], [8, 8]] }, { walk: ['wind_tower_1', 'start', [17, 25]] }, { walk: ['wind_tower_2', 'start', [17, 7]] }],
    chests: ['calm_charm', 'tempest_rod'],
  },
  {
    name: '炎の王', boss: ['boss_fire'], area: 'volcano', target: 15,
    before: [{ walk: ['field_wind', [30, 13], [7, 26]] }, { walk: ['field_fire', [19, 1], [18, 12]] }, { inn: true, free: true }, { shop: 'fire' }],
    dungeon: [{ walk: ['field_fire', [18, 13], [18, 22]] }, { walk: ['volcano_1', 'start', [2, 16]] }, { walk: ['volcano_2', 'start', [23, 22]] }],
    chests: ['flame_helm', 'frost_ring'],
  },
  {
    name: '雷の王', boss: ['boss_thunder'], area: 'storm', target: 20,
    before: [{ walk: ['field_fire', [18, 13], [38, 21]] }, { walk: ['field_thunder', [1, 21], [7, 12]] }, { shop: 'thunder' }, { inn: true }],
    dungeon: [{ walk: ['field_thunder', [7, 13], [30, 13]] }, { walk: ['storm_castle_1', 'start', [5, 4]] }, { walk: ['storm_castle_2', 'start', [17, 13]] }, { walk: ['storm_castle_3', 'start', [2, 25]] }],
    chests: ['bolt_bangle', 'lightning_edge'],
    after: [{ light: true }],
  },
  {
    name: '魔王', boss: ['demon1'], area: 'demon', target: 27,
    before: [{ walk: ['field_thunder', [30, 14], [7, 13]] }, { shop: 'thunder' }, { inn: true }],
    dungeon: [{ walk: ['field_thunder', [7, 13], [38, 13]] }, { walk: ['field_demon', [1, 13], [30, 13]] }, { walk: ['demon_castle_1', 'start', [2, 25]] }, { walk: ['demon_castle_2', 'start', [17, 13]] }, { walk: ['demon_castle_3', 'start', [14, 4]] }],
    chests: ['saint_rod'],
  },
];

// ---- 遊び方 ----
export const STRATEGIES = {
  random: { label: 'でたらめ押し', walk: 1.3, ai: 'random' },
  attack: { label: 'たたかう連打', walk: 1.3, ai: 'attack' },
  efficient: { label: '効率プレイ', walk: 1.3, ai: 'smart', chests: true },
  shortest: { label: '最短プレイ', walk: 1.0, ai: 'smart', noTownTrip: true },
  thorough: { label: 'じっくり', walk: 1.3, fieldWalk: 3.5, ai: 'smart', chests: true },
  items: { label: '道具を多く使う', walk: 1.3, ai: 'smart', chests: true, potionRate: 0.25, healAt: 0.6 },
  noitems: { label: '道具を使わない', walk: 1.3, ai: 'smart', chests: true, noItems: true },
  escape: { label: '逃げまくり', walk: 1.0, ai: 'smart', escape: true },
};
const HEROES = [
  { gender: 'male', job: 'swordsman', label: '男・剣士' },
  { gender: 'male', job: 'mage', label: '男・魔法' },
  { gender: 'female', job: 'swordsman', label: '女・剣士' },
  { gender: 'female', job: 'mage', label: '女・魔法' },
];
// 時間の換算（仮）：1歩0.27秒、戦闘1回は前後で8秒＋行動1回2.5秒、町・会話・イベントは合わせて25分
const SEC_STEP = 0.27, SEC_BATTLE = 8, SEC_ACT = 2.5, SEC_STORY = 25 * 60;

// ---- マップの道のり（最短の歩数）を、ゲームと同じ「歩けるか」で調べる ----
const MAPS = {};
async function loadMap(id) {
  if (!MAPS[id]) MAPS[id] = parseTiledMap(await json(`../data/maps/${id}.json`), id);
  return MAPS[id];
}
const pathCache = {};
async function pathOf(id, from, to) {
  const key = `${id}:${from}:${to}`;
  if (pathCache[key]) return pathCache[key];
  const map = await loadMap(id);
  const s = from === 'start' ? findStart(map) : { x: from[0], y: from[1] };
  const isOn = (o) => o.type !== 'block' && o.type !== 'npc';
  const W = map.width;
  const prev = new Map([[s.y * W + s.x, -1]]);
  const q = [s.y * W + s.x];
  const goal = to[1] * W + to[0];
  while (q.length) {
    const c = q.shift();
    if (c === goal) break;
    const x = c % W, y = Math.floor(c / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (prev.has(k) || !canWalk(map, nx, ny, isOn)) continue;
      prev.set(k, c);
      q.push(k);
    }
  }
  if (!prev.has(goal)) throw new Error(`道がない：${key}`);
  const tiles = [];
  for (let c = goal; c !== -1; c = prev.get(c)) tiles.push({ x: c % W, y: Math.floor(c / W) });
  tiles.reverse();
  const saves = map.objects.filter((o) => o.type === 'savepoint');
  const steps = tiles.slice(1).map((t) => !saves.some((o) => Math.abs(o.x - t.x) <= 3 && Math.abs(o.y - t.y) <= 3));
  return (pathCache[key] = { area: map.props.area || null, steps });
}

const mean = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : NaN);

// ---- 1回分の冒険 ----
export class Sim {
  constructor(hero, strat, seed) {
    this.rng = createRng(seed);
    this.r = () => this.rng.next();
    this.strat = strat;
    this.st = createNewGame({ gender: hero.gender, job: hero.job }, items);
    this.st.party.push(createMember({ id: 'luke', job: 'priest', level: 1, equip: { weapon: 'wood_staff', armor: 'travel_clothes' } }, items));
    this.log = { steps: 0, battles: 0, zakoTurns: [], acts: 0, escapes: 0, itemsUsed: 0, defeats: 0, bosses: [], stuck: false, areaBattles: {} };
  }

  get party() {
    return this.st.party;
  }
  stats(m) {
    return totalStats(m, items);
  }

  // ---- 歩く（エンカウントあり） ----
  async walk([id, from, to]) {
    const p = await pathOf(id, from, to);
    // じっくり：村の近く（フィールド）で多めに戦う
    const factor = id.startsWith('field_') && this.strat.fieldWalk ? this.strat.fieldWalk : this.strat.walk;
    const extra = Math.round(p.steps.length * (factor - 1));
    const loops = Math.floor(extra / Math.max(1, p.steps.length));
    const more = [];
    for (let i = 0; i < loops; i++) more.push(...p.steps);
    more.push(...p.steps.slice(0, extra - loops * p.steps.length));
    const steps = [...p.steps, ...more];
    // エンカウントは、ゲームと同じ確率方式（encounterRoll）
    let since = 0;
    for (const ok of steps) {
      this.log.steps++;
      if (!p.area || !ok) continue;
      since++;
      if (!encounterRoll(enemyData.areas[p.area], since, this.r)) continue;
      since = 0;
      this.log.areaBattles[p.area] = (this.log.areaBattles[p.area] ?? 0) + 1;
      const r = this.battle(rollEncounter(enemyData.areas[p.area], this.r), p.area, false);
      if (r === 'lose') return 'lose';
      this.fieldCare();
      // 弱ってきたら、帰りの薬で村に戻る（賢い遊び方だけ）
      if (this.strat.ai === 'smart' && this.danger() && itemCount(this.st, 'warp_potion')) {
        removeItem(this.st, 'warp_potion');
        this.log.itemsUsed++;
        return 'retreat';
      }
    }
    return 'ok';
  }

  // 戦闘のあと：回復の呪文と道具で立て直す
  fieldCare() {
    const knows = (m, id) => learnedSkills(m, skills).includes(id);
    for (const t of this.party) {
      if (!isDown(t)) continue;
      const h = this.party.find((m) => !isDown(m) && knows(m, 'resurrection') && m.mp >= 60);
      if (h) {
        h.mp -= 60;
        applyRecovery(t, { revive: 0.5 }, items);
      } else if (!this.strat.noItems && itemCount(this.st, 'revive_potion')) {
        removeItem(this.st, 'revive_potion');
        this.log.itemsUsed++;
        applyRecovery(t, { revive: 0.5 }, items);
      }
    }
    const healer = this.party.find((m) => m.id === 'luke');
    if (!this.strat.noItems && healer && !isDown(healer) && healer.mp < this.stats(healer).mp * 0.3 && itemCount(this.st, 'mana_potion')) {
      removeItem(this.st, 'mana_potion');
      this.log.itemsUsed++;
      applyRecovery(healer, items.mana_potion.use, items);
    }
    for (let n = 0; n < 30; n++) {
      const low = this.party.filter((m) => !isDown(m) && m.hp < this.stats(m).hp * 0.7).sort((a, b) => a.hp / this.stats(a).hp - b.hp / this.stats(b).hp)[0];
      if (!low) break;
      const h = this.party.find((m) => !isDown(m) && knows(m, 'heal') && m.mp > this.stats(m).mp * 0.25);
      const sid = h && ['high_heal', 'heal'].find((id) => knows(h, id) && h.mp >= skills[id].mp);
      if (sid) {
        h.mp -= skills[sid].mp;
        applyRecovery(low, { hp: healAmount(h, skills[sid], items) }, items);
        continue;
      }
      if (this.strat.noItems || low.hp > this.stats(low).hp * 0.4) break;
      const pot = ['potion_l', 'potion_m', 'potion_s'].find((id) => itemCount(this.st, id));
      if (!pot) break;
      removeItem(this.st, pot);
      this.log.itemsUsed++;
      applyRecovery(low, items[pot].use, items);
    }
  }

  // ---- 戦闘 ----
  battle(enemyIds, area, boss) {
    const b = createBattle({ state: this.st, items, skills, enemyData, area, enemyIds, rng: this.r, boss, think: this.think ?? null });
    const rec = { turns: 0, dmg: [] };
    rec.hpAvg = mean(this.party.map((m) => this.stats(m).hp));
    let form2 = null;
    while (!b.result && rec.turns < 300) {
      planEnemies(b);
      if (!globalThis.noPanic) startTurnEvents(b); // ルークのビビり覚醒（noPanic = true で、なしと比べられる）
      const cmds = b.allies.map((u, i) => this.command(b, u, i, boss));
      for (const c of cmds) if (c?.type === 'item') this.log.itemsUsed++;
      const evs = resolveTurn(b, cmds);
      rec.turns++;
      this.log.acts += b.allies.filter(alive).length + b.enemies.filter(alive).length;
      const dmg = evs.filter((e) => e.t === 'hit' && e.side === 'ally').reduce((n, e) => n + e.amount, 0);
      if (form2) {
        form2.turns++;
        form2.dmg.push(dmg);
      } else rec.dmg.push(dmg);
      if (evs.some((e) => e.t === 'transform')) form2 = { turns: 0, dmg: [] };
    }
    this.log.battles++;
    if (!boss) this.log.zakoTurns.push(rec.turns);
    if (b.result === 'win') finishWin(b);
    if (b.result === 'escape') this.log.escapes++;
    if (b.result === 'lose' || !b.result) {
      this.log.defeats++;
      applyDefeat(this.st, items, { map: 'x', x: 0, y: 0 });
    }
    this.lastBattle = { rec, form2, result: b.result ?? 'lose', timeout: !b.result };
    return b.result ?? 'lose';
  }

  // コマンドを決める
  command(b, u, i, boss) {
    if (!alive(u) || mustSkipInput(u)) return { type: 'none' };
    const m = u.m;
    const known = learnedSkills(m, skills).filter((id) => u.panic || skills[id].mp <= m.mp); // ビビり覚醒のターンは、MPを使わない
    const foes = b.enemies.filter(alive);
    const ai = this.strat.ai;
    if (ai === 'random') {
      const r = this.r();
      if (r < 0.15) return { type: 'guard' };
      if (r < 0.2) return { type: 'escape' };
      if (r < 0.5 && known.length) return { type: 'skill', skill: this.rng.pick(known), target: this.rng.int(0, Math.max(b.enemies.length, b.allies.length) - 1) };
      const bag = Object.keys(this.st.bag ?? {}).filter((id) => items[id]?.use && !items[id].use.warp);
      if (r < 0.6 && bag.length) return { type: 'item', item: this.rng.pick(bag), target: this.rng.int(0, b.allies.length - 1) };
      return { type: 'attack', target: this.rng.int(0, b.enemies.length - 1) };
    }
    if (ai === 'attack') return { type: 'attack', target: foes[0].index };
    if (!boss && this.strat.escape) return { type: 'escape' };

    // 賢い遊び方：倒れた仲間を起こす → 回復 → 必殺技の前は身を守る → いちばん効く攻撃
    const S = (mm) => this.stats(mm);
    const ratio = (a) => a.m.hp / S(a.m).hp;
    const down = b.allies.filter((a) => !alive(a));
    const lows = b.allies.filter((a) => alive(a) && ratio(a) < (this.strat.healAt ?? 0.45)).sort((x, y) => ratio(x) - ratio(y));
    const special = b.intents.some((l) => l?.some((it) => it.special));
    if (down.length && known.includes('resurrection')) return { type: 'skill', skill: 'resurrection', target: down[0].index };
    if (down.length && !this.strat.noItems && itemCount(this.st, 'revive_potion') && (boss || m.job === 'priest')) return { type: 'item', item: 'revive_potion', target: down[0].index };
    // 眠り・混乱・麻痺・毒の仲間を治す（キュア、なければ毒消しの薬）
    const sick = b.allies.filter((a) => alive(a) && a !== u && a.m.ailments.some((x) => ['confusion', 'sleep', 'paralysis'].includes(x)));
    if (sick.length) {
      if (known.includes('cure')) return { type: 'skill', skill: 'cure', target: sick[0].index };
      if (!this.strat.noItems && itemCount(this.st, 'cure_potion') && boss) return { type: 'item', item: 'cure_potion', target: sick[0].index };
    }
    if (lows.length) {
      if (known.includes('heal_all') && lows.length >= 2) return { type: 'skill', skill: 'heal_all' };
      for (const id of ['high_heal', 'heal']) if (known.includes(id)) return { type: 'skill', skill: id, target: lows[0].index };
      if (!this.strat.noItems && (lows[0] === u || m.job !== 'swordsman' || boss)) {
        const pot = ['potion_l', 'potion_m', 'potion_s'].find((id) => itemCount(this.st, id));
        if (pot && ratio(lows[0]) < 0.35) return { type: 'item', item: pot, target: lows[0].index };
      }
    }
    if (boss && special && ratio(u) < 0.5) return { type: 'guard' };
    // 大技が来る時はよく身を守る遊び方
    if (boss && this.strat.guardBig && ratio(u) < 0.8 && b.intents.some((l) => l?.some((it) => it.special || (it.sk?.power ?? 0) >= 1.5 || it.targets === 'all'))) return { type: 'guard' };
    // ボス戦で、魔法を使う人のMPが切れかけたら魔法の水
    if (boss && m.job !== 'swordsman' && m.mp < 12 && !this.strat.noItems && itemCount(this.st, 'mana_potion')) return { type: 'item', item: 'mana_potion', target: i };
    // 雑魚戦で、仲間全員の攻撃がほとんど効かない（ウツロにMP切れ など）時は逃げる
    if (!boss && b.turn >= 1) {
      const power = b.allies.filter(alive).reduce((n, a) => n + this.bestDamage(b, a), 0);
      if (power < foes.reduce((n, t) => n + t.hp, 0) * 0.15) return { type: 'escape' };
    }
    const weapon = items[m.equip.weapon];
    const atkSpec = { kind: 'physical', power: 1, element: weapon?.element ?? 'none' };
    let best = { type: 'attack', target: foes[0].index };
    let bestV = 0;
    for (const t of foes) {
      const v = Math.min(t.hp, this.estimate(u, t, atkSpec));
      if (v > bestV) {
        bestV = v;
        best = { type: 'attack', target: t.index };
      }
    }
    // 雑魚戦では、回復役はMPを攻撃に使わない。ほかの人もMPが3割を切ったら節約する
    const thrifty = !boss && (m.job === 'priest' || m.mp < S(m).mp * 0.3);
    for (const id of known) {
      const sk = skills[id];
      if (thrifty && sk.mp > 0) continue;
      if (id === 'power_up' && boss && !b.allies.some((a) => a.buffs.atkUp) && foes[0].hp > bestV * 4) {
        bestV = bestV * 1.3;
        best = { type: 'skill', skill: id };
        continue;
      }
      if (sk.kind !== 'physical' && sk.kind !== 'magic') continue;
      const list = sk.target === 'enemies' ? [foes] : foes.map((t) => [t]);
      for (const ts of list) {
        let v = ts.reduce((n, t) => n + Math.min(t.hp, this.estimate(u, t, sk)), 0);
        if (!boss) v -= sk.mp * 0.8;
        if (!boss && sk.target === 'enemies' && ts.length < 2) continue;
        if (v > bestV) {
          bestV = v;
          best = { type: 'skill', skill: id, target: ts[0].index };
        }
      }
    }
    return best;
  }

  // このまま進むと危ない：HPが平均4割未満、だれかが倒れている、回復役のMPがほとんどない
  danger() {
    const hp = mean(this.party.map((m) => m.hp / this.stats(m).hp));
    const healer = this.party.find((m) => m.id === 'luke');
    const mp = healer.mp / this.stats(healer).mp;
    const pots = ['potion_s', 'potion_m', 'potion_l'].reduce((n, id) => n + itemCount(this.st, id), 0);
    const downs = this.party.filter(isDown).length;
    return hp < 0.35 || downs >= 2 || isDown(this.party[0]) || (mp < 0.12 && (hp < 0.75 || pots < 2));
  }

  // ボスに挑めるか：全員のHPが6割以上、MPが4割以上残っている
  ready() {
    const hp = mean(this.party.map((m) => m.hp / this.stats(m).hp));
    const mp = this.party.reduce((n, m) => n + m.mp, 0) / this.party.reduce((n, m) => n + this.stats(m).mp, 0);
    return hp >= 0.6 && mp >= 0.4 && !this.party.some(isDown);
  }

  // その人が1回で与えられる、いちばん大きいダメージ（MPが足りる技だけ）
  bestDamage(b, u) {
    const m = u.m;
    const foes = b.enemies.filter(alive);
    const specs = [{ kind: 'physical', power: 1, element: items[m.equip.weapon]?.element ?? 'none' }, ...learnedSkills(m, skills).map((id) => skills[id]).filter((sk) => (sk.kind === 'physical' || sk.kind === 'magic') && sk.mp <= m.mp)];
    let best = 0;
    for (const sk of specs) for (const t of foes) best = Math.max(best, Math.min(t.hp, this.estimate(u, t, sk)));
    return best;
  }

  estimate(u, t, sk) {
    const s = this.stats(u.m);
    const a = sk.kind === 'magic' ? s.mat : s.atk * (u.buffs.atkUp ? 1.5 : 1);
    if (sk.kind === 'physical' && t.d.physImmune) return 0;
    return ((a * 100) / (100 + t.d.def * (t.buffs.defDown ? 0.7 : 1))) * (sk.power ?? 1) * elementRate(sk.element ?? 'none', t.d.element);
  }

  // ---- 町 ----
  inn(free) {
    if (!free) {
      if (this.st.gold < 50) return;
      this.st.gold -= 50;
    }
    fullRecover(this.st, items);
  }

  score(m, it) {
    if (!it) return 0;
    const caster = m.job !== 'swordsman';
    return (it.atk ?? 0) * (caster ? 0.3 : 1) + (it.mat ?? 0) * (caster ? 1 : 0) + (it.def ?? 0) * 0.9 + (it.spd ?? 0) * 0.3 + (it.hp ?? 0) * 0.4 + (it.element && it.element !== 'none' ? 2 : 0);
  }

  // 今より良ければ替える（buy の時は、古い物を売ってお金を払う）
  equipBest(m, id, buy) {
    const it = items[id];
    if (!canEquip(it, m.job)) return false;
    const slot = slotOf(it);
    const cur = items[m.equip[slot]];
    if (this.score(m, it) <= this.score(m, cur) + 0.5) return false;
    if (buy) {
      const back = cur ? sellPrice(cur) ?? 0 : 0;
      if (this.st.gold + back < it.price) return false;
      this.st.gold += back - it.price;
    }
    const before = this.stats(m);
    m.equip[slot] = id;
    const after = this.stats(m);
    if (after.hp > before.hp) m.hp += after.hp - before.hp;
    return true;
  }

  shop(town) {
    const stock = shops[`${town}_weapon`]?.stock ?? [];
    const keep = this.strat.noItems ? 0 : Math.floor(this.st.gold * (this.strat.potionRate ?? 0.2));
    this.st.gold -= keep;
    // 「良くなる量 ÷ 値段の平方根」がいちばん大きい物から買う（武器・主人公を少し優先）
    for (let n = 0; n < 30; n++) {
      let best = null;
      for (const m of this.party) {
        for (const id of stock) {
          const it = items[id];
          if (!canEquip(it, m.job)) continue;
          const slot = slotOf(it);
          const cur = items[m.equip[slot]];
          const gain = this.score(m, it) - this.score(m, cur);
          const cost = it.price - (cur ? sellPrice(cur) ?? 0 : 0);
          if (gain <= 0.5 || cost > this.st.gold) continue;
          const v = (gain * (slot === 'weapon' ? 1.3 : 1) * (m.id === 'hero' ? 1.1 : 1)) / Math.sqrt(Math.max(50, cost));
          if (!best || v > best.v) best = { m, id, v };
        }
      }
      if (!best) break;
      this.equipBest(best.m, best.id, true);
    }
    this.st.gold += keep;
    if (this.strat.noItems) return;
    const istock = shops[`${town}_item`]?.stock ?? [];
    let spend = keep;
    if (istock.includes('revive_potion') && spend >= 600 && itemCount(this.st, 'revive_potion') < 2) {
      addItem(this.st, 'revive_potion', 1);
      this.st.gold -= 300;
      spend -= 300;
    }
    const buy = (id, upto) => {
      while (istock.includes(id) && this.st.gold >= items[id].price && itemCount(this.st, id) < upto) {
        addItem(this.st, id, 1);
        this.st.gold -= items[id].price;
        spend -= items[id].price;
      }
    };
    buy('warp_potion', 2);
    const pot = ['potion_l', 'potion_m', 'potion_s'].find((id) => istock.includes(id) && items[id].price * 4 <= spend) ?? 'potion_s';
    const many = this.strat.potionRate ? 20 : 8;
    while (spend >= items[pot].price && itemCount(this.st, pot) < many) {
      addItem(this.st, pot, 1);
      this.st.gold -= items[pot].price;
      spend -= items[pot].price;
    }
    if (spend >= items.mana_potion.price * 2) buy('mana_potion', Math.min(10, 3 + Math.floor(this.st.gold / 2000)));
  }

  chest(id) {
    const got = id === 'bluelake' ? (this.st.player.job === 'mage' ? 'bluelake_rod' : 'bluelake_sword') : id;
    for (const m of this.party) if (this.equipBest(m, got, false)) return;
  }

  async step(s) {
    if (s.walk) return this.walk(s.walk);
    if (s.townTrip) {
      if (this.strat.noTownTrip) return 'ok';
      await this.walk(['field_town', [39, 13], [18, 13]]);
      this.shop('town');
      this.inn();
      return this.walk(['field_town', [18, 13], [39, 13]]);
    }
    if (s.shop) this.shop(s.shop);
    if (s.inn) this.inn(s.free);
    if (s.join) {
      const p = partnerOf(this.st);
      const equip = p.job === 'mage' ? { weapon: 'sage_staff', armor: 'magic_robe', helm: 'iron_helm' } : { weapon: 'knight_sword', armor: 'iron_armor', shield: 'iron_shield', helm: 'iron_helm' };
      const m = createMember({ id: 'partner', job: p.job, level: 7, equip }, items);
      m.extraSkills = [p.job === 'mage' ? 'lightning_bolt' : 'lightning_slash'];
      this.party.push(m);
    }
    if (s.light) {
      const hero = this.party[0];
      hero.extraSkills = [...(hero.extraSkills ?? []), hero.job === 'mage' ? 'holy' : 'holy_slash'];
      // 師匠の形見：レオ／リナが、師匠の奥義の弟子版を受け継ぐ
      const partner = this.party.find((m) => m.id === 'partner');
      if (partner && !globalThis.noHeir) partner.extraSkills = [...(partner.extraSkills ?? []), partner.job === 'mage' ? 'heir_spell' : 'heir_slash'];
    }
    return 'ok';
  }

  async run() {
    for (const ch of CHAPTERS) {
      for (const s of ch.before) await this.step(s);
      this.midRetreats = 0;
      for (let tries = 1; ; tries++) {
        let lost = false;
        for (const s of ch.dungeon) {
          const r = await this.step(s);
          if (r === 'retreat') {
            lost = 'retreat';
            break;
          }
          if (r === 'lose') {
            lost = true;
            break;
          }
        }
        if (!lost && tries === 1 && this.strat.chests) for (const c of ch.chests) this.chest(c);
        // ボスの前で弱っていたら、村に戻って休み、買い物をしてから出直す（賢い遊び方だけ。2回まで）
        if (!lost && this.strat.ai === 'smart' && (this.retreats ?? 0) < 2 && !this.ready()) {
          this.retreats = (this.retreats ?? 0) + 1;
          this.log.retreats = (this.log.retreats ?? 0) + 1;
          this.shop(ch.before.find((s) => s.shop)?.shop ?? 'town');
          this.inn();
          tries--;
          continue;
        }
        this.retreats = 0;
        if (!lost) {
          const totalMp = this.party.reduce((n, m) => n + this.stats(m).mp, 0);
          const at = { name: ch.name, level: this.party[0].level, levels: this.party.map((m) => m.level).join('/'), gold: this.st.gold, mp: Math.round((100 * this.party.reduce((n, m) => n + m.mp, 0)) / totalMp), items: this.log.itemsUsed, target: ch.target };
          const r = this.battle(ch.boss, ch.area, true);
          const lb = this.lastBattle;
          this.log.bosses.push({ ...at, try: tries, win: r === 'win', turns: lb.rec.dmg.length, dmgPct: Math.round((100 * mean(lb.rec.dmg)) / lb.rec.hpAvg), turns2: lb.form2?.turns ?? null, dmgPct2: lb.form2 ? Math.round((100 * mean(lb.form2.dmg)) / lb.rec.hpAvg) : null });
          if (r === 'win') break;
        }
        if (lost === 'retreat') {
          this.log.retreats = (this.log.retreats ?? 0) + 1;
          this.shop(ch.before.find((s) => s.shop)?.shop ?? 'town');
          this.inn();
          tries--;
          if (++this.midRetreats > 12) {
            this.log.stuck = ch.name + '(出直し続き)';
            return this.finish();
          }
          continue;
        }
        // 全滅：町に戻って立て直す（宿屋・買い物）してから、もう一度
        if (tries >= 8) {
          this.log.stuck = ch.name;
          return this.finish();
        }
        this.shop(ch.before.find((s) => s.shop)?.shop ?? 'town');
        this.inn(true);
      }
      for (const s of ch.after ?? []) await this.step(s);
      this.inn(true);
    }
    return this.finish();
  }

  finish() {
    this.log.final = this.party.map((m) => m.level).join('/');
    this.log.gold = this.st.gold;
    this.log.time = SEC_STORY + this.log.steps * SEC_STEP + this.log.battles * SEC_BATTLE + this.log.acts * SEC_ACT;
    return this.log;
  }
}

// ---- まとめて実行して表にする ----
const $ = (s) => document.querySelector(s);
const fmt = (n, d = 1) => (n == null || Number.isNaN(n) ? '-' : Number(n).toFixed(d));

export async function runAll(runs, only) {
  const rows = [];
  const csv = ['遊び方,主人公,シード,ボス,挑戦,勝ち,主人公Lv,全員Lv,目安Lv,ターン,被ダメ%,第二形態ターン,第二形態被ダメ%,所持金,残りMP%,使った道具,雑魚戦ターン平均,戦闘回数,全滅,時間(分),詰まり'];
  for (const [key, strat] of Object.entries(STRATEGIES)) {
    if (only && !only.includes(key)) continue;
    for (const hero of HEROES) {
      const logs = [];
      for (let i = 0; i < runs; i++) {
        $('#status').textContent = `${strat.label} ${hero.label} ${i + 1}/${runs}`;
        const sim = new Sim(hero, strat, 1000 + i);
        let log;
        try {
          log = await sim.run();
        } catch (e) {
          log = { ...sim.log, error: String(e) };
          console.error(e);
        }
        logs.push(log);
        for (const bo of log.bosses) csv.push([strat.label, hero.label, 1000 + i, bo.name, bo.try, bo.win ? 1 : 0, bo.level, bo.levels, bo.target, bo.turns, bo.dmgPct, bo.turns2 ?? '', bo.dmgPct2 ?? '', bo.gold, bo.mp, bo.items, fmt(mean(log.zakoTurns), 2), log.battles, log.defeats, fmt((log.time ?? 0) / 60, 0), log.stuck || log.error || ''].join(','));
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
      }
      rows.push({ key, strat: strat.label, hero: hero.label, logs });
    }
  }
  render(rows);
  $('#csv').value = csv.join('\n');
  $('#status').textContent = '終わり';
  window.botResult = rows;
  return rows;
}

// 結果を短くまとめる（表にも、開発中の確認にも使う）
export function summarize(rows) {
  return rows.map((r) => {
    const out = {
      strat: r.strat,
      hero: r.hero,
      clear: r.logs.filter((l) => !l.stuck && !l.error).length / r.logs.length,
      defeats: mean(r.logs.map((l) => l.defeats)),
      zako: mean(r.logs.flatMap((l) => l.zakoTurns)),
      battles: mean(r.logs.map((l) => l.battles)),
      minutes: mean(r.logs.filter((l) => l.time).map((l) => l.time / 60)),
      stuck: [...new Set(r.logs.map((l) => l.stuck || l.error).filter(Boolean))].join(' '),
      final: r.logs[0].final,
      bosses: [],
    };
    for (const name of CHAPTERS.map((c) => c.name)) {
      const first = r.logs.map((l) => l.bosses.find((b) => b.name === name && b.try === 1)).filter(Boolean);
      if (!first.length) continue;
      const won = first.filter((b) => b.win);
      out.bosses.push({
        name,
        target: first[0].target,
        level: mean(first.map((b) => b.level)),
        levels: first[0].levels,
        win: won.length / first.length,
        turns: mean(won.map((b) => b.turns)),
        dmg: mean(first.map((b) => b.dmgPct)),
        turns2: mean(won.map((b) => b.turns2).filter((x) => x != null)),
        dmg2: mean(first.map((b) => b.dmgPct2).filter((x) => x != null)),
        gold: mean(first.map((b) => b.gold)),
        mp: mean(first.map((b) => b.mp)),
      });
    }
    return out;
  });
}

function render(rows) {
  const sum = summarize(rows);
  let h = '<h2>全体</h2><table><tr><th class="l">遊び方</th><th class="l">主人公</th><th>クリア率</th><th>全滅（平均）</th><th>雑魚戦ターン</th><th>戦闘回数</th><th>最終Lv</th><th>時間（分）</th><th>詰まり</th></tr>';
  for (const s of sum) {
    h += `<tr><td class="l">${s.strat}</td><td class="l">${s.hero}</td><td class="${s.clear < 1 ? 'ng' : 'ok'}">${fmt(s.clear * 100, 0)}%</td><td>${fmt(s.defeats)}</td><td class="${s.zako > 2 || s.zako < 1.1 ? 'ng' : 'ok'}">${fmt(s.zako, 2)}</td><td>${fmt(s.battles, 0)}</td><td class="l">${s.final ?? '-'}</td><td>${fmt(s.minutes, 0)}</td><td class="l">${s.stuck}</td></tr>`;
  }
  h += '</table><h2>ボス（1回目の挑戦）</h2><table><tr><th class="l">遊び方</th><th class="l">主人公</th><th class="l">ボス</th><th>主人公Lv（目安）</th><th>勝率</th><th>ターン</th><th>被ダメ%</th><th>第二形態ターン</th><th>被ダメ%</th><th>所持金</th><th>残りMP%</th></tr>';
  for (const s of sum) {
    for (const b of s.bosses) {
      h += `<tr><td class="l">${s.strat}</td><td class="l">${s.hero}</td><td class="l">${b.name}</td><td class="${b.level < b.target - 2 || b.level > b.target ? 'ng' : 'ok'}">${fmt(b.level)}（${b.target}）</td><td>${fmt(b.win * 100, 0)}%</td><td class="${b.turns >= 6 && b.turns <= 8 ? 'ok' : 'ng'}">${fmt(b.turns)}</td><td>${fmt(b.dmg, 0)}</td><td>${fmt(b.turns2)}</td><td>${fmt(b.dmg2, 0)}</td><td>${fmt(b.gold, 0)}</td><td>${fmt(b.mp, 0)}</td></tr>`;
    }
  }
  $('#out').innerHTML = h + '</table>';
}

// ゲームの画面（通常プレイボット）から読み込んだ時は、この表のページの部分は動かさない
const ON_PAGE = !!document.querySelector('#go');
if (ON_PAGE) $('#go').addEventListener('click', () => runAll(Number($('#runs').value) || 10));
Object.assign(window, { runAll, summarize, Sim, STRATEGIES, HEROES, enemyData, items, skills });
if (ON_PAGE) $('#status').textContent = '準備できました';

// ---- 調整用の道具（開発者ツールのコンソールから使う） ----
// tune({ areas: { lake: { exp: 15 } }, enemies: { boss_water: { hp: 300 } } })：数値をその場で変えて試す
window.tune = (t) => {
  for (const [area, v] of Object.entries(t.areas ?? {})) for (const id of enemyData.areas[area].enemies) Object.assign(enemyData.enemies[id], v);
  for (const [id, v] of Object.entries(t.enemies ?? {})) Object.assign(enemyData.enemies[id], v);
};
// show(rows)：結果を文字で短く
window.show = (rows) =>
  summarize(rows)
    .map((s) => `${s.strat} ${s.hero} クリア${Math.round(s.clear * 100)}% 全滅${s.defeats.toFixed(1)} 雑魚${s.zako.toFixed(2)}T 戦闘${Math.round(s.battles)} ${Math.round(s.minutes)}分 ${s.stuck}\n` + s.bosses.map((b) => `   ${b.name} Lv${b.level.toFixed(1)}(${b.target}) ${b.levels} 勝${Math.round(b.win * 100)}% ${b.turns.toFixed(1)}T 被${Math.round(b.dmg)}% 二${Number.isNaN(b.turns2) ? '-' : b.turns2.toFixed(1)}T 被${Number.isNaN(b.dmg2) ? '-' : Math.round(b.dmg2)}% ${Math.round(b.gold)}G MP${Math.round(b.mp)}%`).join('\n'))
    .join('\n');
// trace(主人公の番号, 遊び方, ボス何体目まで)：1回分を、買い物とボス戦の様子つきで
window.trace = async (hi, strat, stopAt = 9) => {
  const sim = new Sim(HEROES[hi], STRATEGIES[strat], 1000);
  const out = [];
  const battle = sim.battle.bind(sim);
  const shop = sim.shop.bind(sim);
  const walk = sim.walk.bind(sim);
  const desc = (m) => { const s = sim.stats(m); return `${m.id} Lv${m.level} HP${m.hp}/${s.hp} MP${m.mp}/${s.mp} 攻${s.atk} 守${s.def} 魔${s.mat} 速${s.spd}`; };
  sim.walk = async (leg) => { const d0 = sim.log.defeats, b0 = sim.log.battles; const r = await walk(leg); out.push(`  歩く ${leg[0]} 戦闘${sim.log.battles - b0} 全滅${sim.log.defeats - d0} → ${sim.party.map((m) => `Lv${m.level} ${m.hp}/${sim.stats(m).hp}`).join(' ')}`); return r; };
  sim.shop = (t) => { const g = sim.st.gold; shop(t); out.push(`店 ${t} ${g}G → ${sim.st.gold}G ` + sim.party.map((m) => Object.values(m.equip).filter(Boolean).join(',')).join(' | ')); };
  let n = 0;
  sim.battle = (ids, area, boss) => {
    if (!boss) return battle(ids, area, boss);
    out.push('ボス ' + ids + '： ' + sim.party.map(desc).join(' | '));
    const r = battle(ids, area, boss);
    const lb = sim.lastBattle;
    out.push(`  → ${r} ${lb.rec.turns}T 被ダメ ${lb.rec.dmg.join(',')}` + (lb.form2 ? ` 第二形態 ${lb.form2.dmg.join(',')}` : ''));
    if (++n >= stopAt) throw new Error('stop');
    return r;
  };
  try { await sim.run(); } catch (e) { out.push(String(e)); }
  out.push(JSON.stringify(sim.log.areaBattles) + ` 全滅${sim.log.defeats} 出直し${sim.log.retreats ?? 0}`);
  return out.join('\n');
};
// zako(エリア, 主人公の職業)：そのエリアの目安レベルと村の装備で、雑魚戦だけを何百回も試す
const GEAR = {
  field_town: { lv: 2, sw: ['wood_sword', 'leather_armor'], mg: ['wood_staff', 'cotton_robe'], pr: ['wood_staff', 'travel_clothes'] },
  lake: { lv: 4, sw: ['bronze_sword', 'leather_armor', 'wood_shield', 'leather_cap'], mg: ['bronze_rod', 'cotton_robe', 'leather_cap'], pr: ['bronze_rod', 'travel_clothes'] },
  tower: { lv: 9, plv: 8, sw: ['steel_sword', 'chain_mail', 'bronze_shield', 'bronze_helm'], mg: ['magic_staff', 'silk_robe', 'bronze_helm'], pr: ['magic_staff', 'bronze_robe', 'bronze_shield'] },
  volcano: { lv: 13, plv: 12, sw: ['knight_sword', 'iron_armor', 'iron_shield', 'iron_helm'], mg: ['sage_staff', 'magic_robe', 'iron_helm'], pr: ['sage_staff', 'wind_robe', 'iron_shield'] },
  storm: { lv: 18, plv: 17, sw: ['platinum_sword', 'knight_armor', 'knight_shield', 'knight_helm'], mg: ['holy_staff', 'flame_robe', 'knight_helm'], pr: ['holy_staff', 'holy_robe', 'knight_shield'] },
  post: { lv: 40, plv: 39, sw: ['orichalcum_sword', 'mithril_armor', 'mithril_shield', 'mithril_helm', 'life_charm'], mg: ['orichalcum_rod', 'sage_robe', 'mithril_helm', 'magic_earring'], pr: ['orichalcum_rod', 'light_robe', 'mithril_shield', 'mithril_helm', 'life_charm'] },
  demon: { lv: 24, plv: 23, sw: ['dragon_killer', 'mithril_armor', 'mithril_shield', 'mithril_helm'], mg: ['dragon_staff', 'sage_robe', 'mithril_helm'], pr: ['dragon_staff', 'light_robe', 'mithril_shield'] },
};
export function testParty(area, heroJob, lvAdj = 0) {
  const g = GEAR[area];
  const eq = (list) => Object.fromEntries(list.map((id) => [slotOf(items[id]), id]));
  const party = [createMember({ id: 'hero', job: heroJob, level: g.lv + lvAdj, equip: eq(heroJob === 'mage' ? g.mg : g.sw) }, items), createMember({ id: 'luke', job: 'priest', level: g.lv - 1 + lvAdj, equip: eq(g.pr) }, items)];
  if (g.plv) {
    const pj = heroJob === 'mage' ? 'swordsman' : 'mage';
    party.push(createMember({ id: 'partner', job: pj, level: g.plv + lvAdj, equip: eq(pj === 'mage' ? g.mg : g.sw) }, items));
  }
  return party;
}
window.zako = (area, heroJob = 'swordsman', n = 300, lvAdj = 0) => {
  let turns = 0, dmg = 0, wipes = 0, downs = 0;
  for (let k = 0; k < n; k++) {
    const sim = new Sim(HEROES[heroJob === 'mage' ? 1 : 0], STRATEGIES.efficient, 5000 + k);
    sim.st.party = testParty(area, heroJob, lvAdj);
    // 物語で覚える技（雷の村からの専用技、魔王城では光の技と師匠の奥義）。window.noHeir = true で、奥義なしと比べられる
    for (const m of sim.party) {
      if (m.id === 'partner' && ['storm', 'demon'].includes(area)) m.extraSkills = [m.job === 'mage' ? 'lightning_bolt' : 'lightning_slash'];
      if (m.id === 'partner' && area === 'demon' && !window.noHeir) m.extraSkills.push(m.job === 'mage' ? 'heir_spell' : 'heir_slash');
      if (m.id === 'hero' && area === 'demon') m.extraSkills = [m.job === 'mage' ? 'holy' : 'holy_slash'];
    }
    const total = sim.party.reduce((s, m) => s + sim.stats(m).hp, 0);
    const res = sim.battle(rollEncounter(enemyData.areas[area], sim.r), area, false);
    turns += sim.lastBattle.rec.turns;
    dmg += sim.lastBattle.rec.dmg.reduce((a, b) => a + b, 0) / total;
    if (res === 'lose') wipes++;
    downs += sim.party.filter((m) => m.hp <= 0).length;
  }
  return `${area} ${heroJob} Lv${GEAR[area].lv + lvAdj}: ${(turns / n).toFixed(2)}T 被ダメ${((100 * dmg) / n).toFixed(0)}%/戦 全滅${((100 * wipes) / n).toFixed(1)}% 倒れ${(downs / n).toFixed(2)}人`;
};
window.zakoAll = (lvAdj = 0) => Object.keys(GEAR).flatMap((a) => [zako(a, 'swordsman', 300, lvAdj), zako(a, 'mage', 300, lvAdj)]).join('\n');
// boss(ボスのid, エリア, 主人公の職業)：目安レベル・村の装備で、ボス戦だけを何十回も試す
window.boss = (id, area, heroJob = 'swordsman', n = 40, lvAdj = 0) => {
  const r = { win: 0, turns: [], dmg: [], turns2: [], dmg2: [] };
  for (let k = 0; k < n; k++) {
    const sim = new Sim(HEROES[heroJob === 'mage' ? 1 : 0], STRATEGIES.efficient, 9000 + k);
    sim.st.party = testParty(area, heroJob, lvAdj);
    if (['storm', 'demon'].includes(area)) for (const m of sim.party) if (m.id === 'partner') m.extraSkills = [m.job === 'mage' ? 'lightning_bolt' : 'lightning_slash'];
    if (area === 'demon') sim.party[0].extraSkills = [heroJob === 'mage' ? 'holy' : 'holy_slash'];
    if (area === 'demon' && !globalThis.noHeir) for (const m of sim.party) if (m.id === 'partner') m.extraSkills.push(m.job === 'mage' ? 'heir_spell' : 'heir_slash');
    // その時に買えそうな薬を持って挑む
    const bag = { lake: { potion_s: 5 }, tower: { potion_m: 5 }, volcano: { potion_m: 8, revive_potion: 1 }, storm: { potion_l: 5, revive_potion: 2 }, demon: { potion_l: 8, revive_potion: 3, mana_potion: 3 } }[area] ?? {};
    for (const [it, c] of Object.entries(bag)) addItem(sim.st, it, c);
    const res = sim.battle([id], area, true);
    const lb = sim.lastBattle;
    if (res === 'win') {
      r.win++;
      r.turns.push(lb.rec.dmg.length);
      if (lb.form2) r.turns2.push(lb.form2.turns);
    }
    r.dmg.push(mean(lb.rec.dmg) / lb.rec.hpAvg);
    if (lb.form2) r.dmg2.push(mean(lb.form2.dmg) / lb.rec.hpAvg);
  }
  const f = (l, d = 1) => (l.length ? mean(l).toFixed(d) : '-');
  return `${id} ${heroJob} Lv${GEAR[area].lv + lvAdj}: 勝${Math.round((100 * r.win) / n)}% ${f(r.turns)}T 被${Math.round(100 * mean(r.dmg))}%` + (r.dmg2.length ? ` 第二${f(r.turns2)}T 被${Math.round(100 * mean(r.dmg2))}%` : '');
};

// ---- 裏ボス「影の勇者」を鍛える（クロスエントロピー法：よかった作戦の近くを何度も探しなおす） ----
// 相手：いろいろな遊び方のボット × 主人公4通り。レベル40前後・最強の装備・薬あり。それぞれに「本編での癖」を持たせる
import('../src/core/brain.js').then(({ FEATURES, think }) => {
  const SHADOW_ACTS = enemyData.enemies.shadow_m_sword.actions;
  const OPPONENTS = [
    { strat: 'efficient', habits: { cmds: { attack: 40, physical: 30, magic: 30, heal: 20, item: 8, guard: 5 }, guardVsBig: [100, 15], healAt: [45, 100] } },
    { strat: 'items', habits: { cmds: { attack: 40, physical: 20, magic: 20, heal: 10, item: 40, guard: 5 }, guardVsBig: [100, 10], healAt: [60, 100] } },
    { strat: 'noitems', habits: { cmds: { attack: 50, physical: 30, magic: 30, heal: 30, guard: 10 }, guardVsBig: [100, 20], healAt: [40, 100] } },
    { strat: 'guarder', habits: { cmds: { attack: 30, physical: 20, magic: 20, heal: 25, item: 10, guard: 40 }, guardVsBig: [100, 70], healAt: [55, 100] } },
  ];
  STRATEGIES.guarder = { label: '大技は身を守る', walk: 1, ai: 'smart', guardBig: true, healAt: 0.55 };
  const toBrain = (v) => ({ weights: v.slice(0, FEATURES.length), bias: Object.fromEntries(SHADOW_ACTS.map((a, i) => [a, v[FEATURES.length + i]])), temp: 0.1, variety: window.trainVariety ?? 0 });

  // 1回の戦い。勝てば1、負けても魔王…ではなく影のHPを多く残せば少し点が入る（ボスの側の点）
  function fight(vec, heroIndex, opp, seed, lvAdj = 0) {
    const hero = HEROES[heroIndex];
    const sim = new Sim(hero, STRATEGIES[opp.strat], seed);
    sim.st.party = testParty('post', hero.job, lvAdj);
    for (const m of sim.party) if (m.id === 'partner') m.extraSkills = m.job === 'mage' ? ['lightning_bolt', 'heir_spell'] : ['lightning_slash', 'heir_slash'];
    sim.party[0].extraSkills = [hero.job === 'mage' ? 'holy' : 'holy_slash'];
    for (const [it, c] of Object.entries({ potion_l: 10, revive_potion: 3, mana_potion: 5, cure_potion: 5 })) addItem(sim.st, it, c);
    sim.st.stats = { habits: JSON.parse(JSON.stringify(opp.habits)) };
    const brain = vec ? (Array.isArray(vec) ? toBrain(vec) : vec) : null;
    const used = {};
    sim.think = brain
      ? (b, e, allies) => {
          const plan = think(b, e, allies, brain);
          for (const p of plan ?? []) used[p.sid] = (used[p.sid] ?? 0) + 1;
          return plan;
        }
      : null;
    const id = `shadow_${hero.gender === 'female' ? 'f' : 'm'}_${hero.job === 'mage' ? 'mage' : 'sword'}`;
    sim.battle([id], 'demon', true);
    const lb = sim.lastBattle;
    const r = lb.timeout ? 'timeout' : lb.result;
    // 長引いて決着がつかない（300ターン）時は、ボスの勝ちにしない
    return { bossWin: r === 'lose', draw: !['win', 'lose'].includes(r), turns: lb.rec.turns, used };
  }

  // 作戦 vec の強さ（ボスが勝った割合）
  function score(vec, seeds) {
    let s = 0;
    for (const sd of seeds) s += fight(vec, sd.hero, OPPONENTS[sd.opp], sd.seed).bossWin ? 1 : 0;
    return s / seeds.length;
  }

  window.trainShadow = async ({ generations = 20, pop = 30, elite = 6, battles = 16, onLog = console.log } = {}) => {
    const dim = FEATURES.length + SHADOW_ACTS.length;
    let mean = new Array(dim).fill(0);
    let sd = new Array(dim).fill(1.5);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
    let bestEver = { vec: mean.slice(), s: -1 };
    for (let gen = 0; gen < generations; gen++) {
      const seeds = Array.from({ length: battles }, (_, i) => ({ hero: i % 4, opp: Math.floor(i / 4) % OPPONENTS.length, seed: 50000 + gen * 1000 + i }));
      const cands = [];
      for (let k = 0; k < pop; k++) {
        const v = k === 0 ? mean.slice() : mean.map((m, i) => m + sd[i] * gauss());
        cands.push({ v, s: score(v, seeds) });
        if (k % 5 === 4) await new Promise((r) => setTimeout(r, 0));
      }
      cands.sort((a, b) => b.s - a.s);
      const top = cands.slice(0, elite);
      mean = mean.map((_, i) => top.reduce((n, c) => n + c.v[i], 0) / elite);
      sd = sd.map((_, i) => Math.sqrt(top.reduce((n, c) => n + (c.v[i] - mean[i]) ** 2, 0) / elite) + 0.05);
      if (top[0].s > bestEver.s) bestEver = { vec: top[0].v.slice(), s: top[0].s };
      onLog(`第${gen + 1}世代：いちばん強い作戦の勝率 ${Math.round(top[0].s * 100)}%、平均 ${Math.round((cands.reduce((n, c) => n + c.s, 0) / pop) * 100)}%`);
    }
    window.shadowBrain = toBrain(mean);
    window.shadowBrainBest = toBrain(bestEver.vec);
    return { brain: toBrain(mean), features: FEATURES };
  };

  // 作戦を、たくさんの戦いで試す（brain が null なら でたらめ）
  window.evalShadow = (brain, n = 40, lvAdj = 0) => {
    window.shadowUsed = {};
    const vec = brain;
    const out = [];
    OPPONENTS.forEach((opp, oi) => {
      HEROES.forEach((hero, hi) => {
        let bw = 0, turns = 0, draws = 0;
        for (let k = 0; k < n; k++) {
          const r = fight(vec, hi, opp, 90000 + k, lvAdj);
          bw += r.bossWin ? 1 : 0;
          draws += r.draw ? 1 : 0;
          turns += r.turns;
          for (const [a, c] of Object.entries(r.used)) window.shadowUsed[a] = (window.shadowUsed[a] ?? 0) + c;
        }
        out.push(`${STRATEGIES[opp.strat]?.label ?? opp.strat} ${hero.label}：プレイヤーの勝率 ${Math.round(100 - (100 * (bw + draws)) / n)}%、引き分け${draws}（平均${(turns / n).toFixed(1)}ターン）`);
      });
    });
    return out.join('\n');
  };
});
