// BGM・効果音。スマホ（特にiPhone）は最初のタップまで音が出せないので、unlock() で鳴らし始める
// ファイルが見つからない時は、無音のまま動き続ける

export class AudioSys {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.paths = new Map(); // 'bgm/title' → ファイルの場所
    this.raw = new Map(); // まだ音にしていないデータ
    this.buffers = new Map(); // すぐ鳴らせる音
    this.loading = new Map();
    this.bgm = null; // 今流れているBGM
    this.wantBgm = null; // 流したいBGMの名前
    this.bgmVol = 0.7;
    this.seVol = 0.7;
    this.unlocked = false;
    this.lastSeAt = new Map();
  }

  register(kind, name, path) {
    this.paths.set(`${kind}/${name}`, path);
  }

  async prefetch(key) {
    const path = this.paths.get(key);
    if (!path || this.raw.has(key) || this.buffers.has(key)) return;
    const data = await this.assets.fetchBinary(path);
    this.raw.set(key, data);
  }

  // 最初のタップ・クリック・キー入力の時に呼ぶ（その場で呼ばないとiPhoneでは音が出ない）
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
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
    if (this.bgm && this.ctx) this.bgm.gain.gain.setTargetAtTime(this.bgmVol, this.ctx.currentTime, 0.05);
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
    const buf = await this.ensure(`bgm/${name}`);
    if (!buf || this.wantBgm !== name) return;
    this.wantBgm = null;
    this.bgm = this.startLoop(name, buf, 0, fadeMs);
  }

  startLoop(name, buf, offset, fadeMs) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.bgmVol, t + Math.max(0.01, fadeMs / 1000));
    src.connect(gain).connect(this.ctx.destination);
    const start = offset % buf.duration;
    src.start(t, start);
    return { name, src, gain, buf, startedAt: t, offset: start };
  }

  stopBgm(fadeMs = 500) {
    const b = this.bgm;
    this.bgm = null;
    if (!b || !this.ctx) return;
    const t = this.ctx.currentTime;
    const end = t + Math.max(0.01, fadeMs / 1000);
    b.gain.gain.cancelScheduledValues(t);
    b.gain.gain.setValueAtTime(b.gain.gain.value, t);
    b.gain.gain.linearRampToValueAtTime(0, end);
    try {
      b.src.stop(end + 0.05);
    } catch {
      /* もう止まっている */
    }
  }

  // ジングル（1回だけ流す曲）。終わったら元のBGMの続きに戻る
  async playJingle(name) {
    if (!this.unlocked || !this.ctx) return;
    const resume = this.bgm
      ? { name: this.bgm.name, buf: this.bgm.buf, pos: (this.ctx.currentTime - this.bgm.startedAt + this.bgm.offset) % this.bgm.buf.duration }
      : null;
    this.stopBgm(150);
    const buf = await this.ensure(`bgm/${name}`);
    const back = () => {
      if (resume && !this.bgm && !this.wantBgm) this.bgm = this.startLoop(resume.name, resume.buf, resume.pos, 700);
    };
    if (!buf) return back();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = this.bgmVol;
    src.connect(gain).connect(this.ctx.destination);
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
