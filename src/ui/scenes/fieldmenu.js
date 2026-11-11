// フィールドのメニュー（キャンセルで開く）。段階1では「せってい」だけ使える
import { WIDTH } from '../../config.js';
import { formatPlayTime } from '../../core/state.js';
import { COLORS, drawWindow } from '../draw.js';
import { Menu } from '../menu.js';
import { Scene } from '../scene.js';
import { SettingsScene } from './settings.js';

export class FieldMenuScene extends Scene {
  constructor() {
    super();
    this.transparent = true;
  }

  enter() {
    this.menu = new Menu({
      items: [
        { label: 'どうぐ', value: 'items', disabled: true },
        { label: 'そうび', value: 'equip', disabled: true },
        { label: 'まほう／わざ', value: 'skills', disabled: true },
        { label: 'つよさ', value: 'status', disabled: true },
        { label: 'せってい', value: 'settings' },
      ],
      x: WIDTH - 196,
      y: 16,
      width: 180,
      index: 4,
    });
  }

  update() {
    const g = this.game;
    const r = this.menu.update(g.input, g.audio);
    if (!r) return;
    if (r.type === 'cancel') g.scenes.pop(this);
    else if (r.item.value === 'settings') g.scenes.push(new SettingsScene({ inGame: true }));
  }

  draw(ctx) {
    const g = this.game;
    this.menu.draw(ctx, g.font);
    const st = g.state;
    drawWindow(ctx, WIDTH - 196, 176, 180, 62);
    g.font.draw(ctx, st.player.name, WIDTH - 178, 190, COLORS.text);
    g.font.draw(ctx, `プレイ時間 ${formatPlayTime(st.playTimeMs)}`, WIDTH - 178, 212, COLORS.textDim);
  }
}
