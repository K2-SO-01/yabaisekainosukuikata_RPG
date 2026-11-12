// セーブとロード（保存先は store が決める。ブラウザでは localStorage）
import { SAVE_VERSION } from '../config.js';
import { baseStats, heroStartEquip } from './party.js';

export const SLOT_IDS = ['auto', '1', '2', '3'];
export const MANUAL_SLOTS = ['1', '2', '3'];

const keyOf = (slot) => `save.${slot}`;
const clone = (obj) => JSON.parse(JSON.stringify(obj));

export function slotLabel(slot) {
  return slot === 'auto' ? 'オートセーブ' : `セーブ${slot}`;
}

// 古い版のセーブデータを、今の版に直して読み込む
export function migrate(data) {
  if (!data || typeof data !== 'object' || typeof data.version !== 'number' || !data.state) return null;
  const d = clone(data);
  // 版を上げた時は、ここに1つずつ変換を足す。
  // 例：if (d.version === 1) { d.state.newThing = 0; d.version = 2; }
  if (d.version === 1) {
    // 段階3：仲間・袋を足した
    const job = d.state.player?.job ?? 'swordsman';
    const s = baseStats(job, 1);
    d.state.party ??= [{ id: 'hero', job, level: 1, exp: 0, equip: { weapon: heroStartEquip(job).weapon, shield: null, armor: null, helm: null, accessory: null }, ailments: [], hp: s.hp, mp: s.mp }];
    d.state.bag ??= {};
    d.version = 2;
  }
  if (d.version > SAVE_VERSION) return null; // これより新しいゲームで作ったデータは読めない
  return d;
}

export function summarize(state) {
  return {
    name: state.player?.name ?? '',
    place: state.location?.placeName ?? '',
    playTimeMs: state.playTimeMs ?? 0,
    level: state.party?.[0]?.level ?? 1,
    cleared: !!state.flags?.cleared, // クリアの証
    shadow: !!state.flags?.shadow_defeated, // 影の勇者を倒した証
  };
}

// クリアした時：同じ冒険のセーブすべてに「クリアした」を書く（最後にセーブした所から再開でき、そこで裏ボスに挑める）
export function markCleared(store, state) {
  for (const slot of SLOT_IDS) {
    const d = readSlot(store, slot);
    if (!d) continue;
    if (!(state.runId && d.state.runId === state.runId)) continue;
    d.state.flags ??= {};
    d.state.flags.cleared = true;
    d.state.stats ??= {};
    d.state.stats.habits = state.stats?.habits ?? d.state.stats.habits; // 最後の戦いまでの癖を、影の勇者に引きつぐ
    writeSlot(store, slot, d.state, d.savedAt);
  }
}

export function readSlot(store, slot) {
  try {
    return migrate(JSON.parse(store.get(keyOf(slot))));
  } catch {
    return null;
  }
}

export function readAllSlots(store) {
  const out = {};
  for (const slot of SLOT_IDS) out[slot] = readSlot(store, slot);
  return out;
}

export function hasAnySave(store) {
  return SLOT_IDS.some((slot) => readSlot(store, slot) !== null);
}

export function writeSlot(store, slot, state, now = Date.now()) {
  const data = { version: SAVE_VERSION, savedAt: now, summary: summarize(state), state: clone(state) };
  return store.set(keyOf(slot), JSON.stringify(data));
}

export function deleteAllSaves(store) {
  for (const slot of SLOT_IDS) store.remove(keyOf(slot));
}

// --- 書き出し・読み込み（文字にして、別の端末に移したり、控えにしたりする） ---
const EXPORT_HEADER = 'YABAI-SAVE-1:';

export function exportSaves(store) {
  const slots = {};
  for (const slot of SLOT_IDS) {
    const data = readSlot(store, slot);
    if (data) slots[slot] = data;
  }
  return EXPORT_HEADER + toBase64(JSON.stringify({ exportedAt: Date.now(), slots }));
}

export function importSaves(store, text) {
  const t = String(text ?? '').trim();
  if (!t.startsWith(EXPORT_HEADER)) return { ok: false, error: '書き出したセーブの文字ではないようです。' };
  let obj;
  try {
    obj = JSON.parse(fromBase64(t.slice(EXPORT_HEADER.length)));
  } catch {
    return { ok: false, error: '文字が途中で切れているか、まちがっているようです。' };
  }
  const slots = obj && typeof obj === 'object' ? obj.slots : null;
  if (!slots || typeof slots !== 'object') return { ok: false, error: '中身が読めませんでした。' };
  let count = 0;
  for (const slot of SLOT_IDS) {
    const data = slots[slot] ? migrate(slots[slot]) : null;
    if (data) {
      store.set(keyOf(slot), JSON.stringify(data));
      count++;
    }
  }
  return count > 0 ? { ok: true, count } : { ok: false, error: 'セーブが1つも入っていませんでした。' };
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
