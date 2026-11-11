// BGM・効果音。スマホ（特にiPhone）は最初のタップまで音が出せないので、unlock() で鳴らし始める
// ファイルが見つからない時は、無音のまま動き続ける
//
// BGMは「曲の名前」で鳴らす。名前ごとの設定（data/manifest.json の bgmSettings）で、
// どのファイルのどの部分を、どの音量で、どうくり返すかを決められる（どれも省略できる）：
//   file    : 使うファイルの名前（省略すると、曲の名前と同じ）
//   start   : 使い始める位置（秒）      end : 使い終わる位置（秒。省略すると最後まで）
//   gain    : 音量の倍率（1がそのまま）
//   loop    : "loop"    … start〜end を、すき間なくくり返す（省略した時はこれ）
//             "restart" … end の overlap 秒前に、次の回を start から重ねて始める
//             "none"    … 1回だけ鳴らす
//   overlap : "restart" の時に、次の回を何秒早く始めるか
//   fadeIn  : 次の回の音を上げる長さ（秒。省略すると overlap と同じ）
//   fadeOut : 前の回の音を下げる長さ（秒。省略すると overlap と同じ。0なら end まで自然に鳴らす）

const LOOKAHEAD = 3; // 次の回を、何秒前に予約するか

export class AudioSys {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.bgmOut = null; // BGM全体の音量
    this.paths = new Map(); // 'bgm/title' → ファイルの場所
    this.raw = new Map(); // まだ音にしていないデータ
    this.buffers = new Map(); // すぐ鳴らせる音
    this.loading = new Map();
    this.bgmDefs = new Map(); // 曲の名前 → 設定
    this.bgm = null; // 今流れているBGM { name, def, buf, a, b, voices, timer }
    this.wantBgm = null; // 流したいBGMの名前
    this.bgmVol = 0.7;
    this.seVol = 0.7;
    this.unlocked = false;
    this.lastSeAt = new Map();
  }

  register(kind, name, path) {
    this.paths.set(`${kind}/${name}`, path);
  }

  configureBgm(settings) {
    for (const [name, s] of Object.entries(settings ?? {})) this.bgmDefs.set(name, s);
  }

  bgmDef(name) {
    const s = this.bgmDefs.get(name) ?? {};
    const overlap = s.overlap ?? 0;
    return {
      file: s.file ?? name,
      start: s.start ?? 0,
      end: s.end ?? null,
      gain: s.gain ?? 1,
      loop: s.loop ?? 'loop',
      overlap,
      fadeIn: s.fadeIn ?? overlap,
      fadeOut: s.fadeOut ?? overlap,
    };
  }

  prefetchBgm(name) {
    return this.prefetch(`bgm/${this.bgmDef(name).file}`);
  }

  async prefetch(key) {
    const path = this.paths.get(key);
    if (!path || this.raw.has(key) || this.buffers.has(key)) return;
    const data = await this.assets.fetchBinary(path);
    this.raw.set(key, data);
  }

  // 最初のタップ・クリック・キー入力の時に呼ぶ（その場で呼ばないとiPhoneでは音が出ない）
  unlock() {
    if (!this.prepare()) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (!this.unlocked) {
      this.unlocked = true;
      if (this.wantBgm) {
        const name = this.wantBgm;
        this.wantBgm = null;
        this.playBgm(name);
      }
    }
  }

  // 音の準備（読み込みの時に呼ぶ。音を出せるようになる前でも、曲を先に準備しておける）
  prepare() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }
    this.bgmOut = this.ctx.createGain();
    this.bgmOut.gain.value = this.bgmVol;
    this.bgmOut.connect(this.ctx.destination);
    return true;
  }

  ensureBgm(name) {
    return this.ensure(`bgm/${this.bgmDef(name).file}`);
  }

  async ensure(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (!this.ctx) return null;
    if (this.loading.has(key)) return this.loading.get(key);
    const job = (async () => {
      if (!this.raw.has(key)) await this.prefetch(key);
      const data = this.raw.get(key);
      if (!data) return null;
      try {
        const buf = await this.ctx.decodeAudioData(data.slice(0));
        this.buffers.set(key, buf);
        this.raw.delete(key);
        return buf;
      } catch {
        this.assets.noteMissing(this.paths.get(key) ?? key, '音（読めない形式）');
        return null;
      }
    })();
    this.loading.set(key, job);
    const result = await job;
    this.loading.delete(key);
    return result;
  }

  setVolumes(bgm10, se10) {
    this.bgmVol = bgm10 / 10;
    this.seVol = se10 / 10;
    if (this.bgmOut) this.bgmOut.gain.setTargetAtTime(this.bgmVol, this.ctx.currentTime, 0.05);
  }

  get currentBgm() {
    return this.bgm?.name ?? this.wantBgm;
  }

  async playBgm(name, { fadeMs = 500, restart = false } = {}) {
    if (!this.unlocked || !this.ctx) {
      this.wantBgm = name;
      return;
    }
    if (!restart && this.bgm && this.bgm.name === name) return;
    this.wantBgm = name;
    this.stopBgm(fadeMs);
    const def = this.bgmDef(name);
    const buf = await this.ensure(`bgm/${def.file}`);
    if (!buf || this.wantBgm !== name) return;
    this.wantBgm = null;
    this.startBgm(name, def, buf, null, fadeMs);
  }

  // position：途中から始める時の位置（秒）。null なら設定の start から
  startBgm(name, def, buf, position, fadeMs) {
    const a = Math.min(Math.max(0, def.start), Math.max(0, buf.duration - 0.1));
    const b = Math.max(a + 0.1, Math.min(def.end ?? buf.duration, buf.duration));
    const state = { name, def, buf, a, b, voices: [], timer: null };
    this.bgm = state;
    const inRange = position != null && position >= a && position < b - def.overlap - 0.1;
    const voice = this.addVoice(state, this.ctx.currentTime + 0.02, inRange ? position : a, Math.max(0.01, fadeMs / 1000));
    if (def.loop === 'restart') this.scheduleRestart(state, voice);
    return state;
  }

  addVoice(state, when, offset, fadeIn) {
    const src = this.ctx.createBufferSource();
    src.buffer = state.buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(state.def.gain, when + Math.max(0.005, fadeIn));
    src.connect(gain).connect(this.bgmOut);
    if (state.def.loop === 'loop') {
      src.loop = true;
      src.loopStart = state.a;
      src.loopEnd = state.b;
      src.start(when, offset);
    } else {
      src.start(when, offset, state.b - offset);
    }
    const voice = { src, gain, when, offset, endAt: when + (state.b - offset) };
    state.voices.push(voice);
    src.onended = () => {
      const i = state.voices.indexOf(voice);
      if (i >= 0) state.voices.splice(i, 1);
    };
    return voice;
  }

  // "restart" のくり返し：今の回が終わる少し前に、次の回を予約する
  scheduleRestart(state, voice) {
    const d = state.def;
    if (state.b - state.a - d.overlap < 0.25) return; // 短すぎる時はくり返さない
    const tx = voice.endAt - d.overlap; // 次の回を始める時刻
    const delay = Math.max(0, (tx - this.ctx.currentTime - LOOKAHEAD) * 1000);
    state.timer = setTimeout(() => {
      if (this.bgm !== state) return;
      const t = Math.max(tx, this.ctx.currentTime + 0.02);
      if (d.fadeOut > 0) {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(d.gain, t);
        voice.gain.gain.linearRampToValueAtTime(0, t + d.fadeOut);
        try {
          voice.src.stop(t + d.fadeOut + 0.02);
        } catch {
          /* もう止まっている */
        }
      }
      const next = this.addVoice(state, t, state.a, d.fadeIn);
      this.scheduleRestart(state, next);
    }, delay);
  }

  stopBgm(fadeMs = 500) {
    const state = this.bgm;
    this.bgm = null;
    if (!state || !this.ctx) return;
    clearTimeout(state.timer);
    const t = this.ctx.currentTime;
    const end = t + Math.max(0.01, fadeMs / 1000);
    for (const v of state.voices) {
      try {
        if (v.when > t) {
          v.src.stop(); // まだ鳴り始めていない予約は取り消す
          continue;
        }
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0, end);
        v.src.stop(end + 0.05);
      } catch {
        /* もう止まっている */
      }
    }
  }

  // 今流れているBGMの、ファイルの中での位置（秒）
  bgmPosition() {
    const s = this.bgm;
    if (!s || !this.ctx) return null;
    const t = this.ctx.currentTime;
    let v = null;
    for (const x of s.voices) if (x.when <= t && (!v || x.when > v.when)) v = x;
    if (!v) return null;
    let pos = v.offset + (t - v.when);
    if (s.def.loop === 'loop') pos = s.a + ((pos - s.a) % (s.b - s.a));
    return pos;
  }

  // ジングル（1回だけ流す曲）。終わったら元のBGMの続きに戻る
  async playJingle(name) {
    if (!this.unlocked || !this.ctx) return;
    const resume = this.bgm ? { name: this.bgm.name, def: this.bgm.def, buf: this.bgm.buf, pos: this.bgmPosition() } : null;
    this.stopBgm(150);
    const def = this.bgmDef(name);
    const buf = await this.ensure(`bgm/${def.file}`);
    const back = () => {
      if (resume && !this.bgm && !this.wantBgm) this.startBgm(resume.name, resume.def, resume.buf, resume.pos, 700);
    };
    if (!buf) return back();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = def.gain;
    src.connect(gain).connect(this.bgmOut);
    src.onended = back;
    src.start();
  }

  playSe(name, { minIntervalMs = 0 } = {}) {
    if (!this.unlocked || !this.ctx) return;
    const key = `se/${name}`;
    const buf = this.buffers.get(key);
    if (!buf) {
      this.ensure(key); // 次から鳴る
      return;
    }
    const now = performance.now();
    if (minIntervalMs && now - (this.lastSeAt.get(name) ?? -Infinity) < minIntervalMs) return;
    this.lastSeAt.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = this.seVol;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  // 効果音はすぐ鳴らせるように、音を出せるようになったらまとめて準備する
  async warmUp(kind) {
    const jobs = [];
    for (const key of this.paths.keys()) if (key.startsWith(`${kind}/`)) jobs.push(this.ensure(key));
    await Promise.all(jobs);
  }
}
