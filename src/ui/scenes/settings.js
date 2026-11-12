// せってい（タイトル画面と、フィールドのメニューから開く）
import { HEIGHT, WIDTH } from '../../config.js';
import { ANIM_SPEED_LABELS, TEXT_SPEED_LABELS } from '../../core/settings.js';
import { COLORS, drawCursor, drawWindow } from '../draw.js';
import { ChoiceScene } from '../menu.js';
import { Scene } from '../scene.js';
import { TextIOScene } from '../textio.js';

const ROW_H = 23;
const TOP = 40;

export class SettingsScene extends Scene {
  constructor({ inGame = false } = {}) {
    super();
    this.transparent = true;
    this.inGame = inGame;
    this.index = 0;
    this.box = null;
  }

  enter() {
    const g = this.game;
    this.rows = [
      { key: 'bgm', label: 'BGMの音量', type: 'num', min: 0, max: 10 },
      { key: 'se', label: '効果音の音量', type: 'num', min: 0, max: 10 },
      { key: 'textSpeed', label: '文字の速さ', type: 'choice', options: TEXT_SPEED_LABELS },
      { key: 'animSpeed', label: '戦闘の速さ', type: 'choice', options: ANIM_SPEED_LABELS },
      g.screen.touchEnabled ? { key: 'swapButtons', label: 'ボタン配置', type: 'bool', options: ['ふつう', '左右反転'] } : null,
      { key: 'help', label: 'そうさ', type: 'action' },
      { key: 'export', label: 'セーブの書き出し', type: 'action' },
      { key: 'import', label: 'セーブの読み込み', type: 'action' },
      this.inGame ? { key: 'title', label: 'タイトルにもどる', type: 'action' } : null,
      this.game?.screen?.touchEnabled ? null : { key: 'back', label: 'もどる', type: 'action' }, // スマホは右上の「もどる」
    ].filter(Boolean);
  }

  change(row, delta) {
    const g = this.game;
    const s = g.settings;
    if (row.type === 'num') {
      const v = Math.min(row.max, Math.max(row.min, s[row.key] + delta));
      if (v === s[row.key]) return;
      s[row.key] = v;
    } else if (row.type === 'choice') {
      s[row.key] = (s[row.key] + delta + row.options.length) % row.options.length;
    } else if (row.type === 'bool') {
      s[row.key] = !s[row.key];
      g.screen.layout();
    } else {
      return;
    }
    g.saveSettings();
    g.audio.setVolumes(s.bgm, s.se);
    g.audio.playSe('cursor');
  }

  activate(row) {
    const g = this.game;
    if (row.type !== 'action') {
      this.change(row, +1);
      return;
    }
    g.audio.playSe('ok');
    if (row.key === 'back') g.scenes.pop(this);
    else if (row.key === 'help') g.scenes.push(new HelpScene());
    else if (row.key === 'export') g.scenes.push(new TextIOScene('export'));
    else if (row.key === 'import') g.scenes.push(new TextIOScene('import'));
    else if (row.key === 'title') this.confirmTitle();
  }

  update() {
    const g = this.game;
    const input = g.input;
    const tap = input.tap();
    if (tap && this.box) {
      const b = this.box;
      const i = Math.floor((tap.y - (b.y + TOP - 3)) / ROW_H);
      if (tap.x >= b.x && tap.x <= b.x + b.w && i >= 0 && i < this.rows.length) {
        this.index = i;
        const r = this.rows[i];
        if (r.type === 'action') this.activate(r);
        else if (tap.x > b.x + b.w - 200) this.change(r, tap.x > b.x + b.w - 100 ? +1 : -1);
        else g.audio.playSe('cursor');
      }
      return;
    }
    const row = this.rows[this.index];
    if (input.repeat('up')) {
      this.index = (this.index - 1 + this.rows.length) % this.rows.length;
      g.audio.playSe('cursor');
    } else if (input.repeat('down')) {
      this.index = (this.index + 1) % this.rows.length;
      g.audio.playSe('cursor');
    } else if (input.repeat('left')) {
      this.change(row, -1);
    } else if (input.repeat('right')) {
      this.change(row, +1);
    } else if (input.pressed('cancel')) {
      g.audio.playSe('cancel');
      g.scenes.pop(this);
    } else if (input.pressed('ok')) {
      this.activate(row);
    }
  }

