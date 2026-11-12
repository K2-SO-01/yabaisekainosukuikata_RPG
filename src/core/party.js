// 仲間・ステータス・装備・袋（道具）・経験値。画面には依存しない
// items：data/items.json、skills：data/skills.json の中身

export const JOB_STATS = {
  swordsman: { base: { hp: 30, mp: 8, atk: 12, def: 10, spd: 8, mat: 3 }, grow: { hp: 6, mp: 1, atk: 3, def: 2, spd: 1.5, mat: 1 } },
  mage: { base: { hp: 20, mp: 25, atk: 6, def: 6, spd: 9, mat: 14 }, grow: { hp: 3, mp: 4, atk: 1, def: 1, spd: 1, mat: 3 } },
  priest: { base: { hp: 24, mp: 20, atk: 7, def: 8, spd: 7, mat: 10 }, grow: { hp: 4, mp: 3, atk: 1, def: 2, spd: 1, mat: 2 } },
};
export const JOB_NAMES = { swordsman: '剣士', mage: '魔法使い', priest: '僧侶' };
export const MEMBER_NAMES = { luke: 'ルーク' };
// 途中で仲間になる人の、加わる時の職業・レベル・装備
export const MEMBER_DEFS = { luke: { job: 'priest', level: 1, equip: { weapon: 'wood_staff', armor: 'travel_clothes' } } };
export const SLOTS = ['weapon', 'shield', 'armor', 'helm', 'accessory'];
export const SLOT_NAMES = { weapon: 'ぶき', shield: 'たて', armor: 'よろい', helm: 'かぶと', accessory: 'アクセサリー' };
export const MAX_LEVEL = 40;
export const MAX_STACK = 99;
const STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'spd', 'mat'];

// レベルだけで決まる素の能力（初期値＋伸び×(Lv−1)を計算してから、最後に切り捨て）
export function baseStats(job, level) {
  const t = JOB_STATS[job];
  const out = {};
  for (const k of STAT_KEYS) out[k] = Math.floor(t.base[k] + t.grow[k] * (level - 1));
  return out;
}

// 装備を足した能力。hp・mp は最大値
export function totalStats(m, items) {
  const s = baseStats(m.job, m.level);
  for (const slot of SLOTS) {
    const it = items[m.equip?.[slot]];
    if (!it) continue;
    s.atk += it.atk ?? 0;
    s.def += it.def ?? 0;
    s.spd += it.spd ?? 0;
    s.mat += it.mat ?? 0;
    s.hp += it.hp ?? 0;
  }
  return s;
}

export function createMember({ id, job, level = 1, equip = {} }, items) {
  const m = { id, job, level, exp: 0, equip: { weapon: null, shield: null, armor: null, helm: null, accessory: null, ...equip }, ailments: [] };
  const s = totalStats(m, items);
  m.hp = s.hp;
  m.mp = s.mp;
  return m;
}

export function memberName(state, m) {
  return m.id === 'hero' ? state.player.name : MEMBER_NAMES[m.id] ?? m.id;
}

export function heroStartEquip(job) {
  return job === 'mage' ? { weapon: 'wood_staff' } : { weapon: 'wood_sword' };
}

// ---- 経験値とレベル ----
export function expToNext(level) {
  return Math.round(8 * level ** 1.6);
}

export function learnedSkills(m, skills) {
  return Object.entries(skills)
    .filter(([id, s]) => !id.startsWith('_') && s.job === m.job && s.learn <= m.level)
    .map(([id]) => id);
}

// 経験値を足す。上がったレベルと、新しく覚えた技を返す。HP・MPは上がった分だけ増える（全回復しない）
export function gainExp(m, amount, items, skills) {
  const before = learnedSkills(m, skills);
  const levels = [];
  m.exp += amount;
  while (m.level < MAX_LEVEL && m.exp >= expToNext(m.level)) {
    const old = totalStats(m, items);
    m.exp -= expToNext(m.level);
    m.level++;
    const now = totalStats(m, items);
    if (m.hp > 0) m.hp += now.hp - old.hp;
    m.mp += now.mp - old.mp;
    levels.push(m.level);
  }
  if (m.level >= MAX_LEVEL) m.exp = 0;
  const learned = learnedSkills(m, skills).filter((id) => !before.includes(id));
  return { levels, learned };
}

