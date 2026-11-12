// 画面の大きさ。ゲームの中は 640×360 として描き、端末の実際の画素で整数倍に拡大する（余白は黒）
// 描く先のキャンバスは拡大後の画素数で持つので、歩きやスクロールが細かい単位でなめらかに動く
import { WIDTH, HEIGHT } from '../config.js';

const PAD_SIZE = 132;
const BTN_W = 170;
const BTN_H = 150;
const ROOMY_MARGIN = 150; // 画面の横の余白がこれだけあれば、ボタンを余白に置く
const MAX_RENDER_SCALE = 6;

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
    this.renderScale = 1;
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
    let render = 1;
    if (fit >= 1) {
      this.scale = Math.floor(fit);
      cssW = (WIDTH * this.scale) / dpr;
      cssH = (HEIGHT * this.scale) / dpr;
      // 描く倍率は、表示の倍率をきれいに割り切れる数にする（にじみを出さないため）
      render = this.scale;
      if (render > MAX_RENDER_SCALE) {
        render = 1;
        for (let d = MAX_RENDER_SCALE; d > 1; d--) {
          if (this.scale % d === 0) {
            render = d;
            break;
          }
        }
      }
    } else {
      // 画面がとても小さい時だけ、整数倍ではなく縮める
      this.scale = fit;
      const s = Math.min(vw / WIDTH, vh / HEIGHT);
      cssW = WIDTH * s;
      cssH = HEIGHT * s;
    }
    this.renderScale = render;
    if (this.canvas.width !== WIDTH * render || this.canvas.height !== HEIGHT * render) {
      this.canvas.width = WIDTH * render;
      this.canvas.height = HEIGHT * render;
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
    const sat = parseFloat(cs.getPropertyValue('--sat')) || 0;
    const side = (vw - cssW) / 2;
    const sideL = side - sal;
    const sideR = side - sar;
    const roomy = Math.min(sideL, sideR) >= ROOMY_MARGIN;
    const swap = this.getSettings().swapButtons;
    root.classList.toggle('overlay', !roomy);
    root.classList.toggle('swap', swap);

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
    if (swap) {
      // 左右反転：スティックを右に、ボタンを左に
      const newPadX = vw - padX - PAD_SIZE;
      const newBtnX = vw - btnX - BTN_W;
      padX = newPadX;
      btnX = newBtnX;
    }
    const clampY = (y, h) => Math.min(Math.max(8, y), vh - h - 8);
    const pad = root.querySelector('#pad');
    const buttons = root.querySelector('#buttons');
    // スティックのふだんの場所（さわっていない時に、うすく出しておく目印）
    pad.dataset.homeLeft = `${padX}px`;
    pad.dataset.homeTop = `${clampY(padY, PAD_SIZE)}px`;
    pad.style.left = pad.dataset.homeLeft;
    pad.style.top = pad.dataset.homeTop;
    const zone = root.querySelector('#padZone');
    if (zone) {
      const zs = 240;
      zone.style.left = `${padX + PAD_SIZE / 2 - zs / 2}px`;
      zone.style.top = `${clampY(padY, PAD_SIZE) + PAD_SIZE / 2 - zs / 2}px`;
    }
    buttons.style.left = `${btnX}px`;
    buttons.style.top = `${clampY(btnY, BTN_H)}px`;
    // メニューボタン：右上（左右反転の時は左上）。横に余白があれば余白の中に置く
    const menu = root.querySelector('#menuBtn');
    if (menu) {
      const mw = 96;
      let mx = roomy ? vw - sar - (sideR + mw) / 2 : vw - sar - mw - 10;
      if (swap) mx = vw - mx - mw;
      menu.style.left = `${mx}px`;
      menu.style.top = `${sat + 10}px`;
    }
  }
}