  confirmTitle() {
    const g = this.game;
    g.scenes.push(
      new ChoiceScene({
        items: [
          { label: 'タイトルにもどる', value: 'yes' },
          { label: 'やめる', value: 'no' },
        ],
        x: WIDTH / 2 - 100,
        y: HEIGHT / 2 - 10,
        width: 200,
        index: 1,
        onSelect: async (item) => {
          if (item.value !== 'yes') return;
          const { TitleScene } = await import('./title.js');
          g.scenes.fadeTo(() => g.scenes.replaceAll(new TitleScene()), 400);
        },
      }),
    );
  }

  valueText(row) {
    const v = this.game.settings[row.key];
    if (row.type === 'num') return String(v);
    if (row.type === 'choice') return row.options[v];
    if (row.type === 'bool') return row.options[v ? 1 : 0];
    return '';
  }

  draw(ctx) {
    const g = this.game;
    const w = 440;
    const h = this.rows.length * ROW_H + TOP + 12;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = Math.round(HEIGHT / 2 - h / 2);
    this.box = { x, y, w };
    drawWindow(ctx, x, y, w, h);
    g.font.draw(ctx, 'せってい', x + 22, y + 12, COLORS.title);
    this.rows.forEach((row, i) => {
      const ty = y + TOP + i * ROW_H;
      g.font.draw(ctx, row.label, x + 40, ty, COLORS.text);
      if (row.type !== 'action') {
        const value = this.valueText(row);
        const vw = g.font.width(value);
        const right = x + w - 34;
        g.font.draw(ctx, value, right - 18 - vw, ty, COLORS.text);
        if (i === this.index) {
          g.font.draw(ctx, '◀', right - 36 - vw, ty, COLORS.accent);
          g.font.draw(ctx, '▶', right - 12, ty, COLORS.accent);
        }
      }
      if (i === this.index) drawCursor(ctx, x + 22, ty + 2);
    });
  }
}

// 操作の説明
class HelpScene extends Scene {
  constructor() {
    super();
    this.transparent = true;
  }

  update() {
    const input = this.game.input;
    if (input.pressed('ok') || input.pressed('cancel') || input.tapped()) {
      this.game.audio.playSe('cancel');
      this.game.scenes.pop(this);
    }
  }

  draw(ctx) {
    const g = this.game;
    const lines = g.screen.touchEnabled
      ? [
          'スマホ・タブレットの操作',
          '',
          '移動　　　　：左の十字キー',
          '決定　　　　：決定ボタン',
          'キャンセル　：キャンセルボタン',
          'メニュー　　：歩いている時にキャンセルボタン',
          'ダッシュ　　：ダッシュボタンで、走る・歩くを切りかえ',
          '話す・調べる：目の前で決定ボタン',
          '会話を進める：画面のどこかをタップ',
          'メニュー　　：項目を直接タップしても選べる',
        ]
      : [
          'パソコンの操作',
          '',
          '移動　　　　：矢印キー または WASD',
          '決定　　　　：Enter・Z・スペース',
          'キャンセル　：X・Esc',
          'メニュー　　：歩いている時にX・Esc',
          'ダッシュ　　：Shiftを押している間',
          '話す・調べる：目の前で決定',
          '会話を進める：決定（画面のクリックでもよい）',
        ];
    const w = 500;
    const h = lines.length * 24 + 40;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = Math.round(HEIGHT / 2 - h / 2);
    drawWindow(ctx, x, y, w, h);
    lines.forEach((line, i) => g.font.draw(ctx, line, x + 24, y + 18 + i * 24, i === 0 ? COLORS.title : COLORS.text));
  }
}
