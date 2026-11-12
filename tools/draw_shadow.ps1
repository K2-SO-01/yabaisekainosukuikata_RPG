# 裏ボス「影の勇者」の絵（主人公の4つの見た目ごと）を描く
# 主人公の歩行グラフィック（正面）を大きくして、闇の色にし、赤く光る目・血のような赤い光・立ちのぼる闇の炎を足す
# 使い方（プロジェクトのフォルダで）：powershell -ExecutionPolicy Bypass -File tools/draw_shadow.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root 'assets/chars/PIPOYA FREE RPG Character Sprites 32x32'
$looks = @{ m_sword = 'Male/Male 01-1'; m_mage = 'Male/Male 04-1'; f_sword = 'Female/Female 10-1'; f_mage = 'Female/Female 13-1' }
$S = 9          # 1ドットを何倍にするか
$W = 400; $H = 400
function C($a, $r, $g, $b) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }

foreach ($look in $looks.Keys) {
  $src = [System.Drawing.Bitmap]::FromFile((Join-Path $base "$($looks[$look]).png"))
  # 正面・まん中のコマ（32x32）を読む
  $px = New-Object 'int[,]' 32, 32
  $mask = New-Object 'bool[,]' 32, 32
  $lum = New-Object 'double[,]' 32, 32
  $isEye = New-Object 'bool[,]' 32, 32
  for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {
    $c = $src.GetPixel(32 + $x, $y)
    $mask[$x, $y] = $c.A -gt 100
    $lum[$x, $y] = (0.3 * $c.R + 0.59 * $c.G + 0.11 * $c.B) / 255.0
  } }
  # 目：顔のあたりの暗いドットで、横か上下に肌色がある所
  for ($y = 12; $y -le 16; $y++) { for ($x = 10; $x -le 21; $x++) {
    $c = $src.GetPixel(32 + $x, $y)
    if ($c.A -lt 100 -or $lum[$x, $y] -gt 0.38) { continue }
    $skin = $false
    foreach ($d in @(@(-1, 0), @(1, 0), @(0, 1), @(0, -1))) {
      $n = $src.GetPixel(32 + $x + $d[0], $y + $d[1])
      if ($n.A -gt 100 -and $n.R -gt 200 -and $n.G -gt 150 -and $n.B -gt 110 -and $n.R -gt $n.B + 30) { $skin = $true }
    }
    if ($skin) { $isEye[$x, $y] = $true }
  } }
  $src.Dispose()

  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $ox = [int](($W - 32 * $S) / 2); $oy = $H - 32 * $S - 6
  $rnd = New-Object System.Random 7

  # 足もとの影
  $g.FillEllipse((New-Object System.Drawing.SolidBrush((C 70 0 0 0))), $ox + 50, $oy + 32 * $S - 22, 32 * $S - 100, 30)
  # 立ちのぼる闇の炎（体のうしろ）
  for ($i = 0; $i -lt 70; $i++) {
    $x = $rnd.Next(4, 28); $y = $rnd.Next(1, 30)
    if (-not $mask[$x, $y]) { continue }
    $cx = $ox + $x * $S + $S / 2 + $rnd.Next(-14, 15); $cy = $oy + $y * $S
    $fh = $rnd.Next(40, 110); $fw = $rnd.Next(16, 34)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddBezier([single]($cx - $fw / 2), [single]$cy, [single]($cx - $fw / 2), [single]($cy - $fh * 0.5), [single]($cx + $rnd.Next(-20, 21)), [single]($cy - $fh * 0.8), [single]($cx + $rnd.Next(-10, 11)), [single]($cy - $fh))
    $path.AddBezier([single]($cx + $rnd.Next(-10, 11)), [single]($cy - $fh), [single]($cx + $fw / 2), [single]($cy - $fh * 0.6), [single]($cx + $fw / 2), [single]($cy - $fh * 0.3), [single]($cx + $fw / 2), [single]$cy)
    $path.CloseFigure()
    $a = $rnd.Next(35, 80)
    $g.FillPath((New-Object System.Drawing.SolidBrush((C ($a + 60) 25 0 30))), $path)
  }
  # 血のような赤い光（体のまわりを少しふくらませて重ねる）
  foreach ($grow in @(18, 12, 7)) {
    $alpha = @{ 18 = 28; 12 = 45; 7 = 70 }[$grow]
    $br = New-Object System.Drawing.SolidBrush((C $alpha 170 0 30))
    for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {
      if ($mask[$x, $y]) { $g.FillEllipse($br, [single]($ox + $x * $S - $grow), [single]($oy + $y * $S - $grow), [single]($S + 2 * $grow), [single]($S + 2 * $grow)) }
    } }
  }
  # 体：闇の色。元の明るさを少しだけ残して、髪や服の形がうっすら見えるように
  $g.SmoothingMode = 'None'
  for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {
    if (-not $mask[$x, $y]) { continue }
    $l = $lum[$x, $y]
    $edge = (-not $mask[[Math]::Max(0, $x - 1), $y]) -or (-not $mask[[Math]::Min(31, $x + 1), $y]) -or (-not $mask[$x, [Math]::Max(0, $y - 1)]) -or (-not $mask[$x, [Math]::Min(31, $y + 1)])
    $cr = [int](14 + 46 * $l); $cg = [int](8 + 22 * $l); $cb = [int](22 + 62 * $l)
    if ($edge) { $cr = 120; $cg = 10; $cb = 40 }
    $g.FillRectangle((New-Object System.Drawing.SolidBrush((C 255 $cr $cg $cb))), $ox + $x * $S, $oy + $y * $S, $S, $S)
  } }
  # 赤く光る目
  $g.SmoothingMode = 'AntiAlias'
  for ($y = 0; $y -lt 32; $y++) { for ($x = 0; $x -lt 32; $x++) {
    if (-not $isEye[$x, $y]) { continue }
    $cx = $ox + $x * $S + $S / 2; $cy = $oy + $y * $S + $S / 2
    foreach ($gr in @(16, 10, 6)) { $g.FillEllipse((New-Object System.Drawing.SolidBrush((C @{ 16 = 40; 10 = 80; 6 = 140 }[$gr] 255 20 20))), [single]($cx - $gr), [single]($cy - $gr), [single](2 * $gr), [single](2 * $gr)) }
    $g.SmoothingMode = 'None'
    $g.FillRectangle((New-Object System.Drawing.SolidBrush((C 255 255 40 40))), $ox + $x * $S, $oy + $y * $S, $S, $S)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush((C 255 255 220 200))), $ox + $x * $S + 2, $oy + $y * $S + 2, 3, 3)
    $g.SmoothingMode = 'AntiAlias'
  } }
  # 不気味に笑う口（ぎざぎざの赤い線。目の少し下）
  $ey = -1; for ($y = 12; $y -le 16; $y++) { for ($x = 10; $x -le 21; $x++) { if ($isEye[$x, $y]) { $ey = [Math]::Max($ey, $y) } } }
  if ($ey -lt 0) { $ey = 14 }
  $my = $oy + ($ey + 3) * $S
  $mx0 = $ox + 12 * $S; $mx1 = $ox + 20 * $S
  $pts = New-Object 'System.Drawing.PointF[]' 9
  for ($k = 0; $k -le 8; $k++) { $xx = $mx0 + ($mx1 - $mx0) * $k / 8; $yy = $my + [Math]::Sin($k / 8 * [Math]::PI) * 10 + $(if ($k % 2) { 5 } else { -2 }); $pts[$k] = New-Object System.Drawing.PointF([single]$xx, [single]$yy) }
  $g.DrawLines((New-Object System.Drawing.Pen((C 90 255 20 20), 9)), $pts)
  $g.DrawLines((New-Object System.Drawing.Pen((C 255 255 50 50), 3)), $pts)
  $out = Join-Path $root "assets/monsters/extra/shadow_$look.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $out"
}
