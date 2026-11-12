// お店（武器防具屋・道具屋）。セリフは data/dialogues/shop.json（企画書11章の文面）
import { HEIGHT, WIDTH } from '../../config.js';
import {
  addItem, bagList, canEquip, equipItem, itemCount, MAX_STACK, memberName, removeItem, sellPrice, slotOf, statsWith, totalStats,
} from '../../core/party.js';
import { addGold } from '../../core/state.js';
import { COLORS, drawWindow } from '../draw.js';
import { ask, holdSay, pick, pickMember, say } from '../flow.js';
import { Scene } from '../scene.js';

const STAT_LABELS = { atk: '攻撃', def: '防御', spd: '素早さ', mat: '魔法攻撃', hp: '最大HP' };

export async function openShop(g, shopId) {
  const shop = g.shops[shopId];
  if (!shop) return;
  const t = shop.type; // 'weapon' か 'item'
  const face = shop.keeper ?? null;
  const line = (key, vars = {}) => (g.dialogues[`${t}_${key}`] ?? ['']).map((s) => s.replace('{price}', vars.price ?? ''));
  for (;;) {
    // スマホでは「やめる」を出さない（右上の「もどる」でやめられる）
    const choice = await ask(g, line('hello'), g.screen.touchEnabled ? ['かう', 'うる'] : ['かう', 'うる', 'やめる'], { face, width: 120, cancelIndex: 2 });
    if (choice === 0) await buy(g, shop, line, face);
    else if (choice === 1) await sell(g, line, face);
    else {
      await say(g, line('bye'), { face });
      return;
    }
  }
}

function goldWindow(g, ctx) {
  const s = `${g.state.gold} ゴールド`;
  drawWindow(ctx, WIDTH - 196, 16, 180, 40);
  g.font.draw(ctx, s, WIDTH - 32 - g.font.width(s), 28, COLORS.text);
}

async function buy(g, shop, line, face) {
  const st = g.state;
  let index = 0;
  for (;;) {
    let cur = null;
    const id = await pick(g, {
      items: shop.stock.map((sid) => ({ label: g.items[sid].name, right: `${g.items[sid].price}G`, value: sid })),
      x: 16, y: 16, w: 330, rows: 8, index,
      onMove: (it) => (cur = it?.value ?? null),
      extra: (ctx) => {
        goldWindow(g, ctx);
        if (cur) drawCompare(g, ctx, cur);
      },
    });
    if (id == null) return;
    index = shop.stock.indexOf(id);
    const item = g.items[id];
    let n = 1;
    if (item.kind === 'item') {
      const room = MAX_STACK - itemCount(st, id);
      if (room <= 0) {
        await say(g, line('full'), { face });
        continue;
      }
      n = await pickCount(g, item, Math.min(room, Math.max(1, Math.floor(st.gold / item.price))));
      if (!n) continue;
    }
    if (st.gold < item.price * n) {
      await say(g, line('no_money'), { face });
      continue;
    }
    st.gold -= item.price * n;
    addItem(st, id, n);
    g.audio.playSe('gold_get');
    await say(g, line('thanks'), { face });
    if (slotOf(item) && item.kind !== 'item') await offerEquip(g, id);
  }
}

// 装備を買った時：「いま装備しますか？」
async function offerEquip(g, id) {
  const st = g.state;
  const item = g.items[id];
  const able = st.party.map((m, i) => [m, i]).filter(([m]) => canEquip(item, m.job));
  if (!able.length) return;
  if ((await ask(g, 'いま装備しますか？', ['はい', 'いいえ'])) !== 0) return;
  let m = able[0][0];
  if (able.length > 1) {
    const i = await pickMember(g, { filter: (x) => canEquip(item, x.job) });
    if (i == null) return;
    m = st.party[i];
  }
  equipItem(st, m, slotOf(item), id, g.items);
  g.audio.playSe('equip');
  await say(g, `${memberName(st, m)}は ${item.name}を 装備した！`);
}

