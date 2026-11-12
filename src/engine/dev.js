// 開発用モード（URLに ?dev=1 を付けた時だけ出る）
import { deleteAllSaves } from '../core/save.js';
import { defaultSettings } from '../core/settings.js';

export class DevPanel {
  constructor(game) {
    this.game = game;
    this.frames = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.el = document.createElement('div');
    this.el.id = 'dev';
    this.el.innerHTML = `
      <div><b>開発用モード</b></div>
      <div class="info"></div>
      <div>
        <button data-cmd="touch">画面ボタンを出す／隠す</button>
        <button data-cmd="saves">セーブを全部消す</button>
        <button data-cmd="settings">設定を初期値にする</button>
        <button data-cmd="bot">バランス確認ボット</button>
        <button data-cmd="hide">この窓を小さく</button>
      </div>
      <div>曲を聞く：<select class="bgmlist"></select>
        <button data-cmd="bgmPlay">鳴らす</button>
        <button data-cmd="bgmEnd">くり返しの8秒前へ</button>
        <button data-cmd="bgmStop">止める</button>
      </div>
      <div class="missing"></div>`;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.command(e.target?.dataset?.cmd));
    this.game.assets.listeners.add(() => this.renderMissing());
    this.renderMissing();
  }

  command(cmd) {
    const g = this.game;
    if (cmd === 'bot') {
      window.open('tools/bot.html', '_blank');
    } else if (cmd === 'touch') {
      g.screen.forceTouch = !g.screen.forceTouch;
      g.screen.layout();
    } else if (cmd === 'saves') {
      deleteAllSaves(g.store);
      this.flash('セーブを全部消しました');
    } else if (cmd === 'settings') {
      g.settings = defaultSettings();
      g.saveSettings();
      g.audio.setVolumes(g.settings.bgm, g.settings.se);
      g.screen.layout();
      this.flash('設定を初期値にしました');
    } else if (cmd === 'bgmPlay') {
      g.audio.unlock();
      g.audio.playBgm(this.el.querySelector('.bgmlist').value, { restart: true, fadeMs: 100 });
    } else if (cmd === 'bgmEnd') {
      const s = g.audio.bgm;
      if (s) {
        const pos = Math.max(s.a, s.b - s.def.overlap - 8);
        g.audio.stopBgm(30);
        g.audio.startBgm(s.name, s.def, s.buf, pos, 30);
      }
    } else if (cmd === 'bgmStop') {
      g.audio.stopBgm(200);
    } else if (cmd === 'hide') {
      this.el.classList.toggle('small');
      const small = this.el.classList.contains('small');
      for (const child of this.el.children) if (child !== this.el.firstElementChild) child.style.display = small ? 'none' : '';
    }
  }

  flash(text) {
    this.message = text;
    this.messageUntil = performance.now() + 2500;
  }

  renderMissing() {
    const list = this.game.assets.missing;
    const box = this.el.querySelector('.missing');
    box.textContent = '';
    if (!list.length) {
      box.textContent = '見つからないファイル：なし';
      return;
    }
    const title = document.createElement('div');
    title.textContent = `見つからないファイル（${list.length}）`;
    box.appendChild(title);
    for (const m of list) {
      const line = document.createElement('div');
      line.textContent = `・${m.kind}：${m.path}`;
      box.appendChild(line);
    }
  }

  // 「曲を聞く」の一覧（ゲームで使う曲の名前。設定つきの名前も含む）
  fillBgmList(list) {
    const a = this.game.audio;
    const names = new Set(a.bgmDefs.keys());
    for (const key of a.paths.keys()) if (key.startsWith('bgm/')) names.add(key.slice(4));
    for (const name of [...names].sort()) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = name;
      list.appendChild(o);
    }
  }

  tick(dt) {
    const list = this.el.querySelector('.bgmlist');
    if (!list.options.length && this.game.audio.paths.size) this.fillBgmList(list);
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 500) return;
    this.fps = Math.round((this.frames * 1000) / this.elapsed);
    this.frames = 0;
    this.elapsed = 0;
    const g = this.game;
    const scenes = g.scenes?.stack.map((s) => s.constructor.name).join(' > ') ?? '';
    const loc = g.state?.location;
    const lines = [
      `FPS：${this.fps}　拡大：${typeof g.screen.scale === 'number' ? g.screen.scale.toFixed(2) : g.screen.scale}倍`,
      `場面：${scenes}`,
      `保存：${g.store.available ? 'localStorage' : '使えない（保存されません）'}`,
      loc ? `位置：${loc.map} (${loc.x}, ${loc.y}) ${loc.dir}` : '位置：-',
    ];
    if (this.message && performance.now() < this.messageUntil) lines.push(`→ ${this.message}`);
    this.el.querySelector('.info').innerHTML = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
