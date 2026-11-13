// 物語の位置（開発者モードで、物語を好きな所まで進める・戻す）。画面には依存しない
// 物語の位置ごとに、立っているフラグ・仲間・物語で覚える技・行ったことのある町・立つ場所を決めておく。
// 位置を変える時は、その位置までのフラグを立て、それより先のフラグは消す（戻ることもできる）。
// 宝箱・レベル・お金・道具はそのまま（レベルなどは開発者メニューで別に変えられる）
import { createMember, MEMBER_DEFS, partnerOf } from './party.js';
import { addKeyItem } from './state.js';

// flags：その位置で新しく立つフラグ（前の位置のぶんは自動でふくまれる）
export const CHECKPOINTS = [
  { label: 'はじまり（王様に会う前）', flags: [], at: { map: 'castle_throne', x: null, y: null, dir: 'up' } },
  { label: '王様に会ったあと', flags: ['audience_done'], at: { map: 'town', x: 19, y: 11, dir: 'down' } },
  { label: '家でシュンソクをもらったあと', flags: ['home_event_done', 'dash'], at: { map: 'town', x: 4, y: 24, dir: 'down' } },
  { label: '町のスライムを倒したあと', flags: ['slime_in', 'slime_beaten'], at: { map: 'town', x: 19, y: 30, dir: 'down' } },
  { label: 'ルークが仲間になったあと', flags: ['luke_joined'], party: ['luke'], at: { map: 'field_town', x: 18, y: 14, dir: 'down' } },
  { label: '水の村に着いた', visit: 'village_water', at: { map: 'village_water', x: 12, y: 17, dir: 'up' } },
  { label: '水の四天王を倒したあと', flags: ['boss_water', 'inn_water_seen'], at: { map: 'field_water', x: 14, y: 3, dir: 'down' } },
  { label: '風の村でレオ／リナが仲間になったあと', flags: ['partner_joined'], party: ['partner'], visit: 'village_wind', at: { map: 'village_wind', x: 12, y: 17, dir: 'up' } },
  { label: '風の四天王を倒したあと', flags: ['boss_wind', 'inn_wind_seen'], at: { map: 'field_wind', x: 8, y: 9, dir: 'down' } },
  { label: '炎の村に着いた', flags: ['fire_arrived'], visit: 'village_fire', at: { map: 'village_fire', x: 12, y: 17, dir: 'up' } },
  { label: '炎の四天王を倒したあと', flags: ['boss_fire', 'inn_fire_seen'], at: { map: 'field_fire', x: 18, y: 23, dir: 'down' } },
  { label: '雷の村に着いた', visit: 'village_thunder', at: { map: 'village_thunder', x: 12, y: 17, dir: 'up' } },
  { label: '雷の四天王を倒したあと（光の力・形見の前）', flags: ['boss_thunder', 'inn_thunder_seen', 'keepsake_route'], light: true, at: { map: 'storm_castle_boss', x: 6, y: 6, dir: 'up' } },
  { label: '師匠の形見を受け取ったあと', flags: ['keepsake_got'], keepsake: true, at: { map: 'field_thunder', x: 30, y: 14, dir: 'down' } },
  { label: '魔王城の入り口', at: { map: 'field_demon', x: 30, y: 14, dir: 'up' } },
  { label: '魔王を倒したあと（クリア後）', flags: ['before_demon_done', 'demon_defeated', 'ending', 'cleared'], at: { map: 'castle_throne', x: 10, y: 5, dir: 'up' } },
];

// 物語のフラグ（この一覧にあるものだけを、位置に合わせて立てたり消したりする）。影の勇者を倒した証も、クリア前に戻す時は消す
const STORY_FLAGS = [...new Set(CHECKPOINTS.flatMap((c) => c.flags ?? [])), 'luke_appear', 'shadow_defeated'];
const STORY_TOWNS = CHECKPOINTS.map((c) => c.visit).filter(Boolean);

// 今の物語の位置（立っているフラグと、行った町から、いちばん先の位置）
export function currentCheckpoint(state) {
  let at = 0;
  for (let i = 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    if (!(c.flags ?? []).every((f) => state.flags?.[f]) || (c.visit && !(state.visited ?? []).includes(c.visit))) break;
    if (!c.flags?.length && !c.visit) continue; // フラグのない位置（魔王城の入り口）は、場所だけなので数えない
    at = i;
  }
  return at;
}

// 物語の位置を i にする。返り値：立つ場所（呼ぶ側でそこへ移動する）
export function applyCheckpoint(state, items, i) {
  const upto = CHECKPOINTS.slice(0, i + 1);
  const on = new Set(upto.flatMap((c) => c.flags ?? []));
  state.flags ??= {};
  for (const f of STORY_FLAGS) {
    if (on.has(f)) state.flags[f] = true;
    else delete state.flags[f];
  }
  state.flags.dash = on.has('dash'); // ダッシュは、シュンソクをもらってから
  // 大事なもの：シュンソク
  state.keyItems = (state.keyItems ?? []).filter((k) => k !== 'shunsoku');
  if (on.has('dash')) addKeyItem(state, 'shunsoku');
  // 行ったことのある町（ワープポーションの行き先）：城下町と、この位置までの村
  const towns = new Set(['town', ...upto.map((c) => c.visit).filter(Boolean)]);
  state.visited = [...new Set([...(state.visited ?? []).filter((t) => !STORY_TOWNS.includes(t) && t !== 'town'), ...towns])];
  // 仲間：この位置までに加わる人だけ。新しく加わる人は、主人公と同じレベル
  const members = new Set(upto.flatMap((c) => c.party ?? []));
  const hero = state.party.find((m) => m.id === 'hero');
  state.party = state.party.filter((m) => m.id === 'hero' || members.has(m.id));
  if (members.has('luke') && !state.party.some((m) => m.id === 'luke')) {
    const def = MEMBER_DEFS.luke;
    state.party.push(createMember({ id: 'luke', job: def.job, level: Math.max(def.level, hero.level), equip: def.equip }, items));
  }
  if (members.has('partner') && !state.party.some((m) => m.id === 'partner')) {
    const p = partnerOf(state);
    const equip = p.job === 'mage' ? { weapon: 'sage_staff', armor: 'magic_robe', helm: 'iron_helm' } : { weapon: 'knight_sword', armor: 'iron_armor', shield: 'iron_shield', helm: 'iron_helm' };
    state.party.push(createMember({ id: 'partner', job: p.job, level: Math.max(7, hero.level), equip }, items));
  }
  // 物語で覚える技：レオ／リナの専用技（加わった時）、主人公の光の技、師匠の奥義
  const light = upto.some((c) => c.light);
  const keepsake = upto.some((c) => c.keepsake);
  for (const m of state.party) {
    if (m.id === 'hero') m.extraSkills = light ? [m.job === 'mage' ? 'holy' : 'holy_slash'] : [];
    if (m.id === 'partner') {
      m.extraSkills = [m.job === 'mage' ? 'lightning_bolt' : 'lightning_slash'];
      if (keepsake) m.extraSkills.push(m.job === 'mage' ? 'heir_spell' : 'heir_slash');
    }
  }
  return { ...CHECKPOINTS[i].at };
}
