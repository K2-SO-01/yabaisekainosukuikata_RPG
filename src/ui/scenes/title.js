// タイトル画面（段階2で、ぴぽやのタイルで描いた城下町の背景に仕上げる）
import { HEIGHT, WIDTH } from '../../config.js';
import { hasAnySave } from '../../core/save.js';
import { createNewGame } from '../../core/state.js';
import { COLORS, drawSkyGradient } from '../draw.js';
import { Menu } from '../menu.js';
import { Scene } from '../scene.js';
import { FieldScene } from './field.js';
import { SaveLoadScene } from './saveload.js';
import { SettingsScene } from './settings.js';

export class TitleScene extends Scene {
  enter() {
    this.t = 0;
    this.game.state = null;
    this.makeMenu();
    this.game.audio.playBgm('title');
  }

  resume() {
    this.makeMenu();
    this.game.audio.playBgm('title');
  }

  makeMenu() {
    const hasSave = hasAnySave(this.game.store);
    const prev = this.menu?.index;
    this.menu = new Menu({
      items: [
        { label: 'はじめから', value: 'new', se: 'start' },
        { label: 'つづきから', value: 'continue', se: 'start', disabled: !hasSave },
        { label: 'せってい', value: 'settings' },
      ],
      x: WIDTH / 2 - 84,
      y: 222,
      width: 168,
      cancelable: false,
      index: prev ?? (hasSave ? 1 : 0),
    });
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const r = this.menu.update(g.input, g.audio);
    if (!r || r.type !== 'select') return;
    if (r.item.value === 'new') {
      g.scenes.fadeTo(() => {
        g.state = createNewGame();
        g.scenes.replaceAll(new FieldScene());
      }, 400);
    } else if (r.item.value === 'continue') {
      g.scenes.push(new SaveLoadScene({ mode: 'load' }));
    } else if (r.item.value === 'settings') {
      g.scenes.push(new SettingsScene({ inGame: false }));
    }
  }

  draw(ctx) {
    drawSkyGradient(ctx, WIDTH, HEIGHT, '#bfe4f6', '#fde9d6');
    // 遠くの空だけ暗い（魔王のいる南東）
    const dark = ctx.createLinearGradient(WIDTH * 0.55, 0, WIDTH, 0);
    dark.addColorStop(0, 'rgba(70, 50, 110, 0)');
    dark.addColorStop(1, 'rgba(70, 50, 110, 0.55)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, WIDTH, 220);
    // 丘
    ctx.fillStyle = '#b7dca0';
    for (let x = 0; x < WIDTH; x += 2) {
      const h = 40 + Math.sin(x / 90) * 12 + Math.sin(x / 37) * 4;
      ctx.fillRect(x, HEIGHT - 120 - h, 2, h + 120);
    }
    ctx.fillStyle = '#9ccc85';
    for (let x = 0; x < WIDTH; x += 2) {
      const h = 22 + Math.sin(x / 60 + 1) * 8;
      ctx.fillRect(x, HEIGHT - 70 - h, 2, h + 70);
    }
    // タイトル
    const title = 'ヤバい世界の救い方';
    const tw = this.game.fontBig.width(title);
    const tx = Math.round(WIDTH / 2 - tw / 2);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
      this.game.fontBig.draw(ctx, title, tx + dx, 92 + dy, '#fff7e6');
    }
    this.game.fontBig.draw(ctx, title, tx, 92, COLORS.title);
    if (this.game.scenes.top === this) this.menu.draw(ctx, this.game.font);
  }
}
