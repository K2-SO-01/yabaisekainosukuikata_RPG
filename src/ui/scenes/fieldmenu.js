// フィールドのメニュー（キャンセルで開く）：どうぐ、そうび、まほう／わざ、つよさ、せってい
import { WIDTH } from '../../config.js';
import { isDown, memberName, totalStats } from '../../core/party.js';
import { formatPlayTime } from '../../core/state.js';
import { COLORS, drawWindow } from '../draw.js';
import { Menu } from '../menu.js';
import { Scene } from '../scene.js';
import { equipMenu, itemMenu, skillMenu, StatusScene } from './menus.js';
import { SettingsScene } from './settings.js';

export class FieldMenuScene extends Scene {
  constructor({ mapProps = {} } = {}) {
    super();
    this.transparent = true;
    this.mapProps = mapProps;
    this.busy = false;
  }

  enter() {
    this.menu = new Menu({
      items: [
        { label: 'どうぐ', value: 'items' },
        { label: 'そうび', value: 'equip' },
        { label: 'まほう／わざ', value: 'skills' },
        { label: 'つよさ', value: 'status' },
        { label: 'せってい', value: 'settings' },
      ],
      x: WIDTH - 196,
      y: 16,
      width: 180,
    });
  }

  update() {
    const g = this.game;
    if (this.busy) return;
    const r = this.menu.update(g.input, g.audio);
    if (!r) return;
    if (r.type === 'cancel') return g.scenes.pop(this);
    const v = r.item.value;
    if (v === 'settings') g.scenes.push(new SettingsScene({ inGame: true }));
    else if (v === 'status') g.scenes.push(new StatusScene());
    else this.run(v === 'items' ? itemMenu(g, { mapProps: this.mapProps }) : v === 'equip' ? equipMenu(g) : skillMenu(g));
  }

  async run(promise) {
    this.busy = true;
    try {
      await promise;
    } finally {
      this.busy = false;
      this.game.input.clear();
    }
  }

  draw(ctx) {
    const g = this.game;
    const st = g.state;
    if (this.busy) return; // どうぐ・そうびなどの画面を開いている間は、メニューを隠す
    this.menu.draw(ctx, g.font);
    const n = st.party.length;
    const h = 54 + n * 26;
    const y = 360 - 16 - h;
    drawWindow(ctx, WIDTH - 236, y, 220, h);
    st.party.forEach((m, i) => {
      const s = totalStats(m, g.items);
      const ty = y + 12 + i * 26;
      g.font.draw(ctx, memberName(st, m), WIDTH - 220, ty, isDown(m) ? '#c0392b' : COLORS.text);
      g.font.draw(ctx, `HP${m.hp}/${s.hp}`, WIDTH - 130, ty, COLORS.text);
    });
    g.font.draw(ctx, `${st.gold ?? 0} ゴールド`, WIDTH - 220, y + 12 + n * 26, COLORS.text);
    g.font.draw(ctx, `プレイ時間 ${formatPlayTime(st.playTimeMs)}`, WIDTH - 220, y + 32 + n * 26, COLORS.textDim);
  }
}
