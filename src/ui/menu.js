// 縦に並んだ選択肢（カーソルで選ぶ）
import { COLORS, drawCursor, drawWindow } from './draw.js';
import { Scene } from './scene.js';

const ROW_H = 26;

export class Menu {
  // items: [{ label, value, disabled }]
  constructor({ items, x, y, width, cancelable = true, index = 0 }) {
    this.items = items;
    this.x = x;
    this.y = y;
    this.width = width ?? null;
    this.cancelable = cancelable;
    this.index = Math.min(index, items.length - 1);
  }

  measure(font) {
    const w = this.width ?? Math.max(...this.items.map((it) => font.width(it.label))) + 52;
    return { w, h: this.items.length * ROW_H + 18 };
  }

  // 戻り値：{ type: 'select', item } / { type: 'cancel' } / null
  update(input, audio) {
    const n = this.items.length;
    if (input.repeat('up')) {
      this.index = (this.index - 1 + n) % n;
      audio.playSe('cursor');
    } else if (input.repeat('down')) {
      this.index = (this.index + 1) % n;
      audio.playSe('cursor');
    } else if (input.pressed('ok')) {
      const item = this.items[this.index];
      if (item.disabled) {
        audio.playSe('buzzer');
        return null;
      }
      audio.playSe(item.se ?? 'ok');
      return { type: 'select', item };
    } else if (input.pressed('cancel') && this.cancelable) {
      audio.playSe('cancel');
      return { type: 'cancel' };
    }
    return null;
  }

  draw(ctx, font) {
    const { w, h } = this.measure(font);
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
