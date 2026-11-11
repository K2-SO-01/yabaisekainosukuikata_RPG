// プロローグ：黒い画面に白い文字。曲は流さず、文字の音だけ
import { HEIGHT, WIDTH } from '../../config.js';
import { TEXT_SPEED_CPS } from '../../core/settings.js';
import { fillName } from '../../core/text.js';
import { Scene } from '../scene.js';
import { FieldScene } from './field.js';

const LINE_H = 40;

export class PrologueScene extends Scene {
  enter() {
    const g = this.game;
    this.lines = (g.dialogues.prologue ?? []).map((l) => fillName(l, g.state.player.name));
    this.index = 0;
    this.shown = 0;
    this.blink = 0;
    this.leaving = false;
    g.audio.stopBgm(800);
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    if (this.leaving) return;
    const line = Array.from(this.lines[this.index] ?? '');
    const next = input.pressed('ok') || input.tapped();
    if (this.shown < line.length) {
      const cps = TEXT_SPEED_CPS[g.settings.textSpeed];
      if (next || cps === Infinity) {
        this.shown = line.length;
        return;
      }
      const before = Math.floor(this.shown);
      this.shown = Math.min(line.length, this.shown + (Math.min(cps, 18) * dt) / 1000); // プロローグは、ゆっくりめに出す
      if (Math.floor(this.shown) > before) g.audio.playSe('text', { minIntervalMs: 55 });
      return;
    }
    this.blink += dt;
    if (!next) return;
    if (this.index + 1 < this.lines.length) {
      this.index++;
      this.shown = 0;
      this.blink = 0;
    } else {
      this.leaving = true;
      // 段階2の途中：王様の謁見（玉座の間）ができるまでは、テストの部屋へ進む
      g.scenes.fadeTo(() => g.scenes.replaceAll(new FieldScene()), 900);
    }
  }

  draw(ctx) {
    const g = this.game;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const top = Math.round((HEIGHT - this.lines.length * LINE_H) / 2) + 6;
    for (let i = 0; i <= this.index && i < this.lines.length; i++) {
      const text = this.lines[i];
      const x = Math.round(WIDTH / 2 - g.font.width(text) / 2);
      g.font.draw(ctx, text, x, top + i * LINE_H, '#ffffff', i === this.index ? Math.floor(this.shown) : Infinity);
    }
    const done = this.shown >= Array.from(this.lines[this.index] ?? '').length;
    if (done && !this.leaving && Math.floor(this.blink / 380) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) ctx.fillRect(WIDTH / 2 - 5 + i, HEIGHT - 34 + i, 10 - i * 2, 1);
    }
  }
}
