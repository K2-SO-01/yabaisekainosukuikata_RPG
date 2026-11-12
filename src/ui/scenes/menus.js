// フィールドのメニューの中身：どうぐ・そうび・まほう／わざ・つよさ
import { HEIGHT, WIDTH } from '../../config.js';
import {
  applyRecovery, bagList, canEquip, equipItem, expToNext, healAmount, isDown, itemCount, JOB_NAMES, learnedSkills,
  memberName, removeItem, SLOT_NAMES, SLOTS, slotOf, statsWith, totalStats,
} from '../../core/party.js';
import { COLORS, drawWindow } from '../draw.js';
import { pick, pickMember, say } from '../flow.js';
import { Scene } from '../scene.js';

const DOWN_COLOR = '#c0392b';
const UP_COLOR = '#2e8b57';

// 説明の窓（画面の下）
function drawDesc(g, ctx, text) {
  drawWindow(ctx, 16, HEIGHT - 64, WIDTH - 32, 48);
  if (text) g.font.draw(ctx, text, 32, HEIGHT - 50, COLORS.text);
}

// 回復した時のお知らせ（王道の言い回し）
export function recoveryText(name, r) {
  if (r.revived) return `${name}は 生き返った！`;
  const parts = [];
  if (r.hp) parts.push(`${name}の HPが ${r.hp} 回復した！`);
  if (r.mp) parts.push(`${name}の MPが ${r.mp} 回復した！`);
  if (r.cured) parts.push(`${name}の 状態異常が 治った！`);
  return parts.join('\n');
}

// ---- どうぐ ----
export async function itemMenu(g, { mapProps = {} } = {}) {
  let index = 0;
  for (;;) {
    const list = bagList(g.state, g.items).filter((e) => e.item.kind !== 'key');
    const keys = (g.state.keyItems ?? []).map((id) => ({ id, item: g.items[id], count: 1 })).filter((e) => e.item);
    const all = [...list, ...keys];
    if (!all.length) {
      await say(g, '袋の中は からっぽだ。');
      return;
    }
    let desc = '';
    const id = await pick(g, {
      items: all.map((e) => ({ label: e.item.name, right: e.item.kind === 'key' ? '大事なもの' : `×${e.count}`, value: e.id })),
      x: 16, y: 16, w: 340, rows: 9, index,
      onMove: (it) => (desc = it ? g.items[it.value]?.desc ?? '' : ''),
      extra: (ctx) => drawDesc(g, ctx, desc),
    });
    if (id == null) return;
    index = all.findIndex((e) => e.id === id);
    await useItemInField(g, id, mapProps);
  }
}

async function useItemInField(g, id, mapProps) {
  const item = g.items[id];
  if (!item?.use) {
    g.audio.playSe('buzzer');
    return;
  }
  const st = g.state;
  if (item.use.warp) {
    if (mapProps.dungeon) {
      await say(g, 'ここでは使えないようだ…');
      return;
    }
    const towns = (st.visited ?? []).map((t) => g.warps?.[t]).filter(Boolean);
    const dest = await pick(g, { items: towns.map((t) => ({ label: t.name, value: t })), x: 380, y: 16, w: 220, rows: Math.max(1, towns.length) });
    if (!dest) return;
    removeItem(st, id, 1);
    g.audio.playSe('warp');
    await say(g, `${st.player.name}は ワープポーションを 使った！`);
    g.warpTo?.(dest);
    return;
  }
  const i = await pickMember(g, { x: 380, y: 16, filter: (m) => (item.target === 'ally_down' ? isDown(m) : !isDown(m)) });
  if (i == null) return;
  const m = st.party[i];
  const r = applyRecovery(m, item.use, g.items);
  if (!r) {
    await say(g, '今は 使っても 意味がないようだ。');
    return;
  }
  removeItem(st, id, 1);
  g.audio.playSe(item.use.revive ? 'revive' : 'heal');
  await say(g, [`${st.player.name}は ${item.name}を 使った！`, recoveryText(memberName(st, m), r)]);
}

