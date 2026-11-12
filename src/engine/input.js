// 操作（キーボードと、スマホ・タブレットの画面ボタン）を「上・下・左・右・決定・キャンセル・ダッシュ」にまとめる
// スマホ・タブレットの移動は、決まった場所にある十字キー。画面のタップも拾う
import { HEIGHT, WIDTH } from '../config.js';

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  NumpadEnter: 'ok',
  KeyZ: 'ok',
  Space: 'ok',
  KeyX: 'cancel',
  Escape: 'cancel',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
};
const DIR_ACTIONS = ['up', 'down', 'left', 'right'];
const REPEAT_DELAY = 320;
const REPEAT_EVERY = 90;
const STICK_DEAD = 13; // これより小さい動きは「たおしていない」
const STICK_MAX = Infinity; // 十字キーの中心は動かさない（固定）
const TAP_MS = 350; // これより短くて動かないタッチは「タップ」

// 指が要素の外に出ても、離すまでその要素の操作として扱う（使えない時は何もしない）
function capture(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* 何もしない */
  }
}

export class Input {
  constructor({ canvas, touchRoot }) {
    this.canvas = canvas;
    this.keys = new Set();
    this.touchHeld = new Set();
    this.pressedQueue = new Set();
    this.pressedNow = new Set();
    this.tapQueue = null;
    this.tapNow = null;
    this.dirOrder = [];
    this.dashToggle = false;
    this.enabled = true;
    this.dt = 16;
    this.repeatTime = {};
    this.gestureHandlers = [];
    this.touchRoot = touchRoot;

    window.addEventListener('keydown', (e) => this.onKey(e, true), { passive: false });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { passive: false });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });

    // 音を鳴らせるようにするための「最初の操作」
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click']) {
      window.addEventListener(type, () => this.gesture(), { passive: true });
    }

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.queueTap(e.clientX, e.clientY);
    });

    // ピンチやダブルタップでの拡大、長押しのメニューを防ぐ
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    });

    this.setupTouch();
  }

  onGesture(fn) {
    this.gestureHandlers.push(fn);
  }

  gesture() {
    for (const fn of this.gestureHandlers) fn();
  }

  onKey(e, down) {
    const target = e.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (down) {
      this.gesture();
      if (!e.repeat) this.press(action);
      this.keys.add(action);
    } else {
      this.keys.delete(action);
    }
  }

  press(action) {
    if (!this.enabled) return;
    this.pressedQueue.add(action);
    if (DIR_ACTIONS.includes(action)) {
      this.dirOrder = this.dirOrder.filter((d) => d !== action);
      this.dirOrder.push(action);
    }
  }

  // 画面をタップした場所を、ゲーム画面（640×360）の中の位置にして覚える
  queueTap(clientX, clientY, fromPad = false) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * WIDTH;
    const y = ((clientY - r.top) / r.height) * HEIGHT;
    const inside = x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
    this.tapQueue = { pos: inside ? { x, y } : null, fromPad };
  }

  setupTouch() {
    const root = this.touchRoot;
    if (!root) return;
    const pad = root.querySelector('#pad');
    // 十字キーの絵より広い範囲（#padZone）で指を受ける。少しずれた所をさわっても動かせる
    const zone = root.querySelector('#padZone') ?? pad;
    let id = null;
    let cx = 0;
    let cy = 0;
    let t0 = 0;
    let moved = false;
    let dir = null;

    const place = () => {
      pad.style.left = `${cx - pad.offsetWidth / 2}px`;
      pad.style.top = `${cy - pad.offsetHeight / 2}px`;
    };
    const setDir = (d) => {
      if (d === dir) return;
      if (dir) this.touchHeld.delete(dir);
      dir = d;
      pad.className = d ? `dir-${d}` : '';
      if (d) {
        this.touchHeld.add(d);
        this.press(d);
      }
    };

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      capture(zone, id);
      const r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      t0 = performance.now();
      moved = false;
      steer(e);
    });
    const steer = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_MAX) {
        // 中心が指についてくるので、反対へ切り返す時もすぐ反応する
        const k = (dist - STICK_MAX) / dist;
        cx += dx * k;
        cy += dy * k;
        dx = e.clientX - cx;
        dy = e.clientY - cy;
        place();
      }
      if (dist < (dir ? STICK_DEAD * 0.6 : STICK_DEAD)) {
        setDir(null);
        return;
      }
      moved = true;
      // 今の向きを少し優先して、ななめの時に向きがぶれないようにする
      const ax = Math.abs(dx) * (dir === 'left' || dir === 'right' ? 1.25 : 1);
      const ay = Math.abs(dy) * (dir === 'up' || dir === 'down' ? 1.25 : 1);
      setDir(ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    zone.addEventListener('pointermove', steer);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      const quick = e.type === 'pointerup' && !moved && performance.now() - t0 < TAP_MS;
      setDir(null);
      if (quick) this.queueTap(e.clientX, e.clientY, true);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    for (const btn of root.querySelectorAll('.act')) {
      const action = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        capture(btn, e.pointerId);
        if (action === 'dash') {
          this.dashToggle = !this.dashToggle;
          btn.classList.toggle('on', this.dashToggle);
          return;
        }
        btn.classList.add('pressed');
        this.touchHeld.add(action);
        this.press(action);
      });
      const up = () => {
        btn.classList.remove('pressed');
        if (action !== 'dash') this.touchHeld.delete(action);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
  }

  update(dt) {
    this.dt = dt;
    this.pressedNow = this.pressedQueue;
    this.pressedQueue = new Set();
    this.tapNow = this.tapQueue;
    this.tapQueue = null;
    for (const a of DIR_ACTIONS) {
      if (this.isDown(a)) this.repeatTime[a] = (this.repeatTime[a] ?? -1) + (this.pressedNow.has(a) ? 0 : dt);
      else this.repeatTime[a] = -1;
    }
  }

  isDown(action) {
    if (!this.enabled) return false;
    return this.keys.has(action) || this.touchHeld.has(action);
  }

  pressed(action) {
    return this.enabled && this.pressedNow.has(action);
  }

  // このフレームで画面がタップ（クリック）されたか
  tapped() {
    return this.enabled && !!this.tapNow;
  }

  // そのタップが十字キーを短くさわったもの（＝マップをタップしたのではない）か
  tapFromPad() {
    return !!this.tapNow?.fromPad;
  }

  // タップされた場所（ゲーム画面の中なら { x, y }。外なら null）
  tap() {
    return this.enabled && this.tapNow ? this.tapNow.pos : null;
  }

  // メニューのカーソル用：押した時と、押し続けた時に少しずつ反応する
  repeat(action) {
    if (this.pressed(action)) return true;
    const t = this.repeatTime[action] ?? -1;
    if (t < REPEAT_DELAY) return false;
    const before = t - this.dt;
    return Math.floor((t - REPEAT_DELAY) / REPEAT_EVERY) !== Math.floor((before - REPEAT_DELAY) / REPEAT_EVERY) || before < REPEAT_DELAY;
  }

  // いま押されている方向（あとから押した方を優先）
  heldDir() {
    for (let i = this.dirOrder.length - 1; i >= 0; i--) {
      if (this.isDown(this.dirOrder[i])) return this.dirOrder[i];
    }
    return DIR_ACTIONS.find((d) => this.isDown(d)) ?? null;
  }

  // このフレームで押された方向（すぐ離した短い操作でも1歩進めるように使う）
  pressedDir() {
    if (!this.enabled) return null;
    for (let i = this.dirOrder.length - 1; i >= 0; i--) {
      if (this.pressedNow.has(this.dirOrder[i])) return this.dirOrder[i];
    }
    return DIR_ACTIONS.find((d) => this.pressedNow.has(d)) ?? null;
  }

  dash() {
    return this.isDown('dash') || this.dashToggle;
  }

  clear() {
    this.keys.clear();
    this.touchHeld.clear();
    this.pressedQueue.clear();
    this.pressedNow.clear();
    this.tapQueue = null;
    this.tapNow = null;
    this.repeatTime = {};
  }
}
