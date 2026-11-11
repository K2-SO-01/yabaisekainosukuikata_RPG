// ゲームの始まり：画面・操作・音を準備して、データを読み込み、タイトルの前の画面から始める
import { FONT_FAMILY, FONT_PATH, HEIGHT, WIDTH } from './config.js';
import { parseTiledMap } from './core/map.js';
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
  game.scenes.push(new TapScene());

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(50, Math.max(0, now - last));
    last = now;
    try {
      game.input.update(dt);
      if (!game.screen.portrait) game.scenes.update(dt);
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

  const jobs = [];
  for (const name of manifest.se ?? []) jobs.push(audio.prefetch(`se/${name}`));
  for (const name of manifest.preloadBgm ?? []) jobs.push(audio.prefetch(`bgm/${name}`));

  const characters = (await assets.loadJson('characters', manifest.characters ?? 'data/characters.json')) ?? {};
  game.characters = characters;
  for (const [id, c] of Object.entries(characters)) jobs.push(assets.loadImage(`char:${id}`, c.sprite));

  game.dialogues = {};
  for (const [key, path] of Object.entries(manifest.dialogues ?? {})) {
    jobs.push(assets.loadJson(`dialogue:${key}`, path).then((d) => Object.assign(game.dialogues, d ?? {})));
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
          map.tilesetImages.push({ firstgid: ts.firstgid, columns: ts.columns, img: await assets.loadImage(`tiles:${imgPath}`, imgPath) });
        }
        game.maps.set(id, map);
      }),
    );
  }
  await Promise.all(jobs);

  // 会話の顔アイコン（段階9までの仮：歩行グラフィックの顔を切り出して拡大する）
  game.faces = new Map();
  for (const id of Object.keys(characters)) game.faces.set(id, makeFace(assets.image(`char:${id}`)));
  game.speakerInfo = (speaker) => {
    for (const [id, c] of Object.entries(characters)) {
      if (c.name === speaker) return { faceKey: id, showName: c.main === true };
    }
    return { faceKey: null, showName: true };
  };
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

function drawLoading(ctx, text) {
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
  ctx.fillStyle = '#300';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fdd';
  ctx.font = '14px sans-serif';
  const lines = ['エラーが起きました。画面を再読み込みしてください。', String(e?.message ?? e)];
  lines.forEach((l, i) => ctx.fillText(l, 16, 30 + i * 22));
}

boot().catch((e) => showError(document.getElementById('screen').getContext('2d'), e));
