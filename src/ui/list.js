// 長い一覧（スクロールする選択肢）。左に名前、右に値段や個数などを出せる。項目を直接タップしても選べる
import { COLORS, drawCursor, drawWindow } from './draw.js';
import { Scene } from './scene.js';

export const LIST_ROW_H = 26;

export class ListMenu {
  // items: [{ label, right, value, disabled, color }]
  constructor({ items, x, y, w, rows = 8, index = 0, cancelable = true }) {
    this.items = items;
    this.x = x;
    this.y = y;
    this.w = w;
    this.rows = Math.max(1, Math.min(rows, items.length || 1));
    this.cancelable = cancelable;
    this.index = Math.max(0, Math.min(index, items.length - 1));
    this.top = 0;
    this.scrollTo();
  }

  get h() {
    return this.rows * LIST_ROW_H + 18;
  }

  get current() {
    return this.items[this.index] ?? null;
  }

  scrollTo() {
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + this.rows) this.top = this.index - this.rows + 1;
  }

  choose(item, audio) {
    if (!item || item.disabled) {
      audio.playSe('buzzer');
      return null;
    }
    audio.playSe(item.se ?? 'ok');
    return { type: 'select', item };
  }

  // 戻り値：{ type: 'select', item } / { type: 'cancel' } / { type: 'move' } / null
  update(input, audio) {
    const n = this.items.length;
    const tap = input.tap();
    if (tap) {
      const i = this.top + Math.floor((tap.y - (this.y + 9)) / LIST_ROW_H);
      if (tap.x >= this.x && tap.x <= this.x + this.w && tap.y >= this.y + 9 && i < Math.min(n, this.top + this.rows)) {
        if (i !== this.index) {
          this.index = i;
          return { type: 'move' };
        }
        return this.choose(this.items[i], audio);
      }
      if (tap.x >= this.x && tap.x <= this.x + this.w && n > this.rows) {
        // 窓の上下をタップするとスクロール
        if (tap.y < this.y + 9 && this.top > 0) this.top--;
        else if (tap.y > this.y + this.h - 9 && this.top + this.rows < n) this.top++;
        return null;
      }
      if (this.cancelable) {
        audio.playSe('cancel');
        return { type: 'cancel' };
      }
      return null;
    }
    if (n > 0 && input.repeat('up')) {
      this.index = (this.index - 1 + n) % n;
      this.scrollTo();
      audio.playSe('cursor');
      return { type: 'move' };
    }
    if (n > 0 && input.repeat('down')) {
      this.index = (this.index + 1) % n;
      this.scrollTo();
      audio.playSe('cursor');
      return { type: 'move' };
    }
    if (input.pressed('ok') && n > 0) return this.choose(this.items[this.index], audio);
    if (input.pressed('cancel') && this.cancelable) {
      audio.playSe('cancel');
      return { type: 'cancel' };
    }
    return null;
  }

  draw(ctx, font, { active = true } = {}) {
    drawWindow(ctx, this.x, this.y, this.w, this.h);
    for (let r = 0; r < this.rows; r++) {
      const i = this.top + r;
      const item = this.items[i];
      if (!item) break;
      const ty = this.y + 9 + r * LIST_ROW_H + 4;
      const color = item.disabled ? COLORS.textDim : item.color ?? COLORS.text;
      font.draw(ctx, item.label, this.x + 30, ty, color);
      if (item.right != null) {
        const s = String(item.right);
        font.draw(ctx, s, this.x + this.w - 16 - font.width(s), ty, color);
      }
      if (i === this.index) drawCursor(ctx, this.x + 14, ty + 2, active ? COLORS.accent : COLORS.textDim);
    }
    ctx.fillStyle = COLORS.accent;
    const cx = Math.round(this.x + this.w / 2);
    if (this.top > 0) for (let k = 0; k < 4; k++) ctx.fillRect(cx - k, this.y + 2 + k, k * 2 + 1, 1);
    if (this.top + this.rows < this.items.length) for (let k = 0; k < 4; k++) ctx.fillRect(cx - k, this.y + this.h - 3 - k, k * 2 + 1, 1);
  }
}

// 一覧から1つ選ぶ場面。選んだ項目の value を onDone に渡す（キャンセルは null）
// onMove(item)：カーソルが動いた時、extra(ctx, item)：一覧の上に重ねて描く物（説明や能力の比較など）
export class PickScene extends Scene {
  constructor({ items, x, y, w, rows, index, cancelable = true, onDone, onMove, extra, keep = false }) {
    super();
    this.transparent = true;
    this.list = new ListMenu({ items, x, y, w, rows, index, cancelable });
    this.onDone = onDone;
    this.onMove = onMove;
    this.extra = extra;
    this.keep = keep; // 選んだあとも一覧を残す（呼ぶ側で pop する）
  }

  enter() {
    this.onMove?.(this.list.current);
  }

  update() {
    const g = this.game;
    const r = this.list.update(g.input, g.audio);
    if (!r) return;
    if (r.type === 'move') {
      this.onMove?.(this.list.current);
      return;
    }
    if (!this.keep || r.type === 'cancel') g.scenes.pop(this);
    this.onDone?.(r.type === 'select' ? r.item.value : null, this);
  }

  draw(ctx) {
    this.list.draw(ctx, this.game.font, { active: this.game.scenes.top === this });
    this.extra?.(ctx, this.list.current);
  }
}
