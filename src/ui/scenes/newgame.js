// 「はじめから」：性別 → 職業 → 名前 → 確認 の順に決める
import { HEIGHT, WIDTH } from '../../config.js';
import { createNewGame, DEFAULT_NAMES } from '../../core/state.js';
import { COLORS, drawCursor, drawSkyGradient, drawWindow } from '../draw.js';
import { Menu } from '../menu.js';
import { Scene } from '../scene.js';
import { PrologueScene } from './prologue.js';

const MAX_NAME = 6;
const COLS = 15;
const ROWS = 6;
const CELL = 26;
const GAP = 16; // 5文字ごとのすき間
const GRID_X = Math.round((WIDTH - (COLS * CELL + 2 * GAP)) / 2);
const GRID_Y = 126;
const CMD_Y = GRID_Y + ROWS * CELL + 8;
const CMD_W = (COLS * CELL + 2 * GAP) / 5;

// 文字の表（「|」は5文字ごとの区切り、半角の空白は空きマス）
const HIRA = ['あいうえお|はひふへほ|がぎぐげご', 'かきくけこ|まみむめも|ざじずぜぞ', 'さしすせそ|や ゆ よ|だぢづでど', 'たちつてと|らりるれろ|ばびぶべぼ', 'なにぬねの|わをんー |ぱぴぷぺぽ', 'ぁぃぅぇぉ|っゃゅょ |     '];
const ALNUM = ['ABCDE|FGHIJ|KLMNO', 'PQRST|UVWXY|Z    ', 'abcde|fghij|klmno', 'pqrst|uvwxy|z    ', '01234|56789|     ', '     |     |     '];
const toGrid = (rows) => rows.map((r) => Array.from(r.replaceAll('|', '')));
const toKatakana = (ch) => {
  const c = ch.codePointAt(0);
  return c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
};
const PAGES = [toGrid(HIRA), toGrid(HIRA).map((row) => row.map(toKatakana)), toGrid(ALNUM)];
const COMMANDS = ['ひらがな', 'カタカナ', '英数', '1字けす', 'おわり'];

const GENDERS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];
const JOBS = [
  { label: '剣士', value: 'swordsman', note: '前に立って、剣で戦う。体力と守りが高い' },
  { label: '魔法使い', value: 'mage', note: '後ろから、魔法で戦う。魔法の力が高い' },
];

const cellX = (col) => GRID_X + col * CELL + Math.floor(col / 5) * GAP;

export class NewGameScene extends Scene {
  enter() {
    this.t = 0;
    this.gender = 'male';
    this.job = 'swordsman';
    this.chars = [];
    this.page = 0;
    this.row = 0;
    this.col = 0;
    this.setStep('gender');
  }

  setStep(step) {
    this.step = step;
    if (step === 'gender') {
      this.menu = new Menu({ items: GENDERS, x: 150, y: 150, width: 150, index: this.gender === 'female' ? 1 : 0 });
    } else if (step === 'job') {
      this.menu = new Menu({ items: JOBS, x: 150, y: 150, width: 170, index: this.job === 'mage' ? 1 : 0 });
    } else if (step === 'confirm') {
      this.menu = new Menu({
        items: [
          { label: 'はい', value: 'yes', se: 'start' },
          { label: 'やりなおす', value: 'no' },
        ],
        x: 150,
        y: 196,
        width: 170,
      });
    }
  }

  get name() {
    return this.chars.join('') || DEFAULT_NAMES[this.gender];
  }

  heroId(gender = this.gender, job = this.job) {
    return `hero_${gender === 'female' ? 'f' : 'm'}_${job === 'mage' ? 'mage' : 'sword'}`;
  }

  update(dt) {
    this.t += dt;
    if (this.step === 'name') this.updateName();
    else this.updateMenu();
  }

