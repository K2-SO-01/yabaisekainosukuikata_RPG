// 絵・データの読み込み。ファイルが見つからなくても止まらず、見つからなかった物を記録する

export function resolvePath(baseFile, relative) {
  if (!relative.startsWith('.')) return relative;
  const parts = baseFile.split('/').slice(0, -1);
  for (const seg of relative.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export class Assets {
  constructor() {
    this.images = new Map();
    this.json = new Map();
    this.missing = [];
    this.listeners = new Set();
  }

  // フォルダ名の空白や [ ] を、URLで使える形にする
  static url(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  noteMissing(path, kind) {
    if (this.missing.some((m) => m.path === path)) return;
    this.missing.push({ path, kind });
    console.warn(`[見つからないファイル] ${kind}: ${path}`);
    for (const fn of this.listeners) fn();
  }

  loadImage(key, path) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };
      img.onerror = () => {
        this.noteMissing(path, '絵');
        this.images.set(key, null);
        resolve(null);
      };
      img.src = Assets.url(path);
    });
  }

  image(key) {
    return this.images.get(key) ?? null;
  }

  async loadJson(key, path) {
    if (this.json.has(key)) return this.json.get(key);
    try {
      const res = await fetch(Assets.url(path), { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      this.json.set(key, data);
      return data;
    } catch {
      this.noteMissing(path, 'データ');
      this.json.set(key, null);
      return null;
    }
  }

  data(key) {
    return this.json.get(key) ?? null;
  }

  async fetchBinary(path) {
    try {
      const res = await fetch(Assets.url(path));
      if (!res.ok) throw new Error(String(res.status));
      return await res.arrayBuffer();
    } catch {
      this.noteMissing(path, '音');
      return null;
    }
  }
}