// ---- 装備 ----
export function canEquip(item, job) {
  return !!item && SLOTS.includes(slotOf(item)) && (item.equip ?? []).includes(job);
}

export function slotOf(item) {
  return item?.kind === 'weapon' ? 'weapon' : item?.kind;
}

// 装備を変えた時の能力（変える前と比べる画面で使う）
export function statsWith(m, slot, itemId, items) {
  return totalStats({ ...m, equip: { ...m.equip, [slot]: itemId } }, items);
}

// 袋の中の物を装備する（外した物は袋に戻る）。itemId が null なら外すだけ
export function equipItem(state, m, slot, itemId, items) {
  const old = m.equip[slot];
  if (itemId) removeItem(state, itemId, 1);
  if (old) addItem(state, old, 1);
  m.equip[slot] = itemId;
  clampHpMp(m, items);
}

export function clampHpMp(m, items) {
  const s = totalStats(m, items);
  m.hp = Math.min(m.hp, s.hp);
  m.mp = Math.min(m.mp, s.mp);
}

// ---- 袋 ----
export function itemCount(state, id) {
  return state.bag?.[id] ?? 0;
}

// 入った個数を返す（99個まで）
export function addItem(state, id, n = 1) {
  state.bag ??= {};
  const have = state.bag[id] ?? 0;
  const add = Math.max(0, Math.min(n, MAX_STACK - have));
  if (add > 0) state.bag[id] = have + add;
  return add;
}

export function removeItem(state, id, n = 1) {
  const have = itemCount(state, id);
  if (have <= n) delete state.bag[id];
  else state.bag[id] = have - n;
}

// 袋の中身を、データの並び順で返す
export function bagList(state, items) {
  return Object.keys(items).filter((id) => itemCount(state, id) > 0).map((id) => ({ id, item: items[id], count: itemCount(state, id) }));
}

export function sellPrice(item) {
  if (!item || item.kind === 'key' || item.nosell) return null;
  if (item.sell != null) return item.sell;
  return item.price != null ? Math.floor(item.price / 2) : null;
}

// ---- 回復 ----
export function isDown(m) {
  return m.hp <= 0;
}

export function fullRecover(state, items) {
  for (const m of state.party) {
    const s = totalStats(m, items);
    m.hp = s.hp;
    m.mp = s.mp;
    m.ailments = [];
  }
}

// 回復魔法の回復量（魔法攻撃×倍率＋足す数。会心とブレはない）
export function healAmount(m, skill, items) {
  const [k, add] = skill.heal;
  return Math.floor(totalStats(m, items).mat * k + add);
}

// 道具や回復魔法の効き目を1人にかける。何か変わったら、変わった内容を返す（何も起きなければ null）
export function applyRecovery(target, effect, items) {
  const s = totalStats(target, items);
  if (effect.revive) {
    if (!isDown(target)) return null;
    target.hp = Math.max(1, Math.floor(s.hp * effect.revive));
    target.ailments = [];
    return { revived: true };
  }
  if (isDown(target)) return null;
  const out = {};
  if (effect.hp) {
    const before = target.hp;
    target.hp = Math.min(s.hp, target.hp + effect.hp);
    if (target.hp > before) out.hp = target.hp - before;
  }
  if (effect.mp) {
    const before = target.mp;
    target.mp = Math.min(s.mp, target.mp + effect.mp);
    if (target.mp > before) out.mp = target.mp - before;
  }
  if (effect.cure && target.ailments.length) {
    target.ailments = [];
    out.cured = true;
  }
  return Object.keys(out).length ? out : null;
}