  updateMenu() {
    const g = this.game;
    const r = this.menu.update(g.input, g.audio);
    // カーソルを動かしただけでも、右の絵に反映する
    const cur = this.menu.items[this.menu.index].value;
    if (this.step === 'gender') this.gender = cur;
    else if (this.step === 'job') this.job = cur;
    if (!r) return;
    if (r.type === 'cancel') {
      if (this.step === 'gender') this.backToTitle();
      else if (this.step === 'job') this.setStep('gender');
      else this.setStep('name');
      return;
    }
    if (this.step === 'gender') this.setStep('job');
    else if (this.step === 'job') this.setStep('name');
    else if (r.item.value === 'yes') this.start();
    else this.setStep('gender');
  }

  async backToTitle() {
    const g = this.game;
    const { TitleScene } = await import('./title.js');
    g.scenes.fadeTo(() => g.scenes.replaceAll(new TitleScene()), 300);
  }

  start() {
    const g = this.game;
    g.scenes.fadeTo(() => {
      g.state = createNewGame({ name: this.name, gender: this.gender, job: this.job }, g.items);
      g.scenes.replaceAll(new PrologueScene());
    }, 700);
  }

  // ---- 名前入力 ----
  grid() {
    return PAGES[this.page];
  }

  rowHas(r) {
    return this.grid()[r].some((c) => c !== ' ');
  }

  nearest(r, col) {
    const row = this.grid()[r];
    for (let d = 0; d < COLS; d++) {
      if (row[col - d] && row[col - d] !== ' ') return col - d;
      if (row[col + d] && row[col + d] !== ' ') return col + d;
    }
    return 0;
  }

  move(dx, dy) {
    if (dx) {
      if (this.row === ROWS) this.col = (this.col + dx + COMMANDS.length) % COMMANDS.length;
      else do this.col = (this.col + dx + COLS) % COLS;
      while (this.grid()[this.row][this.col] === ' ');
    }
    if (dy) {
      const fromCmd = this.row === ROWS;
      const col = fromCmd ? this.col * 3 + 1 : this.col;
      let r = this.row;
      do r = (r + dy + ROWS + 1) % (ROWS + 1);
      while (r !== ROWS && !this.rowHas(r));
      this.row = r;
      this.col = r === ROWS ? (fromCmd ? this.col : Math.min(COMMANDS.length - 1, Math.floor(col / 3))) : this.nearest(r, col);
    }
  }

  type(ch) {
    const audio = this.game.audio;
    if (this.chars.length >= MAX_NAME) {
      audio.playSe('buzzer');
      return;
    }
    this.chars.push(ch);
    audio.playSe('ok');
    if (this.chars.length === MAX_NAME) {
      this.row = ROWS;
      this.col = COMMANDS.length - 1;
    }
  }

  erase() {
    const audio = this.game.audio;
    if (!this.chars.length) return false;
    this.chars.pop();
    audio.playSe('cancel');
    return true;
  }

  command(i) {
    const audio = this.game.audio;
    if (i <= 2) {
      this.page = i;
      audio.playSe('cursor');
    } else if (i === 3) {
      if (!this.erase()) audio.playSe('buzzer');
    } else {
      audio.playSe('ok');
      this.setStep('confirm');
    }
  }

  updateName() {
    const g = this.game;
    const input = g.input;
    const tap = input.tap();
    if (tap) {
      if (tap.y >= CMD_Y && tap.y < CMD_Y + CELL && tap.x >= GRID_X && tap.x < GRID_X + CMD_W * 5) {
        this.row = ROWS;
        this.col = Math.floor((tap.x - GRID_X) / CMD_W);
        this.command(this.col);
      } else if (tap.y >= GRID_Y && tap.y < GRID_Y + ROWS * CELL) {
        const r = Math.floor((tap.y - GRID_Y) / CELL);
        for (let c = 0; c < COLS; c++) {
          if (tap.x >= cellX(c) && tap.x < cellX(c) + CELL && this.grid()[r][c] !== ' ') {
            this.row = r;
            this.col = c;
            this.type(this.grid()[r][c]);
          }
        }
      }
      return;
    }
    let moved = true;
    if (input.repeat('left')) this.move(-1, 0);
    else if (input.repeat('right')) this.move(1, 0);
    else if (input.repeat('up')) this.move(0, -1);
    else if (input.repeat('down')) this.move(0, 1);
    else moved = false;
    if (moved) {
      g.audio.playSe('cursor');
    } else if (input.pressed('ok')) {
      if (this.row === ROWS) this.command(this.col);
      else this.type(this.grid()[this.row][this.col]);
    } else if (input.pressed('cancel')) {
      if (!this.erase()) {
        g.audio.playSe('cancel');
        this.setStep('job');
      }
    }
  }

