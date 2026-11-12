# Makes the green and red slimes from the blue slime (pipo-enemy009) by changing only the hue,
# keeping brightness and shading.  Output: assets/monsters/extra/slime_green.png, slime_red.png
# Run: powershell -ExecutionPolicy Bypass -File tools/recolor_slimes.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets\monsters\Pipoya RPG Monster Pack\shade\pipo-enemy009.png'
$outDir = Join-Path $root 'assets\monsters\extra'
New-Item -ItemType Directory -Force $outDir | Out-Null
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class Hue {
  public static void Shift(string src, string dst, double deg) {
    using (var bmp = new Bitmap(src)) {
      var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
      var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int n = data.Stride * bmp.Height;
      byte[] px = new byte[n];
      Marshal.Copy(data.Scan0, px, 0, n);
      for (int i = 0; i < n; i += 4) {
        if (px[i + 3] == 0) continue;
        double b = px[i] / 255.0, g = px[i + 1] / 255.0, r = px[i + 2] / 255.0;
        double max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b));
        double l = (max + min) / 2, s = 0, h = 0, d = max - min;
        if (d > 1e-6) {
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max == r) h = (g - b) / d + (g < b ? 6 : 0); else if (max == g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
          h *= 60;
        }
        if (s < 0.12) continue;
        h = (h + deg + 360) % 360;
        double q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        px[i + 2] = (byte)Math.Round(255 * H(p, q, h / 360 + 1.0 / 3));
        px[i + 1] = (byte)Math.Round(255 * H(p, q, h / 360));
        px[i] = (byte)Math.Round(255 * H(p, q, h / 360 - 1.0 / 3));
      }
      Marshal.Copy(px, 0, data.Scan0, n);
      bmp.UnlockBits(data);
      bmp.Save(dst, ImageFormat.Png);
    }
  }
  static double H(double p, double q, double t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1.0 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
    return p;
  }
}
"@ -ReferencedAssemblies System.Drawing
[Hue]::Shift($src, (Join-Path $outDir 'slime_green.png'), -95)
[Hue]::Shift($src, (Join-Path $outDir 'slime_red.png'), 150)
# temporary picture of the water king until stage 9 (the fish monster 042, turned pink and gold)
[Hue]::Shift((Join-Path $root "assets/monsters/Pipoya RPG Monster Pack/shade/pipo-enemy042.png"), (Join-Path $outDir "boss_water_temp.png"), 150)
"saved slime_green.png and slime_red.png"
