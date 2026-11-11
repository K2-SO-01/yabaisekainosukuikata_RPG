// 「タップ（クリック）してください」の画面。ここで最初の操作を受けて、音を鳴らせるようにする
import { HEIGHT, WIDTH } from '../../config.js';
import { Scene } from '../scene.js';
import { TitleScene } from './title.js';

export class TapScene extends Scene {
  constructor() {
    super();
    this.t = 0;
    this.leaving = false;
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    if (this.leaving) return;
    if (g.input.pressed('ok') || g.input.tapped()) {
      this.leaving = true;
      g.audio.unlock();
      g.audio.warmUp('se');
      g.scenes.fadeTo(() => g.scenes.replaceAll(new TitleScene()), 300);
    }
  }

  draw(ctx) {
    ctx.fillStyle = '#1d1730';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (Math.floor(this.t / 650) % 2 === 0) {
      this.game.font.drawCentered(ctx, 'タップ（クリック）してください', WIDTH / 2, HEIGHT / 2 - 8, '#f4ead5');
    }
  }
}
