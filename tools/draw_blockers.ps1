# 段階9：道をふさぐ物の絵（炎の四天王の銅像、風の四天王の看板）を assets/tiles/extra/blockers.png に描く
#   左：炎の銅像（64x96。炎の四天王の絵を銅の色にして、台座にのせる。髪の炎だけは本物の炎）
#   右上（64,0）：看板（32x32。「計算上、ここを通れる確率はゼロです」の、数式だらけの看板）
# 使い方（プロジェクトのフォルダで）：powershell -ExecutionPolicy Bypass -File tools/draw_blockers.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
function C([string]$hex) { $h = $hex.TrimStart('#'); [System.Drawing.Color]::FromArgb(255, [Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16)) }

$sheet = New-Object System.Drawing.Bitmap 96, 96
$g = [System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::Transparent)

# ---- 炎の銅像 ----
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'assets/monsters/extra/boss_fire.png'))
$bronze = New-Object System.Drawing.Bitmap $src.Width, $src.Height
$dark = C '#3a2210'; $light = C '#c88a46'
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $c = $src.GetPixel($x, $y)
    if ($c.A -lt 10) { continue }
    $flame = ($y -lt 92 -and $x -gt 150 -and $x -lt 330 -and $c.R -gt 200 -and $c.B -lt 140 -and $c.G -gt 60) -or ($y -lt 40)
    if ($y -gt 440) { continue } # 影は描かない（台座にのせる）
    if ($flame) { $bronze.SetPixel($x, $y, $c); continue }
    $l = (0.3 * $c.R + 0.59 * $c.G + 0.11 * $c.B) / 255.0
    $l = [Math]::Min(1, [Math]::Max(0, ($l - 0.2) * 1.3)); $l = $l * $l * 0.6 + $l * 0.4
    $r = [int]($dark.R + ($light.R - $dark.R) * $l); $gg = [int]($dark.G + ($light.G - $dark.G) * $l); $b = [int]($dark.B + ($light.B - $dark.B) * $l)
    $bronze.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $r, $gg, $b))
  }
}
$src.Dispose()
$g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($bronze, (New-Object System.Drawing.Rectangle 2, 4, 60, 60), (New-Object System.Drawing.Rectangle 30, 0, 420, 440), 'Pixel')
$bronze.Dispose()
# 台座（石）
$g.InterpolationMode = 'NearestNeighbor'; $g.PixelOffsetMode = 'Half'
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#3a3236'))), 8, 62, 48, 32)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#9a9096'))), 9, 63, 46, 30)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#b8aeb4'))), 9, 63, 46, 4)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#7a7076'))), 9, 89, 46, 4)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#3a3236'))), 4, 60, 56, 5)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#c8bec4'))), 5, 61, 54, 3)
# 台座の金のプレート
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#6a4a14'))), 20, 72, 24, 12)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#f2c84a'))), 21, 73, 22, 10)
foreach ($lx in @(24, 30, 36)) { $g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#a07a1a'))), $lx, 76, 4, 1); $g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#a07a1a'))), $lx, 79, 3, 1) }

# ---- 看板（数式だらけ） ----
$ox = 64; $oy = 0
$wood = C '#c08a4a'; $woodD = C '#7a4a1e'; $woodL = C '#e0b070'; $ol = C '#3a2414'
$g.FillRectangle((New-Object System.Drawing.SolidBrush($ol)), $ox + 6, $oy + 18, 4, 14); $g.FillRectangle((New-Object System.Drawing.SolidBrush($ol)), $ox + 22, $oy + 18, 4, 14)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($woodD)), $ox + 7, $oy + 18, 2, 13); $g.FillRectangle((New-Object System.Drawing.SolidBrush($woodD)), $ox + 23, $oy + 18, 2, 13)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($ol)), $ox + 1, $oy + 3, 30, 19)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($wood)), $ox + 2, $oy + 4, 28, 17)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($woodL)), $ox + 2, $oy + 4, 28, 2)
$g.FillRectangle((New-Object System.Drawing.SolidBrush($woodD)), $ox + 2, $oy + 19, 28, 2)
$g.FillRectangle((New-Object System.Drawing.SolidBrush((C '#f4ecd8'))), $ox + 4, $oy + 7, 24, 11)
$ink = New-Object System.Drawing.SolidBrush((C '#2a2a4a'))
# 「P = 0」と、式のような細かい線
$px = @(
  @(5, 8), @(5, 9), @(5, 10), @(5, 11), @(6, 8), @(7, 9), @(6, 10),
  @(9, 9), @(10, 9), @(11, 9), @(9, 11), @(10, 11), @(11, 11),
  @(13, 8), @(14, 8), @(15, 8), @(13, 9), @(15, 9), @(13, 10), @(15, 10), @(13, 11), @(14, 11), @(15, 11)
)
foreach ($p in $px) { $g.FillRectangle($ink, $ox + $p[0] + 1, $oy + $p[1], 1, 1) }
$red = New-Object System.Drawing.SolidBrush((C '#d83a2a'))
foreach ($p in @(@(18, 8), @(19, 9), @(20, 10), @(21, 11), @(21, 8), @(20, 9), @(19, 10), @(18, 11))) { $g.FillRectangle($red, $ox + $p[0] + 2, $oy + $p[1], 1, 1) }
foreach ($ly in @(13, 15)) { $g.FillRectangle($ink, $ox + 5, $oy + $ly, 7, 1); $g.FillRectangle($ink, $ox + 14, $oy + $ly, 3, 1); $g.FillRectangle($ink, $ox + 19, $oy + $ly, 7, 1) }
# 小さなメガネのマーク（風の四天王のしるし）
$g.FillRectangle($ink, $ox + 22, $oy + 1, 3, 1); $g.FillRectangle($ink, $ox + 27, $oy + 1, 3, 1); $g.FillRectangle($ink, $ox + 25, $oy + 2, 2, 1)


