// エンディングの場面：黒い画面の文字（仲間のその後）、エンドロール、「おわり」
import { HEIGHT, WIDTH } from '../../config.js';
import { memberName } from '../../core/party.js';
import { TEXT_SPEED_CPS } from '../../core/settings.js';
import { formatPlayTime } from '../../core/state.js';
import { fillName, wrapText } from '../../core/text.js';
import { Scene } from '../scene.js';

const LINE_H = 32;

// 黒い画面に白い文字を1つずつ（プロローグと同じ見せ方）。長い文は折り返す
export class BlackTextScene extends Scene {
  constructor(lines, onDone) {
    super();
    this.raw = lines;
    this.onDone = onDone;
  }

  enter() {
    const g = this.game;
    this.items = this.raw.map((l) => wrapText(fillName(l, g.state.player.name), WIDTH - 80, (s) => g.font.width(s)));
    this.index = 0;
    this.shown = 0;
    this.blink = 0;
  }

  update(dt) {
    const g = this.game;
    const total = this.items[this.index].reduce((n, l) => n + Array.from(l).length, 0);
    const next = g.input.pressed('ok') || g.input.tapped();
    if (this.shown < total) {
      const cps = TEXT_SPEED_CPS[g.settings.textSpeed];
      if (next || cps === Infinity) this.shown = total;
      else this.shown = Math.min(total, this.shown + (Math.min(cps, 18) * dt) / 1000);
      return;
    }
    this.blink += dt;
    if (!next) return;
    if (this.index + 1 < this.items.length) {
      this.index++;
      this.shown = 0;
      this.blink = 0;
    } else {
      g.scenes.pop(this);
      this.onDone?.();
    }
  }

  draw(ctx) {
    const g = this.game;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const rows = this.items.slice(0, this.index + 1).flat().length;
    let y = Math.round((HEIGHT - rows * LINE_H) / 2) + 4;
    this.items.slice(0, this.index + 1).forEach((lines, i) => {
      let remaining = i === this.index ? Math.floor(this.shown) : Infinity;
      for (const line of lines) {
        if (remaining <= 0) break;
        g.font.draw(ctx, line, Math.round(WIDTH / 2 - g.font.width(line) / 2), y, '#ffffff', remaining);
        remaining -= Array.from(line).length;
        y += LINE_H;
      }
      y += 8;
    });
  }
}

// エンドロール：スタッフと冒険の記録が下から上へ流れ、最後にフィクション表記（企画書12章）
const STAFF = [
  ['企画・原案', 'ゆうしゃのたまご'], ['キャラクター', 'ゆうしゃのたまご'], ['ゲームデザイン', 'ゆうしゃのたまご'],
  ['シナリオ協力・企画書', 'Claude'], ['プログラム', 'Claude'], ['グラフィック素材', 'ぴぽや、いらすとや'], ['追加グラフィック', 'Claude'],
  ['音楽', '魔王魂'], ['楽曲提供', 'Gemini'], ['効果音', '効果音ラボ'], ['フォント', 'DotGothic16（Fontworks）'],
  ['テストプレイ', 'ボット'], ['スペシャルサンクス', '遊んでくれたあなた'],
];

export class EndRollScene extends Scene {
  constructor(onDone) {
    super();
    this.onDone = onDone;
  }

  enter() {
    const g = this.game;
    const st = g.state;
    const s = st.stats ?? {};
    const rows = [['', 'ヤバい世界の救い方'], ['', ''], ['', '― スタッフ ―'], ['', '']];
    for (const [k, v] of STAFF) rows.push([k, ''], ['', v], ['', '']);
    rows.push(['', ''], ['', '― 冒険の記録 ―'], ['', '']);
    rows.push(['プレイ時間', formatPlayTime(st.playTimeMs)], ['倒した敵の数', `${s.totalKills ?? 0}`]);
    rows.push(['一番多く倒した敵', s.topKill ? `${s.topKill.name}（${s.topKill.n}）` : '－'], ['稼いだお金の合計', `${s.goldEarned ?? 0} ゴールド`]);
    rows.push(['全滅した回数', `${s.defeats ?? 0}`]);
    for (const m of st.party) rows.push([`${memberName(st, m)}の レベル`, `${m.level}`]);
    rows.push(['', ''], ['', ''], ['', 'この作品はフィクションであり、'], ['', '実在の人物・団体とは関係ありません']);
    this.rows = rows;
    this.y = HEIGHT + 20;
    this.endY = -(rows.length * 30) + HEIGHT / 2 - 40;
    this.hold = 0;
    g.audio.playBgm('ending');
  }

  update(dt) {
    const g = this.game;
    const fast = g.input.isDown('ok') ? 4 : 1;
    if (this.y > this.endY) this.y -= (dt / 1000) * 38 * fast;
    else {
      this.hold += dt;
      if (this.hold > 2500 || g.input.pressed('ok') || g.input.tapped()) {
        g.scenes.pop(this);
        this.onDone?.();
      }
    }
  }

  draw(ctx) {
    const g = this.game;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.rows.forEach(([k, v], i) => {
      const y = Math.round(this.y + i * 30);
      if (y < -30 || y > HEIGHT) return;
      if (k && v) {
        g.font.draw(ctx, k, WIDTH / 2 - 20 - g.font.width(k), y, '#c8c0e0');
        g.font.draw(ctx, v, WIDTH / 2 + 20, y, '#ffffff');
      } else if (k) g.font.drawCentered(ctx, k, WIDTH / 2, y, '#c8c0e0');
      else if (v) g.font.drawCentered(ctx, v, WIDTH / 2, y, '#ffffff');
    });
  }
}

// 「おわり」を出して、タイトルへ
export class TheEndScene extends Scene {
  constructor(onDone) {
    super();
    this.onDone = onDone;
    this.t = 0;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.t > 1500 && (g.input.pressed('ok') || g.input.tapped() || this.t > 9000)) {
      this.t = -1e9;
      this.onDone?.();
    }
  }

  draw(ctx) {
    const g = this.game;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = Math.max(0, Math.min(1, this.t / 1200));
    g.font.drawCentered(ctx, 'おわり', WIDTH / 2, HEIGHT / 2 - 10, '#ffffff');
    ctx.globalAlpha = 1;
  }
}