// ---- まほう／わざ ----
export async function skillMenu(g) {
  const st = g.state;
  let who = 0;
  if (st.party.length > 1) {
    who = await pickMember(g, { x: 340, y: 16 });
    if (who == null) return;
  }
  const m = st.party[who];
  let index = 0;
  for (;;) {
    const ids = learnedSkills(m, g.skills);
    if (!ids.length) {
      await say(g, 'まだ 何も覚えていない。');
      return;
    }
    const id = await pick(g, {
      items: ids.map((sid) => ({ label: g.skills[sid].name, right: `MP ${g.skills[sid].mp}`, value: sid, disabled: !g.skills[sid].field })),
      x: 16, y: 16, w: 300, rows: 9, index,
      extra: (ctx) => {
        const s = totalStats(m, g.items);
        drawWindow(ctx, 330, 16, 290, 64);
        g.font.draw(ctx, memberName(st, m), 346, 28, COLORS.title);
        g.font.draw(ctx, `MP ${m.mp}/${s.mp}`, 346, 52, COLORS.text);
      },
    });
    if (id == null) return;
    index = ids.indexOf(id);
    await castInField(g, m, id);
  }
}

async function castInField(g, caster, id) {
  const st = g.state;
  const sk = g.skills[id];
  if (isDown(caster)) {
    g.audio.playSe('buzzer');
    return;
  }
  if (caster.mp < sk.mp) {
    await say(g, 'MPが 足りない！');
    return;
  }
  const effect = sk.revive ? { revive: sk.revive } : sk.cure ? { cure: true } : { hp: healAmount(caster, sk, g.items) };
  let targets;
  if (sk.target === 'allies') targets = st.party.filter((m) => !isDown(m));
  else {
    const i = await pickMember(g, { x: 330, y: 92, filter: (m) => (sk.target === 'ally_down' ? isDown(m) : !isDown(m)) });
    if (i == null) return;
    targets = [st.party[i]];
  }
  const results = targets.map((t) => [t, applyRecovery(t, effect, g.items)]).filter(([, r]) => r);
  if (!results.length) {
    await say(g, '今は 使っても 意味がないようだ。');
    return;
  }
  caster.mp -= sk.mp;
  g.audio.playSe(sk.revive ? 'revive' : 'heal');
  await say(g, [`${memberName(st, caster)}は ${sk.name}を となえた！`, results.map(([t, r]) => recoveryText(memberName(st, t), r)).join('\n')]);
}

// ---- そうび ----
export async function equipMenu(g) {
  const st = g.state;
  let who = 0;
  if (st.party.length > 1) {
    who = await pickMember(g, { x: 340, y: 16 });
    if (who == null) return;
  }
  const m = st.party[who];
  let slotIndex = 0;
  for (;;) {
    let preview = null;
    const slot = await pick(g, {
      items: SLOTS.map((s) => ({ label: SLOT_NAMES[s], right: g.items[m.equip[s]]?.name ?? '－', value: s })),
      x: 16, y: 16, w: 320, rows: SLOTS.length, index: slotIndex,
      extra: (ctx) => drawEquipStats(g, ctx, m, preview),
    });
    if (slot == null) return;
    slotIndex = SLOTS.indexOf(slot);
    const options = Object.keys(g.items).filter((id) => itemCount(st, id) > 0 && slotOf(g.items[id]) === slot && canEquip(g.items[id], m.job));
    const items = [...options.map((id) => ({ label: g.items[id].name, right: `×${itemCount(st, id)}`, value: id })), { label: 'はずす', value: '' }];
    let desc = '';
    const chosen = await pick(g, {
      items, x: 16, y: 166, w: 320, rows: Math.min(5, items.length),
      onMove: (it) => {
        preview = it ? statsWith(m, slot, it.value || null, g.items) : null;
        desc = it?.value ? g.items[it.value].desc : '';
      },
      extra: (ctx) => {
        drawEquipStats(g, ctx, m, preview);
        if (desc) drawDesc(g, ctx, desc);
      },
    });
    preview = null;
    if (chosen == null) continue;
    if ((chosen || null) === m.equip[slot]) continue;
    equipItem(st, m, slot, chosen || null, g.items);
    g.audio.playSe('equip');
  }
}

