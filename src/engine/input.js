// 操作（キーボードと、スマホ・タブレットの画面ボタン）を「上・下・左・右・決定・キャンセル・ダッシュ」にまとめる

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
    this.keys = new Set();
    this.touchHeld = new Set();
    this.pressedQueue = new Set();
    this.pressedNow = new Set();
    this.tapQueue = false;
    this.tappedNow = false;
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
      this.tapQueue = true;
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
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
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

  setupTouch() {
    const root = this.touchRoot;
    if (!root) return;
    const pad = root.querySelector('#pad');
    let padPointer = null;
    const setPadDir = (dir) => {
      for (const d of DIR_ACTIONS) {
        if (d !== dir) this.touchHeld.delete(d);
      }
      pad.className = dir ? `dir-${dir}` : '';
      if (dir && !this.touchHeld.has(dir)) {
        this.touchHeld.add(dir);
        this.press(dir);
      }
    };
    const dirFromEvent = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return null;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      padPointer = e.pointerId;
      capture(pad, e.pointerId);
      setPadDir(dirFromEvent(e));
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === padPointer) setPadDir(dirFromEvent(e));
    });
    const padEnd = (e) => {
      if (e.pointerId !== padPointer) return;
      padPointer = null;
      setPadDir(null);
    };
    pad.addEventListener('pointerup', padEnd);
    pad.addEventListener('pointercancel', padEnd);

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
      const end = () => {
        btn.classList.remove('pressed');
        if (action !== 'dash') this.touchHeld.delete(action);
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    }
  }

  update(dt) {
    this.dt = dt;
    this.pressedNow = this.pressedQueue;
    this.pressedQueue = new Set();
    this.tappedNow = this.tapQueue;
    this.tapQueue = false;
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

  tapped() {
    return this.enabled && this.tappedNow;
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

  // このフレームで押された方向（すぐ離した短いタップでも1歩進めるように使う）
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
    this.repeatTime = {};
  }
}
