// 会話の窓。一文字ずつ「ピピピ」と出し、決定で全文表示、もう一度押すと次へ
import { HEIGHT, WIDTH } from '../config.js';
import { TEXT_SPEED_CPS } from '../core/settings.js';
import { fillName, parseLine, wrapText } from '../core/text.js';
import { COLORS, drawNextMark, drawWindow } from './draw.js';
import { Scene } from './scene.js';

const BOX = { x: 8, y: HEIGHT - 8 - 108, w: WIDTH - 16, h: 108 };
const LINE_H = 26;
const LINES_PER_PAGE = 3;
const FACE = 63;

export class MessageScene extends Scene {
  // entries：「名前「セリフ」」の形の文字列の配列
  // defaultFaceKey：名前のないセリフ（村人など）に出す顔
  // keepOpen：最後まで出したら、窓を残したまま onDone を呼ぶ（このあと選択肢を出す時に使う）
  constructor(entries, { onDone, defaultFaceKey = null, keepOpen = false } = {}) {
    super();
    this.transparent = true;
    this.entries = entries;
    this.onDone = onDone;
    this.defaultFaceKey = defaultFaceKey;
    this.keepOpen = keepOpen;
    this.finished = false;
    this.entryIndex = 0;
    this.blink = 0;
  }

  enter() {
    this.openEntry(0);
  }

  openEntry(i) {
    const g = this.game;
    const line = parseLine(fillName(this.entries[i], g.state?.player?.name ?? ''));
    let faceKey = null;
    let showName = false;
    if (line.speaker) {
      const info = g.speakerInfo(line.speaker);
      faceKey = info.faceKey;
      showName = info.showName;
      line.speaker = info.displayName ?? line.speaker;
    } else if (/^「/.test(line.body)) {
      faceKey = this.defaultFaceKey; // 村人などは顔だけ出す
    }
    this.face = faceKey ? g.faces.get(faceKey) ?? null : null;
    this.name = showName ? line.speaker : null;
    this.textX = this.face ? BOX.x + 22 + FACE + 14 : BOX.x + 22;
    const maxW = BOX.x + BOX.w - 30 - this.textX;
    // セリフの中の改行は、ページの区切りにする（長いセリフを、文のまとまりごとに見せる）
    this.pages = [];
    for (const part of line.body.split('\n')) {
      const lines = wrapText(part, maxW, (s) => g.font.width(s));
      for (let k = 0; k < lines.length; k += LINES_PER_PAGE) this.pages.push(lines.slice(k, k + LINES_PER_PAGE));
    }
    this.openPage(0);
  }

  openPage(p) {
    this.pageIndex = p;
    this.shown = 0;
    this.blink = 0;
    this.pageChars = this.pages[p].reduce((n, l) => n + Array.from(l).length, 0);
  }

  update(dt) {
    const g = this.game;
    const input = g.input;
    if (this.shown < this.pageChars) {
      const cps = TEXT_SPEED_CPS[g.settings.textSpeed];
      if ((input.pressed('ok') || input.tapped()) || cps === Infinity) {
        this.shown = this.pageChars;
        return;
      }
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.pageChars, this.shown + (cps * dt) / 1000);
      if (Math.floor(this.shown) > before) g.audio.playSe('text', { minIntervalMs: 55 });
      return;
    }
    this.blink += dt;
    const last = this.pageIndex + 1 >= this.pages.length && this.entryIndex + 1 >= this.entries.length;
    if (last && this.keepOpen) {
      if (!this.finished) {
        this.finished = true;
        this.onDone?.();
      }
      return;
    }
    if (!(input.pressed('ok') || input.tapped())) return;
    if (this.pageIndex + 1 < this.pages.length) {
      this.openPage(this.pageIndex + 1);
    } else if (this.entryIndex + 1 < this.entries.length) {
      this.entryIndex++;
      this.openEntry(this.entryIndex);
    } else {
      g.scenes.pop(this);
      this.onDone?.();
    }
  }

  draw(ctx) {
    const g = this.game;
    if (this.name) {
      const w = g.font.width(this.name) + 30;
      drawWindow(ctx, BOX.x + 10, BOX.y - 31, w, 33);
      g.font.draw(ctx, this.name, BOX.x + 25, BOX.y - 23, COLORS.title);
    }
    drawWindow(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
    if (this.face) {
      ctx.fillStyle = COLORS.winInner;
      ctx.fillRect(BOX.x + 20, BOX.y + 20, FACE + 4, FACE + 4);
      ctx.drawImage(this.face, BOX.x + 22, BOX.y + 22);
    }
    let remaining = Math.floor(this.shown);
    this.pages[this.pageIndex].forEach((line, i) => {
      if (remaining <= 0) return;
      g.font.draw(ctx, line, this.textX, BOX.y + 17 + i * LINE_H, COLORS.text, remaining);
      remaining -= Array.from(line).length;
    });
    if (this.shown >= this.pageChars && Math.floor(this.blink / 380) % 2 === 0) {
      drawNextMark(ctx, BOX.x + BOX.w - 28, BOX.y + BOX.h - 19);
    }
  }
}
