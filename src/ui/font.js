// ドットのくっきりした文字を描く。DotGothic16 で1文字ずつ描いて、ぼやけた部分を消してから使い回す

export class PixelFont {
  constructor(family, size) {
    this.family = family;
    this.size = size;
    this.cache = new Map();
    this.widths = new Map();
    this.measurer = document.createElement('canvas').getContext('2d');
    this.measurer.font = `${size}px "${family}", monospace`;
  }

  charWidth(ch) {
    let w = this.widths.get(ch);
    if (w === undefined) {
      w = Math.round(this.measurer.measureText(ch).width);
      this.widths.set(ch, w);
    }
    return w;
  }

  width(text) {
    let w = 0;
    for (const ch of String(text)) w += this.charWidth(ch);
    return w;
  }

  glyph(ch, color) {
    const key = `${color}\u0000${ch}`;
    let g = this.cache.get(key);
    if (g) return g;
    const w = Math.max(1, this.charWidth(ch));
    const h = this.size + 4;
    const canvas = document.createElement('canvas');
    canvas.width = w + 2;
    canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.font = this.measurer.font;
    c.textBaseline = 'top';
    c.fillStyle = color;
    c.fillText(ch, 0, 1);
    // 半透明の部分をなくして、ドットをくっきりさせる
    const img = c.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
    c.putImageData(img, 0, 0);
    g = { canvas, w };
    this.cache.set(key, g);
    return g;
  }

  // text を描いて、描き終わった右端のx座標を返す
  draw(ctx, text, x, y, color, maxChars = Infinity) {
    let cx = Math.round(x);
    const top = Math.round(y);
    let n = 0;
    for (const ch of String(text)) {
      if (n++ >= maxChars) break;
      if (ch !== ' ' && ch !== '　') ctx.drawImage(this.glyph(ch, color).canvas, cx, top);
      cx += this.charWidth(ch);
    }
    return cx;
  }

  drawCentered(ctx, text, centerX, y, color) {
    this.draw(ctx, text, centerX - this.width(text) / 2, y, color);
  }
}
