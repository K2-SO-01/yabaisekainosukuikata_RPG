// 設定（セーブデータとは別に保存する）
import { SETTINGS_VERSION } from '../config.js';

export const TEXT_SPEED_LABELS = ['おそい', 'ふつう', 'はやい', '一瞬'];
export const ANIM_SPEED_LABELS = ['×1（ふつう）', '×2（はやい）'];
export const MOVE_SPEED_LABELS = ['ふつう', 'はやい'];
// 1秒に出す文字数（一瞬は全部いっぺんに出す）
export const TEXT_SPEED_CPS = [12, 24, 48, Infinity];

const KEY = 'settings';

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    bgm: 7,
    se: 7,
    textSpeed: 1,
    animSpeed: 0,
    swapButtons: false,
    alwaysDash: false,
    moveSpeed: 0,
  };
}

function clampInt(value, min, max, fallback) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  return {
    version: SETTINGS_VERSION,
    bgm: clampInt(raw.bgm, 0, 10, d.bgm),
    se: clampInt(raw.se, 0, 10, d.se),
    textSpeed: clampInt(raw.textSpeed, 0, TEXT_SPEED_LABELS.length - 1, d.textSpeed),
    animSpeed: clampInt(raw.animSpeed, 0, ANIM_SPEED_LABELS.length - 1, d.animSpeed),
    swapButtons: raw.swapButtons === true,
    alwaysDash: false, // 移動の設定はなくした（ダッシュは画面のボタンで切りかえる）
    moveSpeed: 0,
  };
}

export function loadSettings(store) {
  try {
    return normalizeSettings(JSON.parse(store.get(KEY)));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(store, settings) {
  return store.set(KEY, JSON.stringify(normalizeSettings(settings)));
}
