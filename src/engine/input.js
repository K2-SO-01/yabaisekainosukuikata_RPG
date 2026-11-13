// 操作（キーボードと、スマホ・タブレットの画面ボタン）を「上・下・左・右・決定・キャンセル・ダッシュ」にまとめる
// スマホ・タブレットの移動は、画面の左半分（左右反転の時は右半分）をさわった所に出る8方向の十字キー。
// 指をはなすと消える。短くさわっただけ（タップ）は、その場所のタップとして扱う
import { HEIGHT, WIDTH } from '../config.js';

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
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
const STICK_DEAD = 14; // これより小さい動きは「たおしていない」
// 十字キーは、さわった所から動かさない（指をすべらせても、ついてこない）
const SHOW_MS = 110; // さわってから十字キーの絵を出すまで（タップの時にちらつかないように）
// 8方向（右から時計回り）。ななめは、たてと横の両方
const SECTORS = [['right'], ['down', 'right'], ['down'], ['down', 'left'], ['left'], ['up', 'left'], ['up'], ['up', 'right']];
const SECTOR_NAMES = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
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
    this.padSector = -1; // 十字キーの向き（SECTORS の番号。さわっていない・まん中なら -1）
    this.padStale = false; // 場面が変わった時：指をそのままにしていても、向きを変えるかはなすまで動かさない
    // ななめの扱い：'both'（フィールド：ななめに歩く）／'vertical'（メニューなど：たての向きだけ）
    this.diagMode = 'vertical';
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
    // 指を受ける範囲（#padZone）：画面の左半分（左右反転の時は右半分）。位置と大きさは screen.js が決める
    const zone = root.querySelector('#padZone') ?? pad;
    let id = null;
    let cx = 0;
    let cy = 0;
    let t0 = 0;
    let moved = false;
    let showTimer = 0;

    // on：さわった所に出す。off：ふだんの場所（screen.js が決める）に、うすく出しておく
    const show = (on) => {
      pad.classList.toggle('show', on);
      if (on) {
        // 画面の外にはみ出さないように
        const w = pad.offsetWidth;
        const x = Math.min(Math.max(4, cx - w / 2), window.innerWidth - w - 4);
        const y = Math.min(Math.max(4, cy - w / 2), window.innerHeight - w - 4);
        pad.style.left = `${x}px`;
        pad.style.top = `${y}px`;
      } else if (pad.dataset.homeLeft) {
        pad.style.left = pad.dataset.homeLeft;
        pad.style.top = pad.dataset.homeTop;
      }
    };
    const setSector = (k) => {
      if (k === this.padSector) return;
      const before = new Set(this.padDirs());
      this.padSector = k;
      this.padStale = false;
      pad.className = `${pad.classList.contains('show') ? 'show ' : ''}${k >= 0 ? `dir-${SECTOR_NAMES[k]}` : ''}`.trim();
      // 新しく押された向きは「押した瞬間」にもする（メニューのカーソルが1つ動く・1歩進む）
      for (const d of this.padDirs()) if (!before.has(d)) this.press(d);
    };

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      capture(zone, id);
      cx = e.clientX;
      cy = e.clientY;
      t0 = performance.now();
      moved = false;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => id !== null && show(true), SHOW_MS);
    });
    const steer = (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < (this.padSector >= 0 ? STICK_DEAD * 0.6 : STICK_DEAD)) {
        setSector(-1);
        return;
      }
      if (!moved) {
        moved = true;
        show(true);
      }
      // 8方向。今の向きを少し優先して、境い目で向きがぶれないようにする
      const a = Math.atan2(dy, dx);
      let k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      if (this.padSector >= 0 && k !== this.padSector) {
        const center = this.padSector * (Math.PI / 4);
        let diff = Math.abs(a - center) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < Math.PI / 8 + 0.14) k = this.padSector;
      }
      setSector(k);
    };
    zone.addEventListener('pointermove', steer);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      clearTimeout(showTimer);
      const quick = e.type === 'pointerup' && !moved && performance.now() - t0 < TAP_MS;
      setSector(-1);
      show(false);
      // 短くさわっただけ：その場所のタップ（フィールドならそのマスへ歩く、メニューならそこを選ぶ）
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

  // 十字キーで今押している向き（ななめは、フィールドでは両方、メニューなどではたてだけ）
  padDirs() {
    if (this.padSector < 0 || this.padStale) return [];
    const dirs = SECTORS[this.padSector];
    return dirs.length === 2 && this.diagMode !== 'both' ? [dirs[0]] : dirs;
  }

  // 場面が変わった時（フィールドから戦闘・メニューなど）：押しっぱなしの十字キーで、カーソルが勝手に動かないようにする
  holdUntilChange() {
    if (this.padSector >= 0) this.padStale = true;
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
    return this.keys.has(action) || this.touchHeld.has(action) || this.padDirs().includes(action);
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

  // 画面の十字キーで、ななめを押しているか。{ v: 'up'|'down', h: 'left'|'right' } か null
  // （キーボードで2つ押した時は、ななめにしない：向きを切りかえる途中で、思わずななめに歩かないように）
  heldDiag() {
    if (!this.enabled) return null;
    const d = this.padDirs();
    return d.length === 2 ? { v: d[0], h: d[1] } : null;
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

  // 押した瞬間・タップだけを消す（押し続けているキーや十字キーは残す）。場面の切りかえで使う
  // （全部消すと、エリアをまたいだ時に、押し続けていても止まってしまうため）
  clearPresses() {
    this.pressedQueue.clear();
    this.pressedNow.clear();
    this.tapQueue = null;
    this.tapNow = null;
  }

  clear() {
    this.keys.clear();
    this.touchHeld.clear();
    this.holdUntilChange(); // 指がまだ十字キーにあっても、向きを変えるかはなすまで止める
    this.pressedQueue.clear();
    this.pressedNow.clear();
    this.tapQueue = null;
    this.tapNow = null;
    this.repeatTime = {};
  }
}
