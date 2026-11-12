// ゲームの始まり：画面・操作・音を準備して、データを読み込み、タイトルの前の画面から始める
import { FONT_FAMILY, FONT_PATH, HEIGHT, WIDTH } from './config.js';
import { parseTiledMap } from './core/map.js';
import { partnerOf } from './core/party.js';
import { loadSettings, saveSettings } from './core/settings.js';
import { Assets, resolvePath } from './engine/assets.js';
import { AudioSys } from './engine/audio.js';
import { DevPanel } from './engine/dev.js';
import { Input } from './engine/input.js';
import { Screen } from './engine/screen.js';
import { createStore } from './engine/storage.js';
import { PixelFont } from './ui/font.js';
import { SceneStack } from './ui/scene.js';
import { TapScene } from './ui/scenes/tap.js';

const FACE_IDS = ['hero_m_sword', 'hero_m_mage', 'hero_f_sword', 'hero_f_mage', 'luke', 'leo_sword', 'leo_mage', 'lina_sword', 'lina_mage', 'king', 'oji', 'oba'];

const DEV = new URLSearchParams(location.search).has('dev');

async function boot() {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const store = createStore();
  const assets = new Assets();
  const game = { canvas, ctx, store, assets, isTouch, dev: DEV, state: null, settings: loadSettings(store) };
  game.saveSettings = () => saveSettings(store, game.settings);
  game.screen = new Screen({
    canvas,
    touchRoot: document.getElementById('touch'),
    rotateEl: document.getElementById('rotate'),
    isTouch,
    getSettings: () => game.settings,
  });
  game.input = new Input({ canvas, touchRoot: document.getElementById('touch') });
  game.audio = new AudioSys(assets);
  game.audio.prepare();
  game.audio.setVolumes(game.settings.bgm, game.settings.se);
  game.input.onGesture(() => game.audio.unlock());
  if (DEV) game.devPanel = new DevPanel(game);
  window.game = DEV ? game : undefined;

  drawLoading(ctx, 'よみこみ中…');
  await loadFont(assets);
  game.font = new PixelFont(FONT_FAMILY, 16);
  game.fontBig = new PixelFont(FONT_FAMILY, 32);
  await loadGameData(game);

  game.scenes = new SceneStack(game);
  game.updateMenuButton = () => updateMenuButton(game); // 開発用のテストからも呼べるように
  game.scenes.push(new TapScene());

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    try {
      game.input.update(dt);
      if (!game.screen.portrait) game.scenes.update(dt);
      updateMenuButton(game);
      useScale(ctx);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      game.scenes.draw(ctx);
      game.devPanel?.tick(dt);
    } catch (e) {
      showError(ctx, e);
      throw e;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function loadFont(assets) {
  try {
    const face = new FontFace(FONT_FAMILY, `url("${Assets.url(FONT_PATH)}")`);
    await face.load();
    document.fonts.add(face);
  } catch {
    assets.noteMissing(FONT_PATH, 'フォント');
  }
}

async function loadGameData(game) {
  const { assets, audio } = game;
  const manifest = (await assets.loadJson('manifest', 'data/manifest.json')) ?? {};
  for (const name of manifest.bgm ?? []) audio.register('bgm', name, `assets/bgm/${name}.mp3`);
  for (const name of manifest.se ?? []) audio.register('se', name, `assets/se/${name}.mp3`);
  audio.configureBgm(manifest.bgmSettings);

  const jobs = [];
  for (const name of manifest.se ?? []) jobs.push(audio.prefetch(`se/${name}`).then(() => audio.ensure(`se/${name}`)));
  for (const name of manifest.preloadBgm ?? []) jobs.push(audio.prefetchBgm(name).then(() => audio.ensureBgm(name)));

  const characters = (await assets.loadJson('characters', manifest.characters ?? 'data/characters.json')) ?? {};
  for (const k of Object.keys(characters)) if (k.startsWith('_')) delete characters[k];
  game.characters = characters;
  for (const [id, c] of Object.entries(characters)) jobs.push(assets.loadImage(`char:${id}`, c.sprite));
  // 主要キャラの顔アイコン（assets/faces、tools/draw_faces.ps1 で描いたもの）
  for (const id of FACE_IDS) jobs.push(assets.loadImage(`face:${id}`, `assets/faces/${id}.png`));
  // 道をふさぐ物（炎の銅像・看板）
  jobs.push(assets.loadImage('img:blockers', 'assets/tiles/extra/blockers.png'));

  game.dialogues = {};
  for (const [key, path] of Object.entries(manifest.dialogues ?? {})) {
    jobs.push(assets.loadJson(`dialogue:${key}`, path).then((d) => Object.assign(game.dialogues, d ?? {})));
  }

  jobs.push(assets.loadJson('items', manifest.items).then((d) => (game.items = Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => !k.startsWith('_'))))));
  jobs.push(assets.loadJson('skills', manifest.skills).then((d) => (game.skills = Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => !k.startsWith('_'))))));
  jobs.push(assets.loadJson('enemies', manifest.enemies).then(async (d) => {
    game.enemies = d ?? { areas: {}, enemies: {}, skills: {} };
    // 頭で考えるボス（裏ボス）の作戦の表
    game.enemies.brains = { shadow: await assets.loadJson('brain:shadow', 'data/brains/shadow.json') };
    await Promise.all(Object.entries(game.enemies.enemies).map(([id, e]) => assets.loadImage(`enemy:${id}`, e.image)));
  }));
  jobs.push(assets.loadJson('shops', manifest.shops).then((d) => (game.shops = d ?? {})));
  jobs.push(assets.loadJson('warps', manifest.warps).then((d) => (game.warps = d ?? {})));
  game.scripts = {};
  for (const [key, path] of Object.entries(manifest.events ?? {})) {
    jobs.push(assets.loadJson(`events:${key}`, path).then((d) => Object.assign(game.scripts, d ?? {})));
  }

  game.maps = new Map();
  for (const [id, path] of Object.entries(manifest.maps ?? {})) {
    jobs.push(
      assets.loadJson(`map:${id}`, path).then(async (json) => {
        if (!json) return;
        const map = parseTiledMap(json, id);
        map.tilesetImages = [];
        for (const ts of map.tilesets) {
          const imgPath = resolvePath(path, ts.image);
          map.tilesetImages.push({ firstgid: ts.firstgid, columns: ts.columns, frames: ts.properties?.find((p) => p.name === 'frames')?.value ?? 1, img: await assets.loadImage(`tiles:${imgPath}`, imgPath) });
        }
        game.maps.set(id, map);
      }),
    );
  }
  await Promise.all(jobs);

  // 会話の顔アイコン：主要キャラは専用の顔。ほかの人は、歩行グラフィックの顔を切り出して拡大する
  game.faces = new Map();
  for (const id of Object.keys(characters)) game.faces.set(id, makeFace(assets.image(`char:${id}`)));
  for (const id of FACE_IDS) if (assets.image(`face:${id}`)) game.faces.set(id, makePortrait(assets.image(`face:${id}`)));
  // 町の人は、男女2種類の顔を使い回す（face に書いた人の顔）
  for (const [id, c] of Object.entries(characters)) if (c.face && game.faces.has(c.face)) game.faces.set(id, game.faces.get(c.face));
  // ボスの顔：戦闘の画像を縮小して使う（企画書10章）
  for (const [id, e] of Object.entries(game.enemies?.enemies ?? {})) if (e.boss) game.faces.set(`enemy:${id}`, makeBossFace(assets.image(`enemy:${id}`)));
  const BOSS_FACE = { 水の四天王: 'boss_water', 風の四天王: 'boss_wind', 炎の四天王: 'boss_fire', 雷の四天王: 'boss_thunder', 魔王: 'demon1' };

  // レオ／リナのセリフの出し分け：主人公の性別と職業で、4パターン（leo_sword など）か2パターン（leo / lina）から選ぶ
  game.partner = () => partnerOf(game.state);
  game.pick = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap((e) => game.pick(e) ?? []);
    const p = game.partner();
    return game.pick(v[p.key] ?? v[p.name] ?? null);
  };

  game.speakerInfo = (speaker) => {
    if (speaker === '主人公' && game.state) {
      const p = game.state.player;
      return { faceKey: `hero_${p.gender === 'female' ? 'f' : 'm'}_${p.job === 'mage' ? 'mage' : 'sword'}`, showName: true, displayName: p.name };
    }
    if ((speaker === 'レオ' || speaker === 'リナ') && game.state) return { faceKey: game.partner().key, showName: true };
    if (BOSS_FACE[speaker]) return { faceKey: `enemy:${BOSS_FACE[speaker]}`, showName: true };
    if (speaker === '影の勇者' && game.state) {
      const p = game.state.player;
      return { faceKey: `enemy:shadow_${p.gender === 'female' ? 'f' : 'm'}_${p.job === 'mage' ? 'mage' : 'sword'}`, showName: true };
    }
    for (const [id, c] of Object.entries(characters)) {
      if (c.name === speaker) return { faceKey: id, showName: c.main === true };
    }
    return { faceKey: null, showName: true };
  };
}

