// 縦に並んだ選択肢（カーソルで選ぶ。項目を直接タップしても選べる）
import { COLORS, drawCursor, drawWindow } from './draw.js';
import { Scene } from './scene.js';

const ROW_H = 26;

export class Menu {
  // items: [{ label, value, disabled, se }]
  constructor({ items, x, y, width, cancelable = true, index = 0 }) {
    this.items = items;
    this.x = x;
    this.y = y;
    this.width = width ?? null;
    this.cancelable = cancelable;
    this.index = Math.min(index, items.length - 1);
    this.w = null; // 描いた時の幅（タップの当たり判定に使う）
  }

  measure(font) {
    const w = this.width ?? Math.max(...this.items.map((it) => font.width(it.label))) + 52;
    return { w, h: this.items.length * ROW_H + 18 };
  }

  choose(item, audio) {
    if (item.disabled) {
      audio.playSe('buzzer');
      return null;
    }
    audio.playSe(item.se ?? 'ok');
    return { type: 'select', item };
  }

  // 戻り値：{ type: 'select', item } / { type: 'cancel' } / null
  update(input, audio) {
    const n = this.items.length;
    const tap = input.tap();
    if (tap && this.w !== null) {
      const i = Math.floor((tap.y - (this.y + 9)) / ROW_H);
      if (tap.x >= this.x && tap.x <= this.x + this.w && i >= 0 && i < n) {
        this.index = i;
        return this.choose(this.items[i], audio);
      }
      return null;
    }
    if (input.repeat('up')) {
      this.index = (this.index - 1 + n) % n;
      audio.playSe('cursor');
    } else if (input.repeat('down')) {
      this.index = (this.index + 1) % n;
      audio.playSe('cursor');
    } else if (input.pressed('ok')) {
      return this.choose(this.items[this.index], audio);
    } else if (input.pressed('cancel') && this.cancelable) {
      audio.playSe('cancel');
      return { type: 'cancel' };
    }
    return null;
  }

  draw(ctx, font) {
    const { w, h } = this.measure(font);
    this.w = w;
    drawWindow(ctx, this.x, this.y, w, h);
    this.items.forEach((item, i) => {
      const ty = this.y + 9 + i * ROW_H + 4;
      font.draw(ctx, item.label, this.x + 30, ty, item.disabled ? COLORS.textDim : COLORS.text);
      if (i === this.index) drawCursor(ctx, this.x + 14, ty + 2);
    });
  }
}

// 選択肢だけの小さな場面（はい／いいえ など）
export class ChoiceScene extends Scene {
  constructor({ items, x, y, width, cancelable = true, index = 0, onSelect, onCancel }) {
    super();
    this.transparent = true;
    this.menu = new Menu({ items, x, y, width, cancelable, index });
    this.onSelect = onSelect;
    this.onCancel = onCancel;
  }

  update() {
    const r = this.menu.update(this.game.input, this.game.audio);
    if (!r) return;
    this.game.scenes.pop(this);
    if (r.type === 'select') this.onSelect?.(r.item);
    else this.onCancel?.();
  }

  draw(ctx) {
    this.menu.draw(ctx, this.game.font);
  }
}
