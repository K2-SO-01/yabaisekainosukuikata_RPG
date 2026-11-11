// 画面の大きさ。内部は 640×360 で描き、端末の実際の画素で整数倍に拡大する（余白は黒）
import { WIDTH, HEIGHT } from '../config.js';

const PAD_SIZE = 132;
const BTN_W = 170;
const BTN_H = 150;
const ROOMY_MARGIN = 150; // 画面の横の余白がこれだけあれば、ボタンを余白に置く

export class Screen {
  constructor({ canvas, touchRoot, rotateEl, isTouch, getSettings }) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;
    this.rotateEl = rotateEl;
    this.isTouch = isTouch;
    this.forceTouch = false;
    this.getSettings = getSettings;
    this.portrait = false;
    this.scale = 1;
    const relayout = () => this.layout();
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 150));
    window.visualViewport?.addEventListener('resize', relayout);
    this.layout();
  }

  get touchEnabled() {
    return this.isTouch || this.forceTouch;
  }

  layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min((vw * dpr) / WIDTH, (vh * dpr) / HEIGHT);
    let cssW;
    let cssH;
    if (fit >= 1) {
      this.scale = Math.floor(fit);
      cssW = (WIDTH * this.scale) / dpr;
      cssH = (HEIGHT * this.scale) / dpr;
    } else {
      // 画面がとても小さい時だけ、整数倍ではなく縮める
      this.scale = fit;
      const s = Math.min(vw / WIDTH, vh / HEIGHT);
      cssW = WIDTH * s;
      cssH = HEIGHT * s;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    this.portrait = this.isTouch && vh > vw;
    this.rotateEl.hidden = !this.portrait;
    this.layoutTouch(vw, vh, cssW);
  }

  layoutTouch(vw, vh, cssW) {
    const root = this.touchRoot;
    if (!this.touchEnabled || this.portrait) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const cs = getComputedStyle(document.documentElement);
    const sal = parseFloat(cs.getPropertyValue('--sal')) || 0;
    const sar = parseFloat(cs.getPropertyValue('--sar')) || 0;
    const sab = parseFloat(cs.getPropertyValue('--sab')) || 0;
    const side = (vw - cssW) / 2;
    const sideL = side - sal;
    const sideR = side - sar;
    const roomy = Math.min(sideL, sideR) >= ROOMY_MARGIN;
    root.classList.toggle('overlay', !roomy);

    let padX;
    let padY;
    let btnX;
    let btnY;
    if (roomy) {
      padX = sal + (sideL - PAD_SIZE) / 2;
      btnX = vw - sar - (sideR + BTN_W) / 2;
      padY = vh * 0.62 - PAD_SIZE / 2;
      btnY = vh * 0.62 - BTN_H / 2;
    } else {
      padX = sal + 14;
      btnX = vw - sar - BTN_W - 10;
      padY = vh - sab - PAD_SIZE - 14;
      btnY = vh - sab - BTN_H - 8;
    }
    if (this.getSettings().swapButtons) {
      // 左右反転：十字キーを右に、ボタンを左に
      const newPadX = vw - padX - PAD_SIZE;
      const newBtnX = vw - btnX - BTN_W;
      padX = newPadX;
      btnX = newBtnX;
    }
    const clampY = (y, h) => Math.min(Math.max(8, y), vh - h - 8);
    const pad = root.querySelector('#pad');
    const buttons = root.querySelector('#buttons');
    pad.style.left = `${padX}px`;
    pad.style.top = `${clampY(padY, PAD_SIZE)}px`;
    buttons.style.left = `${btnX}px`;
    buttons.style.top = `${clampY(btnY, BTN_H)}px`;
  }
}
