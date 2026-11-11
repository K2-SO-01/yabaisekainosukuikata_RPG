// localStorage の入れ物。使えない時（プライベートモードなど）でも止まらないようにする
import { STORAGE_PREFIX } from '../config.js';

export function createStore(prefix = STORAGE_PREFIX) {
  let ls = null;
  try {
    ls = window.localStorage;
    const probe = prefix + '__probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    ls = null;
  }
  return {
    available: !!ls,
    get(key) {
      try {
        return ls ? ls.getItem(prefix + key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (!ls) return false;
        ls.setItem(prefix + key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        ls?.removeItem(prefix + key);
      } catch {
        /* 何もしない */
      }
    },
  };
}

// テスト用（画面なしでボットを回す時など）
export function createMemoryStore() {
  const m = new Map();
  return {
    available: true,
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => (m.set(k, String(v)), true),
    remove: (k) => void m.delete(k),
  };
}
