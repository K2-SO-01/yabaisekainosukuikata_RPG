// 開発者モードのメニュー（隠し名前で始めた冒険だけ。フィールドのメニューの「開発」）
// 物語の位置を進める・戻す、ワープ、レベル、雑魚の戦闘、壁のすり抜け、道具とお金、ボスと戦う、全回復
import { addItem, fullRecover, MAX_LEVEL } from '../../core/party.js';
import { applyCheckpoint, CHECKPOINTS, currentCheckpoint } from '../../core/story.js';
import { pick, say } from '../flow.js';

// ボスと、その戦いの背景（エリア）
const BOSSES = [
  ['trick_slime', 'field_town', '町のスライム'],
  ['boss_water', 'lake', '水の四天王'],
  ['boss_wind', 'tower', '風の四天王'],
  ['boss_fire', 'volcano', '炎の四天王'],
  ['boss_thunder', 'storm', '雷の四天王'],
  ['demon1', 'demon', '魔王'],
  ['shadow', 'demon', '影の勇者'],
];

const fieldOf = (g) => g.scenes.stack.find((s) => s.constructor.name === 'FieldScene');
const onOff = (v) => (v ? 'あり' : 'なし');

export async function devMenu(g) {
  const st = g.state;
  st.devTools ??= { noEncounter: false, noclip: false };
  let index = 0;
  for (;;) {
    const t = st.devTools;
    const items = [
      { label: '物語の位置', right: `${currentCheckpoint(st) + 1}/${CHECKPOINTS.length}`, value: 'story' },
      { label: 'ワープ', value: 'warp' },
      { label: 'レベル', right: `Lv${st.party[0].level}`, value: 'level' },
      { label: '雑魚の戦闘', right: onOff(!t.noEncounter), value: 'enc' },
      { label: '壁のすり抜け', right: onOff(t.noclip), value: 'noclip' },
      { label: '道具とお金をもらう', value: 'items' },
      { label: 'ボスと戦う', value: 'boss' },
      { label: '全回復', value: 'heal' },
    ];
    const v = await pick(g, { items, x: 300, y: 16, w: 320, rows: items.length, index });
    if (v == null) return;
    index = items.findIndex((it) => it.value === v);
    if (v === 'story') {
      const now = currentCheckpoint(st);
      const i = await pick(g, { items: CHECKPOINTS.map((c, k) => ({ label: `${k === now ? '▶' : '　'}${c.label}`, value: k })), x: 120, y: 16, w: 500, rows: 12, index: now });
      if (i == null) continue;
      const at = applyCheckpoint(st, g.items, i);
      g.audio.playSe('warp');
      g.warpTo?.(at);
      return;
    }
    if (v === 'warp') {
      const ids = [...g.maps.keys()].filter((id) => id !== 'testroom');
      const id = await pick(g, { items: ids.map((m) => ({ label: g.maps.get(m)?.props?.name ?? m, right: m, value: m })), x: 120, y: 16, w: 500, rows: 12 });
      if (id == null) continue;
      g.audio.playSe('warp');
      g.warpTo?.({ map: id, x: null, y: null, dir: 'down' });
      return;
    }
    if (v === 'level') {
      const levels = [1, 5, 10, 15, 20, 25, 27, 30, 35, MAX_LEVEL];
      const L = await pick(g, { items: levels.map((l) => ({ label: `Lv${l}`, value: l })), x: 420, y: 16, w: 160, rows: levels.length, index: Math.max(0, levels.indexOf(st.party[0].level)) });
      if (L == null) continue;
      for (const m of st.party) {
        m.level = L;
        m.exp = 0;
      }
      fullRecover(st, g.items);
      g.audio.playSe('levelup');
      continue;
    }
    if (v === 'enc') {
      t.noEncounter = !t.noEncounter;
      g.audio.playSe('cursor');
      continue;
    }
    if (v === 'noclip') {
      t.noclip = !t.noclip;
      g.audio.playSe('cursor');
      continue;
    }
    if (v === 'items') {
      for (const [id, it] of Object.entries(g.items)) {
        if (it.kind === 'key') continue;
        addItem(st, id, it.kind === 'item' ? 20 : 1);
      }
      st.gold = (st.gold ?? 0) + 100000;
      g.audio.playSe('item_get');
      await say(g, '道具をすべてと、100000ゴールドを もらった。');
      continue;
    }
    if (v === 'boss') {
      const b = await pick(g, { items: BOSSES.map(([id, , name]) => ({ label: name, value: id })), x: 380, y: 16, w: 220, rows: BOSSES.length });
      if (b == null) continue;
      const [, area] = BOSSES.find(([id]) => id === b);
      // 影の勇者は、主人公の見た目ごとに絵がちがう
      const id = b === 'shadow' ? `shadow_${st.player.gender === 'female' ? 'f' : 'm'}_${st.player.job === 'mage' ? 'mage' : 'sword'}` : b;
      const field = fieldOf(g);
      while (g.scenes.top !== field) g.scenes.pop(g.scenes.top);
      field?.startBattle({ enemyIds: [id], area, boss: true, gentle: true });
      return;
    }
    if (v === 'heal') {
      fullRecover(st, g.items);
      g.audio.playSe('heal');
    }
  }
}