// ボスの顔：画像の透明でない部分を、63×63に収まるように縮める
function makeBossFace(img) {
  const c = document.createElement('canvas');
  c.width = 63;
  c.height = 63;
  const x = c.getContext('2d');
  x.fillStyle = '#f3e3c5';
  x.fillRect(0, 0, 63, 63);
  if (!img) return c;
  const t = document.createElement('canvas');
  t.width = img.width;
  t.height = img.height;
  const tx = t.getContext('2d');
  tx.drawImage(img, 0, 0);
  const d = tx.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let yy = 0; yy < t.height; yy += 2) for (let xx = 0; xx < t.width; xx += 2) if (d[(yy * t.width + xx) * 4 + 3] > 20) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
  // 上の方（顔のあたり）を中心に、正方形で切り取る
  const side = Math.min(x1 - x0, y1 - y0) * 0.8;
  const sx = (x0 + x1) / 2 - side / 2;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, sx, y0, side, side, 2, 2, 59, 59);
  return c;
}

// 専用の顔（31×31のドット絵）を2倍にして、63×63の枠に入れる
function makePortrait(img) {
  const c = document.createElement('canvas');
  c.width = 63;
  c.height = 63;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#f3e3c5';
  x.fillRect(0, 0, 63, 63);
  x.drawImage(img, 0, 0, 31, 31, 1, 1, 62, 62);
  return c;
}

