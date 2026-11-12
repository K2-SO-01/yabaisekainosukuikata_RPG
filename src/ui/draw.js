// 窓やカーソルなど、画面の部品を描く
// テーマ「光の結晶」：紺のガラスの窓に、淡い金のふちと、結晶の青い光。カーソルは小さな光る結晶
// （ゲームの中のすべての窓・カーソル・文字の色はここで決める。色を変える時はここだけ直す）

export const COLORS = {
  winBg: '#16204a', // 窓の中（上）
  winBg2: '#0e1430', // 窓の中（下）
  winBorder: '#d8c07a', // 金のふち
  winBorderHi: '#fff0b8', // 金のふちの光る所
  winLine: 'rgba(122, 208, 255, 0.45)', // 内側の細い結晶の線
  winInner: '#26305e', // 顔の後ろなど、少し明るい所
  text: '#f4f0ff', // ふつうの文字
  textDim: '#9a9cc8', // うすい文字
  accent: '#7ad0ff', // カーソル・強調（結晶の青）
  title: '#ffe08a', // 見出し（金）
  good: '#8ef0a0', // 回復・よい
  bad: '#ff7a6a', // ダメージ・わるい
  shade: 'rgba(0, 0, 10, 0.45)',
};

// 窓：紺のガラス＋金のふち＋四すみの小さな結晶
export function drawWindow(ctx, x, y, w, h) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  // かげ
  ctx.fillStyle = COLORS.shade;
  ctx.fillRect(x + 3, y + h, w - 3, 3);
  ctx.fillRect(x + w, y + 3, 3, h);
  // いちばん外の暗い線
  ctx.fillStyle = '#05060f';
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  // 金のふち（上は明るく、下は暗く）
  ctx.fillStyle = COLORS.winBorder;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = COLORS.winBorderHi;
  ctx.fillRect(x + 2, y + 1, w - 4, 1);
  ctx.fillStyle = '#8a7238';
  ctx.fillRect(x + 2, y + h - 2, w - 4, 1);
  // 中（紺のガラス：上から下へ少し暗く）
  const g = ctx.createLinearGradient(0, y + 3, 0, y + h - 3);
  g.addColorStop(0, COLORS.winBg);
  g.addColorStop(1, COLORS.winBg2);
  ctx.fillStyle = g;
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  // 内側の細い結晶の線と、上の方の光
  ctx.fillStyle = COLORS.winLine;
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
  ctx.fillRect(x + 4, y + 5, 1, h - 10);
  ctx.fillRect(x + w - 5, y + 5, 1, h - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x + 5, y + 5, w - 10, Math.min(10, h - 10));
  // 四すみの結晶
  if (w >= 40 && h >= 30) for (const [cx, cy] of [[x + 2, y + 2], [x + w - 7, y + 2], [x + 2, y + h - 7], [x + w - 7, y + h - 7]]) drawGem(ctx, cx, cy);
}

// 小さな結晶（5×5のひし形）
export function drawGem(ctx, x, y, color = '#bfe8ff') {
  ctx.fillStyle = '#05060f';
  ctx.fillRect(x + 1, y, 3, 5);
  ctx.fillRect(x, y + 1, 5, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 1, 1, 3);
  ctx.fillRect(x + 1, y + 2, 3, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 2, y + 1, 1, 1);
}

// メニューのカーソル：右向きの、光る結晶
export function drawCursor(ctx, x, y, color = COLORS.accent) {
  x = Math.round(x);
  y = Math.round(y);
  // ほんのり光る
  ctx.fillStyle = 'rgba(122,208,255,0.25)';
  ctx.fillRect(x - 2, y - 1, 12, 14);
  // 結晶（横長のひし形）
  ctx.fillStyle = '#05060f';
  for (let i = 0; i < 6; i++) ctx.fillRect(x + i, y + 6 - Math.min(i, 5 - i) - 1, 1, (Math.min(i, 5 - i) + 1) * 2);
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const r = Math.min(i, 5 - i);
    ctx.fillRect(x + i + 1, y + 6 - r, 1, r * 2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 2, y + 5, 2, 1);
}

// 「続きがある」の下向きの結晶（点滅させる）
export function drawNextMark(ctx, x, y, color = COLORS.accent) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(x) + i, Math.round(y) + i, 10 - i * 2, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(x) + 2, Math.round(y), 2, 1);
}

export function drawSkyGradient(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
