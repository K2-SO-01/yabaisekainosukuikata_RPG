// フィールドのメニュー（キャンセルで開く）：どうぐ、そうび、まほう／わざ、つよさ、せってい
import { WIDTH } from '../../config.js';
import { characterIdOf, expToNext, isDown, JOB_NAMES, memberName, MAX_LEVEL, totalStats } from '../../core/party.js';
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

  // メニューを開くだけで、仲間みんなの様子が見える（顔・職業・レベル・HP・MP・次のレベルまで・状態異常）
  draw(ctx) {
    const g = this.game;
    const st = g.state;
    if (this.busy) return; // どうぐ・そうびなどの画面を開いている間は、メニューを隠す
    this.menu.draw(ctx, g.font);
    const cardW = WIDTH - 236;
    const cardH = 96;
    st.party.forEach((m, i) => {
      const s = totalStats(m, g.items);
      const x = 12;
      const y = 12 + i * (cardH + 6);
      const down = isDown(m);
      drawWindow(ctx, x, y, cardW, cardH);
      const face = g.faces?.get(characterIdOf(st, m));
      ctx.globalAlpha = down ? 0.4 : 1;
      if (face) ctx.drawImage(face, x + 10, y + 10, 63, 63);
      ctx.globalAlpha = 1;
      const tx = x + 84;
      const nx = g.font.draw(ctx, memberName(st, m), tx, y + 9, down ? '#ff6a5a' : COLORS.title);
      g.font.draw(ctx, `${JOB_NAMES[m.job] ?? ''}  Lv${m.level}`, nx + 12, y + 9, COLORS.textDim);
      const bar = (label, v, max, by, color) => {
        g.font.draw(ctx, `${label} ${Math.max(0, v)}/${max}`, tx, by, COLORS.text);
        const bx = tx + 150;
        const bw = cardW - 84 - 150 - 14;
        ctx.fillStyle = '#0a0e22';
        ctx.fillRect(bx, by + 6, bw, 6);
        ctx.fillStyle = color;
        ctx.fillRect(bx, by + 6, Math.round((bw * Math.max(0, v)) / Math.max(1, max)), 6);
      };
      bar('HP', m.hp, s.hp, y + 31, m.hp / s.hp < 0.25 ? '#e85a4f' : '#5fbf6a');
      bar('MP', m.mp, s.mp, y + 51, '#5a8ae8');
      // 次のレベルまで・状態異常（右下）
      const info = m.level >= MAX_LEVEL ? 'レベル最大' : `次まで ${expToNext(m.level) - m.exp}`;
      const ail = (m.ailments ?? []).map((a) => ({ poison: '毒', burn: 'やけど' })[a]).filter(Boolean).join('・');
      const right = ail ? `${ail}  ${info}` : info;
      g.font.draw(ctx, right, x + cardW - 14 - g.font.width(right), y + 9 + 62, ail ? '#d8a0ff' : COLORS.textDim);
    });
    // お金とプレイ時間（メニューの下）
    const py = 16 + 5 * 24 + 40;
    drawWindow(ctx, WIDTH - 196, py, 180, 58);
    g.font.draw(ctx, `${st.gold ?? 0} G`, WIDTH - 180, py + 10, COLORS.text);
    g.font.draw(ctx, `時間 ${formatPlayTime(st.playTimeMs)}`, WIDTH - 180, py + 32, COLORS.textDim);
  }
}