// 能力の窓。preview があれば、変わる所を「→ 新しい値」で出す（上がるなら緑、下がるなら赤）
export function drawEquipStats(g, ctx, m, preview, x = 352, y = 16) {
  const st = g.state;
  const s = totalStats(m, g.items);
  drawWindow(ctx, x, y, 272, 178);
  g.font.draw(ctx, `${memberName(st, m)}（${JOB_NAMES[m.job]}）`, x + 16, y + 12, COLORS.title);
  const rows = [['攻撃', 'atk'], ['防御', 'def'], ['素早さ', 'spd'], ['魔法攻撃', 'mat'], ['最大HP', 'hp']];
  rows.forEach(([label, k], i) => {
    const ty = y + 40 + i * 26;
    g.font.draw(ctx, label, x + 16, ty, COLORS.text);
    const v = String(s[k]);
    g.font.draw(ctx, v, x + 150 - g.font.width(v), ty, COLORS.text);
    if (preview && preview[k] !== s[k]) {
      const nv = String(preview[k]);
      g.font.draw(ctx, '→', x + 164, ty, COLORS.textDim);
      g.font.draw(ctx, nv, x + 240 - g.font.width(nv), ty, preview[k] > s[k] ? UP_COLOR : DOWN_COLOR);
    }
  });
}

// ---- つよさ ----
export class StatusScene extends Scene {
  constructor() {
    super();
    this.index = 0;
  }

  update() {
    const g = this.game;
    const input = g.input;
    const n = g.state.party.length;
    const tap = input.tap();
    if (input.pressed('cancel') || input.pressed('ok') || (tap && n === 1)) {
      g.audio.playSe('cancel');
      g.scenes.pop(this);
    } else if (input.repeat('right') || input.repeat('down') || (tap && tap.x >= WIDTH / 2)) {
      this.index = (this.index + 1) % n;
      g.audio.playSe('cursor');
    } else if (input.repeat('left') || input.repeat('up') || tap) {
      this.index = (this.index - 1 + n) % n;
      g.audio.playSe('cursor');
    }
  }

  draw(ctx) {
    const g = this.game;
    const st = g.state;
    const m = st.party[this.index];
    const s = totalStats(m, g.items);
    const f = g.font;
    drawWindow(ctx, 16, 16, WIDTH - 32, HEIGHT - 32);
    f.draw(ctx, memberName(st, m), 40, 34, isDown(m) ? DOWN_COLOR : COLORS.title);
    f.draw(ctx, `${JOB_NAMES[m.job]}　レベル ${m.level}`, 200, 34, COLORS.text);
    if (st.party.length > 1) f.draw(ctx, `◀ ${this.index + 1}/${st.party.length} ▶`, WIDTH - 140, 34, COLORS.textDim);
    const left = [
      ['HP', `${m.hp}/${s.hp}`], ['MP', `${m.mp}/${s.mp}`], ['攻撃', s.atk], ['防御', s.def], ['素早さ', s.spd], ['魔法攻撃', s.mat],
      ['経験値', m.exp], ['次のレベルまで', m.level >= 40 ? '－' : expToNext(m.level) - m.exp],
    ];
    left.forEach(([label, v], i) => {
      const ty = 74 + i * 30;
      f.draw(ctx, label, 40, ty, COLORS.text);
      const t = String(v);
      f.draw(ctx, t, 290 - f.width(t), ty, COLORS.text);
    });
    SLOTS.forEach((slot, i) => {
      const ty = 74 + i * 30;
      f.draw(ctx, SLOT_NAMES[slot], 320, ty, COLORS.textDim);
      f.draw(ctx, g.items[m.equip[slot]]?.name ?? '－', 440, ty, COLORS.text);
    });
  }
}
