// 休む：画面が暗くなり、黒い背景にセリフが1つ出て、朝になる
import { HEIGHT, WIDTH } from '../../config.js';
import { MessageScene } from '../message.js';
import { Scene } from '../scene.js';

const OUT_MS = 500;
const IN_MS = 700;

export class RestScene extends Scene {
  constructor({ lines, onDone }) {
    super();
    this.transparent = true;
    this.lines = lines;
    this.onDone = onDone;
    this.phase = 'out';
    this.t = 0;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.phase === 'out' && this.t >= OUT_MS) {
      this.phase = 'talk';
      g.audio.playJingle('jingle_inn');
      g.scenes.push(
        new MessageScene(this.lines, {
          onDone: () => {
            this.phase = 'in';
            this.t = 0;
          },
        }),
      );
    } else if (this.phase === 'in' && this.t >= IN_MS) {
      g.scenes.pop(this);
      this.onDone?.();
    }
  }

  draw(ctx) {
    const a = this.phase === 'out' ? Math.min(1, this.t / OUT_MS) : this.phase === 'in' ? 1 - Math.min(1, this.t / IN_MS) : 1;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
