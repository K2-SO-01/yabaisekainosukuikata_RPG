// セーブ・ロードの枠を選ぶ画面
import { HEIGHT, WIDTH } from '../../config.js';
import { MANUAL_SLOTS, readAllSlots, SLOT_IDS, slotLabel, writeSlot } from '../../core/save.js';
import { formatPlayTime } from '../../core/state.js';
import { COLORS, drawCursor, drawWindow } from '../draw.js';
import { ChoiceScene } from '../menu.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';

const ROW_H = 46;

export class SaveLoadScene extends Scene {
  constructor({ mode }) {
    super();
    this.transparent = true;
    this.mode = mode; // 'save' | 'load'
    this.index = 0;
  }

  enter() {
    this.refresh();
  }

  resume() {
    this.refresh();
  }

  refresh() {
    const all = readAllSlots(this.game.store);
    const ids = this.mode === 'save' ? MANUAL_SLOTS : SLOT_IDS;
    this.rows = ids.map((id) => ({ id, data: all[id] }));
    if (this.mode === 'load' && this.index === 0 && !this.rows[0].data) {
      const first = this.rows.findIndex((r) => r.data);
      if (first >= 0) this.index = first;
    }
  }

  update() {
    const g = this.game;
    const input = g.input;
    const tap = input.tap();
    if (tap && this.box) {
      const i = Math.floor((tap.y - (this.box.y + 40)) / ROW_H);
      if (tap.x >= this.box.x && tap.x <= this.box.x + this.box.w && i >= 0 && i < this.rows.length) {
        this.index = i;
        if (this.mode === 'save') this.trySave(this.rows[i]);
        else this.tryLoad(this.rows[i]);
      }
      return;
    }
    if (input.repeat('up')) {
      this.index = (this.index - 1 + this.rows.length) % this.rows.length;
      g.audio.playSe('cursor');
    } else if (input.repeat('down')) {
      this.index = (this.index + 1) % this.rows.length;
      g.audio.playSe('cursor');
    } else if (input.pressed('cancel')) {
      g.audio.playSe('cancel');
      g.scenes.pop(this);
    } else if (input.pressed('ok')) {
      const row = this.rows[this.index];
      if (this.mode === 'save') this.trySave(row);
      else this.tryLoad(row);
    }
  }

  trySave(row) {
    const g = this.game;
    g.audio.playSe('ok');
    if (!row.data) {
      this.doSave(row);
      return;
    }
    g.scenes.push(
      new ChoiceScene({
        items: [
          { label: '上書きする', value: 'yes' },
          { label: 'やめる', value: 'no' },
        ],
        x: WIDTH / 2 + 60,
        y: 70 + this.index * ROW_H,
        width: 150,
        index: 1,
        onSelect: (item) => {
          if (item.value === 'yes') this.doSave(row);
        },
      }),
    );
  }

  doSave(row) {
    const g = this.game;
    const ok = writeSlot(g.store, row.id, g.state);
    this.refresh();
    if (ok) {
      g.audio.playSe('save');
      g.scenes.push(new MessageScene([`${slotLabel(row.id)}にセーブしました。`], { onDone: () => g.scenes.pop(this) }));
    } else {
      g.audio.playSe('buzzer');
      g.scenes.push(new MessageScene(['セーブできませんでした。ブラウザの設定で、保存が止められているかもしれません。']));
    }
  }

  async tryLoad(row) {
    const g = this.game;
    if (!row.data) {
      g.audio.playSe('buzzer');
      return;
    }
    g.audio.playSe('ok');
    const { FieldScene } = await import('./field.js');
    g.scenes.fadeTo(() => {
      g.state = JSON.parse(JSON.stringify(row.data.state));
      g.scenes.replaceAll(new FieldScene());
    }, 400);
  }

  draw(ctx) {
    const g = this.game;
    const w = 500;
    const h = this.rows.length * ROW_H + 52;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = Math.round(HEIGHT / 2 - h / 2);
    this.box = { x, y, w };
    drawWindow(ctx, x, y, w, h);
    g.font.draw(ctx, this.mode === 'save' ? 'どこにセーブしますか？' : 'どれをロードしますか？', x + 22, y + 14, COLORS.title);
    this.rows.forEach((row, i) => {
      const ty = y + 44 + i * ROW_H;
      const empty = !row.data;
      const color = empty && this.mode === 'load' ? COLORS.textDim : COLORS.text;
      g.font.draw(ctx, slotLabel(row.id), x + 40, ty, color);
      if (empty) {
        g.font.draw(ctx, '（なし）', x + 170, ty, COLORS.textDim);
      } else {
        const s = row.data.summary ?? {};
        g.font.draw(ctx, `${s.name ?? ''}　${s.place ?? ''}`, x + 170, ty, color);
        g.font.draw(ctx, `プレイ時間 ${formatPlayTime(s.playTimeMs)}　${formatDate(row.data.savedAt)}`, x + 170, ty + 20, COLORS.textDim);
      }
      if (i === this.index) drawCursor(ctx, x + 22, ty + 2);
    });
  }
}

function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
