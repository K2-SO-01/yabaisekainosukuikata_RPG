// ドットのくっきりした文字を描く。DotGothic16 で1文字ずつ描いて、ぼやけた部分を消してから使い回す

export class PixelFont {
  constructor(family, size) {
    this.family = family;
    this.size = size;
    this.cache = new Map();
    this.widths = new Map();
    this.measurer = document.createElement('canvas').getContext('2d');
    this.measurer.font = `${size}px "${family}", monospace`;
    this.dy = null;
  }

  // 文字を置く高さ。ブラウザによって「上そろえ」の位置がちがう（iPhoneのSafariは下にずれて、文字の下が欠けていた）ので、
  // 「国」の字の一番上が、どのブラウザでも同じ段に来るようにずらす
  offsetY() {
    if (this.dy !== null) return this.dy;
    const c = document.createElement('canvas');
    c.width = this.size * 2;
    c.height = this.size * 4;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = this.measurer.font;
    x.textBaseline = 'top';
    x.fillText('国', 0, this.size);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let top = null;
    for (let y = 0; y < c.height && top === null; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] >= 110) { top = y - this.size; break; }
    const want = { 16: 1, 32: 3 }[this.size] ?? Math.round(this.size * 0.07);
    this.dy = 1 + (top === null ? 0 : want - top);
    return this.dy;
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
    const h = this.size + 8;
    const canvas = document.createElement('canvas');
    canvas.width = w + 2;
    canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.font = this.measurer.font;
    c.textBaseline = 'top';
    c.fillStyle = color;
    c.fillText(ch, 0, this.offsetY());
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
