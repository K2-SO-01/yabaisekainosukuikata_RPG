// ゲームの状態（セーブするもの）。画面には依存しない
import { SAVE_VERSION } from '../config.js';

export const DEFAULT_NAMES = { male: 'アレン', female: 'エマ' };

export function createNewGame({ name = '', gender = 'male', job = 'swordsman', map = 'castle_throne' } = {}) {
  return {
    version: SAVE_VERSION,
    player: { name: name || DEFAULT_NAMES[gender] || DEFAULT_NAMES.male, gender, job },
    gold: 0,
    stats: { goldEarned: 0 },
    flags: {},
    // x・y が null の時は、マップの「start」の位置から始める
    location: { map, x: null, y: null, dir: 'down', placeName: '' },
    playTimeMs: 0,
  };
}

export function addPlayTime(state, ms) {
  state.playTimeMs = (state.playTimeMs ?? 0) + ms;
}

export function formatPlayTime(ms) {
  const total = Math.floor((ms ?? 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

// お金を増やす・減らす（手に入れた分は、冒険の記録「稼いだお金の合計」にも足す）
export function addGold(state, amount) {
  state.gold = Math.max(0, (state.gold ?? 0) + amount);
  if (amount > 0) {
    state.stats ??= {};
    state.stats.goldEarned = (state.stats.goldEarned ?? 0) + amount;
  }
}
