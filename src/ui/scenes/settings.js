// せってい（タイトル画面と、フィールドのメニューから開く）
import { HEIGHT, WIDTH } from '../../config.js';
import { ANIM_SPEED_LABELS, TEXT_SPEED_LABELS } from '../../core/settings.js';
import { COLORS, drawCursor, drawWindow } from '../draw.js';
import { ChoiceScene } from '../menu.js';
import { Scene } from '../scene.js';
import { TextIOScene } from '../textio.js';

const ROW_H = 25;

export class SettingsScene extends Scene {
  constructor({ inGame = false } = {}) {
    super();
    this.transparent = true;
    this.inGame = inGame;
    this.index = 0;
  }

  enter() {
    const g = this.game;
    this.rows = [
      { key: 'bgm', label: 'BGMの音量', type: 'num', min: 0, max: 10 },
      { key: 'se', label: '効果音の音量', type: 'num', min: 0, max: 10 },
      { key: 'textSpeed', label: '文字の速さ', type: 'choice', options: TEXT_SPEED_LABELS },
      { key: 'animSpeed', label: '戦闘アニメの速さ', type: 'choice', options: ANIM_SPEED_LABELS },
      g.screen.touchEnabled ? { key: 'swapButtons', label: 'ボタン配置', type: 'bool', options: ['ふつう', '左右反転'] } : null,
      { key: 'help', label: 'そうさ', type: 'action' },
      { key: 'export', label: 'セーブの書き出し', type: 'action' },
      { key: 'import', label: 'セーブの読み込み', type: 'action' },
      this.inGame ? { key: 'title', label: 'タイトルにもどる', type: 'action' } : null,
      { key: 'back', label: 'もどる', type: 'action' },
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

  update() {
    const g = this.game;
    const input = g.input;
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
    const w = 420;
    const h = this.rows.length * ROW_H + 56;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = Math.round(HEIGHT / 2 - h / 2);
    drawWindow(ctx, x, y, w, h);
    g.font.draw(ctx, 'せってい', x + 22, y + 14, COLORS.title);
    this.rows.forEach((row, i) => {
      const ty = y + 44 + i * ROW_H;
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
    if (input.pressed('ok') || input.pressed('cancel')) {
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
          '移動　　　　　：左の十字キー',
          '決定　　　　　：決定ボタン',
          'キャンセル　　：キャンセルボタン',
          'メニュー　　　：歩いている時にキャンセルボタン',
          'ダッシュ　　　：ダッシュボタンで、走る・歩くを切りかえ',
          '人と話す・調べる：目の前で決定ボタン',
        ]
      : [
          'パソコンの操作',
          '',
          '移動　　　　　：矢印キー',
          '決定　　　　　：Enter・Z・スペース',
          'キャンセル　　：X・Esc',
          'メニュー　　　：歩いている時にX・Esc',
          'ダッシュ　　　：Shiftを押している間',
          '人と話す・調べる：目の前で決定',
        ];
    const w = 470;
    const h = lines.length * 24 + 40;
    const x = Math.round(WIDTH / 2 - w / 2);
    const y = Math.round(HEIGHT / 2 - h / 2);
    drawWindow(ctx, x, y, w, h);
    lines.forEach((line, i) => g.font.draw(ctx, line, x + 24, y + 18 + i * 24, i === 0 ? COLORS.title : COLORS.text));
  }
}