function makeFace(img) {
  const c = document.createElement('canvas');
  c.width = 63;
  c.height = 63;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#f3e3c5';
  x.fillRect(0, 0, 63, 63);
  if (img) x.drawImage(img, 32 + 5, 2, 21, 21, 0, 0, 63, 63);
  return c;
}

// スマホの画面ボタン「メニュー」：フィールドでは「メニュー」、メニューの中や戦闘で選んでいる途中は「もどる」。
// 会話中・イベント中など、押しても何も起きない時は隠す（押すとキャンセルと同じ）
const NO_BACK = ['TapScene', 'TitleScene', 'MessageScene', 'RestScene', 'BlackTextScene', 'EndRollScene', 'TheEndScene', 'PrologueScene'];
let menuState = '';
function updateMenuButton(game) {
  const btn = document.getElementById('menuBtn');
  if (!btn || !game.screen.touchEnabled) return;
  // ダッシュのボタンは、シュンソクをもらってダッシュできるようになってから出す
  const dashBtn = document.querySelector('#buttons .dash');
  const canDash = !!game.state && game.state.flags?.dash !== false;
  if (dashBtn && dashBtn.hidden === canDash) dashBtn.hidden = !canDash;
  const top = game.scenes.top;
  const name = top?.constructor?.name ?? '';
  let label = 'もどる';
  if (game.scenes.fade || NO_BACK.includes(name)) label = '';
  else if (name === 'FieldScene') label = top.busy ? '' : 'メニュー';
  else if (name === 'BattleScene') label = top.phase === 'list' || top.phase === 'target' || (top.phase === 'command' && top.who > top.firstInputIndex()) ? 'もどる' : '';
  if (label === menuState) return;
  menuState = label;
  btn.hidden = !label;
  btn.textContent = label;
  btn.classList.toggle('back', label === 'もどる');
}

// 640×360 の座標のまま、拡大したキャンバスに描けるようにする
function useScale(ctx) {
  const s = ctx.canvas.width / WIDTH;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

function drawLoading(ctx, text) {
  useScale(ctx);
  ctx.fillStyle = '#1d1730';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#f4ead5';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
  ctx.textAlign = 'start';
}

function showError(ctx, e) {
  console.error(e);
  useScale(ctx);
  ctx.fillStyle = '#300';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fdd';
  ctx.font = '14px sans-serif';
  const lines = ['エラーが起きました。画面を再読み込みしてください。', String(e?.message ?? e)];
  lines.forEach((l, i) => ctx.fillText(l, 16, 30 + i * 22));
}

boot().catch((e) => showError(document.getElementById('screen').getContext('2d'), e));