# ---- 光の結晶（セーブポイント）：(72,32) に結晶 16x22、(64,64) に台座 32x14 ----
$ol = C '#2a4a7a'; $cl = C '#eafcff'; $cm = C '#a8e4ff'; $cd = C '#5ab0e8'; $cdd = C '#3a82c8'
$widths = @(2, 4, 6, 8, 10, 12, 14, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2)
for ($i = 0; $i -lt $widths.Count; $i++) {
  $w = $widths[$i]; $x0 = 72 + 8 - [Math]::Floor($w / 2); $yy = 33 + $i
  for ($k = 0; $k -lt $w; $k++) {
    $xx = $x0 + $k
    $c = if ($k -eq 0 -or $k -eq $w - 1) { $ol } elseif ($i -lt 7) { if ($xx -lt 79) { $cl } elseif ($xx -lt 81) { $cm } else { $cd } } else { if ($xx -lt 78) { $cm } elseif ($xx -lt 81) { $cd } else { $cdd } }
    $sheet.SetPixel($xx, $yy, $c)
  }
}
foreach ($xx in 72..87) { if ($sheet.GetPixel($xx, 39).A -gt 0 -and $sheet.GetPixel($xx, 39) -ne $ol) { $sheet.SetPixel($xx, 39, $ol) } }
$sheet.SetPixel(77, 36, (C '#ffffff')); $sheet.SetPixel(77, 37, (C '#ffffff')); $sheet.SetPixel(76, 38, (C '#ffffff')); $sheet.SetPixel(78, 42, (C '#ffffff'))
$sheet.SetPixel(80, 32, $ol)
# 台座
$st = C '#8a8290'; $stL = C '#b8b0c0'; $stD = C '#5a5260'; $gd = C '#f2c84a'
for ($yy = 0; $yy -lt 14; $yy++) { $w = if ($yy -lt 4) { 20 } else { 26 }; $x0 = 64 + 16 - $w / 2; for ($k = 0; $k -lt $w; $k++) { $c = if ($k -eq 0 -or $k -eq $w - 1 -or $yy -eq 13) { C '#2e2832' } elseif ($yy -eq 0 -or $yy -eq 4) { $stL } elseif ($yy -eq 3) { $gd } elseif ($yy -gt 10) { $stD } else { $st }; $sheet.SetPixel($x0 + $k, 64 + $yy, $c) } }
foreach ($k in 0..19) { $sheet.SetPixel(70 + $k, 63, (C '#2e2832')) }
$path = Join-Path $root 'assets/tiles/extra/blockers.png'
$sheet.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "wrote $path"
