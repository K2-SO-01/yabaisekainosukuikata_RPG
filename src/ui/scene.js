// 場面（タイトル、フィールド、メニューなど）を積み重ねて動かす
import { WIDTH, HEIGHT } from '../config.js';

export class Scene {
  constructor() {
    this.transparent = false; // true なら、下の場面も描く（メニューや会話の窓）
    this.game = null;
  }
  enter() {}
  exit() {}
  resume() {}
  update() {}
  draw() {}
}

export class SceneStack {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.fade = null;
  }

  get top() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  push(scene) {
    scene.game = this.game;
    this.stack.push(scene);
    scene.enter();
    return scene;
  }

  pop(scene = this.top) {
    const i = this.stack.lastIndexOf(scene);
    if (i < 0) return;
    const removed = this.stack.splice(i);
    for (let k = removed.length - 1; k >= 0; k--) removed[k].exit();
    this.top?.resume();
  }

  replaceAll(scene) {
    while (this.stack.length) this.stack.pop().exit();
    this.push(scene);
  }

  // 画面を暗くしてから切り替え、また明るくする
  fadeTo(change, ms = 300) {
    if (this.fade) return;
    this.fade = { t: 0, ms, phase: 'out', change };
    this.game.input.clearPresses();
  }

  update(dt) {
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (f.phase === 'out' && f.t >= f.ms) {
        f.change();
        f.phase = 'in';
        f.t = 0;
      } else if (f.phase === 'in' && f.t >= f.ms) {
        this.fade = null;
      }
      return;
    }
    this.top?.update(dt);
  }

  draw(ctx) {
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.stack.length; i++) this.stack[i].draw(ctx);
    if (this.fade) {
      const f = this.fade;
      const a = f.phase === 'out' ? Math.min(1, f.t / f.ms) : 1 - Math.min(1, f.t / f.ms);
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }
}