  // ---- 描く ----
  drawHero(ctx, x, y, size, id = this.heroId()) {
    const img = this.game.assets.image(`char:${id}`);
    if (!img) return;
    const frame = [0, 1, 2, 1][Math.floor(this.t / 220) % 4];
    ctx.drawImage(img, frame * 32, 0, 32, 32, x, y, size, size);
  }

  draw(ctx) {
    const g = this.game;
    drawSkyGradient(ctx, WIDTH, HEIGHT, '#bfe4f6', '#fde9d6');
    if (this.step === 'name') {
      this.drawName(ctx);
      return;
    }
    drawWindow(ctx, 110, 70, 420, 220);
    const title = { gender: 'あなたは どちらですか？', job: '職業を えらんでください', confirm: 'これで いいですか？' }[this.step];
    g.font.draw(ctx, title, 134, 92, COLORS.title);
    if (this.step === 'confirm') {
      const genderLabel = GENDERS.find((x) => x.value === this.gender).label;
      const jobLabel = JOBS.find((x) => x.value === this.job).label;
      g.fontBig.draw(ctx, this.name, 150, 124, COLORS.text);
      g.font.draw(ctx, `${genderLabel}・${jobLabel}`, 152, 166, COLORS.text);
    } else if (this.step === 'job') {
      g.font.draw(ctx, JOBS[this.menu.index].note, 134, 250, COLORS.textDim);
    }
    this.menu.draw(ctx, g.font);
    ctx.fillStyle = COLORS.winInner;
    ctx.fillRect(392, 124, 104, 104);
    this.drawHero(ctx, 396, 128, 96);
  }

  drawName(ctx) {
    const g = this.game;
    drawWindow(ctx, 92, 46, 456, 288);
    ctx.fillStyle = COLORS.winInner;
    ctx.fillRect(108, 56, 64, 64);
    this.drawHero(ctx, 108, 56, 64);
    g.font.draw(ctx, 'なまえを いれてください', 190, 58, COLORS.title);
    // 何も入れていない時は、そのまま決めた時の名前を、うすく入れておく（入れないとこの名前になる）
    const ghost = this.chars.length ? [] : Array.from(DEFAULT_NAMES[this.gender]);
    for (let i = 0; i < MAX_NAME; i++) {
      const x = 190 + i * 34;
      if (this.chars[i]) g.fontBig.draw(ctx, this.chars[i], x, 80, COLORS.text);
      else {
        if (ghost[i]) g.fontBig.draw(ctx, ghost[i], x, 80, 'rgba(154,156,200,0.45)');
        ctx.fillStyle = i === this.chars.length && Math.floor(this.t / 400) % 2 === 0 ? COLORS.accent : COLORS.textDim;
        ctx.fillRect(x + 2, 112, 28, 2);
      }
    }
    const grid = this.grid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === ' ') continue;
        const x = cellX(c);
        const y = GRID_Y + r * CELL;
        if (r === this.row && c === this.col) {
          ctx.fillStyle = COLORS.winInner;
          ctx.fillRect(x, y, CELL, CELL);
        }
        g.font.draw(ctx, ch, x + (CELL - g.font.width(ch)) / 2, y + 4, COLORS.text);
      }
    }
    COMMANDS.forEach((label, i) => {
      const x = GRID_X + i * CMD_W;
      const selected = this.row === ROWS && this.col === i;
      if (selected) {
        ctx.fillStyle = COLORS.winInner;
        ctx.fillRect(x, CMD_Y, CMD_W - 4, CELL);
      }
      const color = i === this.page ? COLORS.accent : COLORS.text;
      g.font.draw(ctx, label, x + (CMD_W - 4 - g.font.width(label)) / 2, CMD_Y + 4, color);
      if (selected) drawCursor(ctx, x + 2, CMD_Y + 7);
    });
  }
}