// 買う前に、仲間それぞれの能力の上がり下がりを出す
function drawCompare(g, ctx, id) {
  const st = g.state;
  const item = g.items[id];
  const y0 = 66;
  const rows = st.party.length;
  drawWindow(ctx, 360, y0, WIDTH - 376, 22 + rows * 26 + (item.desc ? 0 : 0));
  st.party.forEach((m, i) => {
    const ty = y0 + 12 + i * 26;
    g.font.draw(ctx, memberName(st, m), 376, ty, COLORS.text);
    if (item.kind === 'item') {
      g.font.draw(ctx, `持っている数 ${itemCount(st, id)}`, 470, ty, COLORS.textDim);
      return;
    }
    if (!canEquip(item, m.job)) {
      g.font.draw(ctx, 'そうびできない', 470, ty, COLORS.textDim);
      return;
    }
    const slot = slotOf(item);
    if (m.equip[slot] === id) {
      g.font.draw(ctx, 'そうび中', 470, ty, COLORS.textDim);
      return;
    }
    const now = totalStats(m, g.items);
    const next = statsWith(m, slot, id, g.items);
    const k = ['atk', 'def', 'mat', 'spd', 'hp'].find((key) => next[key] !== now[key]) ?? (slot === 'weapon' ? 'atk' : 'def');
    const diff = next[k] - now[k];
    g.font.draw(ctx, `${STAT_LABELS[k]} ${diff >= 0 ? '+' : ''}${diff}`, 470, ty, diff > 0 ? '#2e8b57' : diff < 0 ? '#c0392b' : COLORS.textDim);
  });
  drawWindow(ctx, 16, HEIGHT - 64, WIDTH - 32, 48);
  g.font.draw(ctx, item.desc ?? '', 32, HEIGHT - 50, COLORS.text);
}

async function sell(g, line, face) {
  const st = g.state;
  const msg = await holdSay(g, line('sell_which'), { face });
  let index = 0;
  try {
    for (;;) {
      const list = bagList(st, g.items).filter((e) => e.item.kind !== 'key');
      if (!list.length) return;
      const id = await pick(g, {
        items: list.map((e) => {
          const p = sellPrice(e.item);
          return { label: `${e.item.name} ×${e.count}`, right: p == null ? '－' : `${p}G`, value: e.id };
        }),
        x: 16, y: 16, w: 360, rows: 7, index,
        extra: (ctx) => goldWindow(g, ctx),
      });
      if (id == null) return;
      index = Math.max(0, list.findIndex((e) => e.id === id));
      const price = sellPrice(g.items[id]);
      if (price == null) {
        await say(g, line('cannot_sell'), { face });
        continue;
      }
      if ((await ask(g, line('sell_price', { price }), ['はい', 'いいえ'], { face })) !== 0) continue;
      removeItem(st, id, 1);
      addGold(st, price);
      g.audio.playSe('gold_get');
    }
  } finally {
    g.scenes.pop(msg);
  }
}

// 買う個数を選ぶ（上下で1つ、左右で10ずつ）
function pickCount(g, item, max) {
  return new Promise((done) => g.scenes.push(new CountScene(item, max, done)));
}

class CountScene extends Scene {
  constructor(item, max, done) {
    super();
    this.transparent = true;
    this.item = item;
    this.max = Math.max(1, max);
    this.n = 1;
    this.done = done;
  }

  update() {
    const g = this.game;
    const input = g.input;
    const tap = input.tap();
    const before = this.n;
    if (input.repeat('up')) this.n = this.n >= this.max ? 1 : this.n + 1;
    else if (input.repeat('down')) this.n = this.n <= 1 ? this.max : this.n - 1;
    else if (input.repeat('right')) this.n = Math.min(this.max, this.n + 10);
    else if (input.repeat('left')) this.n = Math.max(1, this.n - 10);
    else if (tap) {
      // 窓の上半分で増やし、下半分で減らす。窓の外は決定
      if (tap.x >= 380 && tap.x <= 620 && tap.y >= 170 && tap.y <= 250) {
        if (tap.y < 210) this.n = this.n >= this.max ? 1 : this.n + 1;
        else this.n = this.n <= 1 ? this.max : this.n - 1;
      } else return this.finish(this.n);
    } else if (input.pressed('ok')) return this.finish(this.n);
    else if (input.pressed('cancel')) return this.finish(0);
    if (this.n !== before) g.audio.playSe('cursor');
  }

  finish(n) {
    this.game.audio.playSe(n ? 'ok' : 'cancel');
    this.game.scenes.pop(this);
    this.done(n);
  }

  draw(ctx) {
    const g = this.game;
    drawWindow(ctx, 380, 170, 240, 80);
    g.font.draw(ctx, `いくつ買いますか？`, 396, 182, COLORS.text);
    const s = `▲ ×${this.n} ▼　${this.item.price * this.n}G`;
    g.font.draw(ctx, s, 396, 214, COLORS.title);
  }
}
