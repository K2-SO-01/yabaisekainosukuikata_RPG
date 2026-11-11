// セーブの書き出し・読み込み（文字をコピー・貼り付けする窓）
import { exportSaves, importSaves } from '../core/save.js';
import { Scene } from './scene.js';

export class TextIOScene extends Scene {
  constructor(mode) {
    super();
    this.transparent = true;
    this.mode = mode; // 'export' | 'import'
  }

  enter() {
    const g = this.game;
    const el = document.getElementById('textio');
    this.el = el;
    const area = el.querySelector('textarea');
    const primary = el.querySelector('.primary');
    const close = el.querySelector('.close');
    const status = el.querySelector('.status');
    status.textContent = '';
    if (this.mode === 'export') {
      el.querySelector('.title').textContent = 'セーブの書き出し';
      el.querySelector('.note').textContent =
        '下の文字が、いまのセーブの控えです。メモなどに貼って取っておくと、ほかの端末に移したり、消えた時に戻したりできます。';
      area.value = exportSaves(g.store);
      area.readOnly = true;
      primary.textContent = 'コピーする';
    } else {
      el.querySelector('.title').textContent = 'セーブの読み込み';
      el.querySelector('.note').textContent =
        '書き出しておいた文字を貼り付けて「読み込む」を押してください。同じ番号の枠のセーブは上書きされます。';
      area.value = '';
      area.readOnly = false;
      primary.textContent = '読み込む';
    }
    this.onPrimary = async () => {
      if (this.mode === 'export') {
        const ok = await copyText(area);
        status.textContent = ok ? 'コピーしました。' : 'うまくコピーできませんでした。文字を長押しして選んでください。';
      } else {
        const r = importSaves(g.store, area.value);
        status.textContent = r.ok ? `セーブを${r.count}つ読み込みました。` : r.error;
        if (r.ok) g.audio.playSe('save');
      }
    };
    this.onClose = () => g.scenes.pop(this);
    this.onKey = (e) => {
      if (e.key === 'Escape') this.onClose();
    };
    primary.addEventListener('click', this.onPrimary);
    close.addEventListener('click', this.onClose);
    el.addEventListener('keydown', this.onKey);
    g.input.enabled = false;
    g.input.clear();
    el.hidden = false;
    if (this.mode === 'export') area.select();
  }

  exit() {
    const g = this.game;
    const el = this.el;
    el.querySelector('.primary').removeEventListener('click', this.onPrimary);
    el.querySelector('.close').removeEventListener('click', this.onClose);
    el.removeEventListener('keydown', this.onKey);
    el.hidden = true;
    g.input.enabled = true;
    g.input.clear();
  }

  draw() {}
}

async function copyText(area) {
  try {
    await navigator.clipboard.writeText(area.value);
    return true;
  } catch {
    try {
      area.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}
