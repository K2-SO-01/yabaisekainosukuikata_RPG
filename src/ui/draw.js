// 窓やカーソルなど、画面の部品を描く（パステル系のやわらかい見た目）

export const COLORS = {
  winBg: '#fff7e6',
  winBorder: '#8c6a4f',
  winInner: '#ecd9b8',
  text: '#4a3b2c',
  textDim: '#b9a78d',
  accent: '#d9714e',
  title: '#5b4636',
  shade: 'rgba(40, 30, 20, 0.35)',
};

// 角を少し丸くした窓（ドット絵らしく、角は1マスずつ欠く）
export function drawWindow(ctx, x, y, w, h) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  ctx.fillStyle = COLORS.shade;
  ctx.fillRect(x + 3, y + h, w - 3, 3);
  ctx.fillRect(x + w, y + 3, 3, h);
  ctx.fillStyle = COLORS.winBorder;
  ctx.fillRect(x + 2, y, w - 4, h);
  ctx.fillRect(x, y + 2, w, h - 4);
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = COLORS.winInner;
  ctx.fillRect(x + 3, y + 2, w - 6, h - 4);
  ctx.fillRect(x + 2, y + 3, w - 4, h - 6);
  ctx.fillStyle = COLORS.winBg;
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
}

// メニューのカーソル（右向きの三角）
export function drawCursor(ctx, x, y, color = COLORS.accent) {
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(x) + i, Math.round(y) + i, 1, 12 - i * 2);
}

// 「続きがある」の下向き三角（点滅させる）
export function drawNextMark(ctx, x, y, color = COLORS.accent) {
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(x) + i, Math.round(y) + i, 10 - i * 2, 1);
}

export function drawSkyGradient(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
