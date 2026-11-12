# 段階9：フリー素材にないボスの絵（水の四天王・炎の四天王）と、風の四天王のメガネをかけたダチョウを描く
# モンスター素材（Pipoya）に合わせて、480x480・太い輪郭線・なめらかな影の絵にする
# 使い方（プロジェクトのフォルダで）：powershell -ExecutionPolicy Bypass -File tools/draw_bosses.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets/monsters/extra'

function C([string]$hex, [int]$a = 255) { $h = $hex.TrimStart('#'); [System.Drawing.Color]::FromArgb($a, [Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16)) }
function Pts($list) { $p = New-Object 'System.Drawing.PointF[]' ($list.Count / 2); for ($i = 0; $i -lt $list.Count; $i += 2) { $p[$i / 2] = New-Object System.Drawing.PointF([single]$list[$i], [single]$list[$i + 1]) }; return , $p }
$script:OL = C '#3b2630'
$script:LW = 6

function NewCanvas { $bmp = New-Object System.Drawing.Bitmap 480, 480; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.Clear([System.Drawing.Color]::Transparent); return @($bmp, $g) }
function Grad($rect, $c1, $c2, $angle = 60) { New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [single]$angle) }
# 形を塗って、太い輪郭線で囲む。kind：blob（なめらかな閉じた曲線）、poly（多角形）、ellipse（x,y,w,h）
function Shape($g, [string]$kind, $data, $c1, $c2, [double]$lw = $script:LW, $angle = 60, $tension = 0.5) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($kind -eq 'blob') { $path.AddClosedCurve((Pts $data), [single]$tension) }
  elseif ($kind -eq 'poly') { $path.AddPolygon((Pts $data)) }
  else { $path.AddEllipse([single]$data[0], [single]$data[1], [single]$data[2], [single]$data[3]) }
  $b = $path.GetBounds(); $b.Inflate(2, 2)
  $brush = if ($c2) { Grad $b $c1 $c2 $angle } else { New-Object System.Drawing.SolidBrush($c1) }
  $g.FillPath($brush, $path)
  if ($lw -gt 0) { $pen = New-Object System.Drawing.Pen($script:OL, [single]$lw); $pen.LineJoin = 'Round'; $g.DrawPath($pen, $path) }
  return $path
}
function Line($g, $data, [double]$w = 4, $color = $script:OL, [bool]$curve = $true) {
  $pen = New-Object System.Drawing.Pen($color, [single]$w); $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  if ($curve) { $g.DrawCurve($pen, (Pts $data), [single]0.5) } else { $g.DrawLines($pen, (Pts $data)) }
}
function Shine($g, $x, $y, $w, $h, [int]$a = 150) { $g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#ffffff' $a))), [single]$x, [single]$y, [single]$w, [single]$h) }
function Shadow($g, $cx, $cy, $w, $h) { $g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#000000' 45))), [single]($cx - $w / 2), [single]($cy - $h / 2), [single]$w, [single]$h) }

# ---------------------------------------------------------------
# 水の四天王：ブロンドの縦ロールに扇子を持った、人魚のお嬢さま
# ---------------------------------------------------------------
$bmp, $g = NewCanvas
Shadow $g 250 448 330 40
$skin = C '#ffe0c8'; $skinD = C '#f2b596'
$gold = C '#ffe066'; $goldD = C '#e3a52c'
# 後ろ髪（縦ロールの土台）
Shape $g 'blob' @(170, 95, 240, 40, 310, 95, 318, 175, 290, 205, 190, 205, 162, 175) $gold $goldD | Out-Null
# 縦ロール（左右2本ずつ）。上から下へ小さくなる巻き毛
function Ringlet($g, [int]$x, [int]$y, [int]$dir) {
  # ドリルのような縦ロール：上が太く、下がとがる。ななめの巻き線を入れる
  $len = 130
  $path = Shape $g 'blob' @($x, ($y - 10), ($x + 22), ($y + 4), ($x + 26 + $dir * 3), ($y + 40), ($x + 18 + $dir * 6), ($y + 85), ($x + 6 + $dir * 8), ($y + 118), ($x + $dir * 10), ($y + $len), ($x - 6 + $dir * 8), ($y + 118), ($x - 18 + $dir * 6), ($y + 85), ($x - 26 + $dir * 3), ($y + 40), ($x - 22), ($y + 4)) $gold $goldD 5 0 0.5
  $g.SetClip($path)
  for ($k = 0; $k -lt 7; $k++) { $yy = $y + 2 + $k * 19; Line $g @(($x - 30), ($yy - 6), ($x - 6), ($yy + 4), ($x + 30), ($yy + 22)) 4 $goldD; Shine $g ($x - 18 + $k * 2) ($yy + 2) 12 6 160 }
  $g.ResetClip()
  $g.DrawPath((New-Object System.Drawing.Pen($script:OL, 5)), $path)
}
# しっぽ（うろこの魚の下半身）
$tail = Shape $g 'blob' @(188, 292, 292, 292, 312, 340, 336, 380, 368, 402, 352, 426, 300, 424, 248, 410, 204, 374, 184, 330) (C '#58e0d8') (C '#1d7f9e') 4 75
$g.SetClip($tail)
for ($r = 0; $r -lt 8; $r++) { for ($k = 0; $k -lt 8; $k++) { $sx = 180 + $k * 26 + ($r % 2) * 13; $sy = 300 + $r * 18; $g.DrawArc((New-Object System.Drawing.Pen((C '#1b6f8a' 150), 3)), [single]$sx, [single]$sy, 26, 20, 20, 140) } }
Shine $g 200 300 40 90 70
$g.ResetClip()
$g.DrawPath((New-Object System.Drawing.Pen($script:OL, 6)), $tail)
# 尾びれ
Shape $g 'blob' @(350, 404, 392, 366, 446, 352, 424, 404, 452, 452, 398, 440, 356, 428) (C '#9ef5ee') (C '#2aa6b8') 6 30 | Out-Null
Line $g @(366, 412, 410, 380, 436, 366) 3 (C '#2a8fa8')
Line $g @(366, 420, 412, 428, 440, 444) 3 (C '#2a8fa8')
# 腰のひれ飾り
Shape $g 'blob' @(186, 286, 240, 278, 294, 286, 300, 304, 240, 312, 180, 304) (C '#c38cf0') (C '#7a43b8') 5 | Out-Null
# 体
Shape $g 'blob' @(196, 176, 284, 176, 300, 204, 292, 250, 290, 292, 190, 292, 188, 250, 180, 204) $skin $skinD 6 70 | Out-Null
Line $g @(240, 240, 241, 262, 240, 282) 3 $skinD
# 貝がらのむね当て
foreach ($sx in @(214, 266)) {
  Shape $g 'blob' @(($sx - 26), 222, ($sx - 18), 198, $sx, 190, ($sx + 18), 198, ($sx + 26), 222, $sx, 232) (C '#e7b6ff') (C '#9a55cf') 5 | Out-Null
  Line $g @($sx, 194, $sx, 228) 3 (C '#8a49bf'); Line $g @(($sx - 12), 197, ($sx - 8), 228) 2.5 (C '#8a49bf'); Line $g @(($sx + 12), 197, ($sx + 8), 228) 2.5 (C '#8a49bf')
  Shine $g ($sx - 14) 200 10 8 190
}
# 真珠の首かざり
for ($i = 0; $i -lt 9; $i++) { $t = $i / 8.0; $px = 208 + $t * 64; $py = 180 + [Math]::Sin($t * [Math]::PI) * 14; Shape $g 'ellipse' @(($px - 6), ($py - 6), 12, 12) (C '#ffffff') (C '#d9d0e8') 2.5 | Out-Null }
# 左うで（腰に手）
Shape $g 'blob' @(190, 186, 166, 214, 150, 250, 168, 286, 196, 290, 192, 270, 174, 252, 186, 220, 204, 200) $skin $skinD 6 | Out-Null
# 縦ロール（顔の両わきに、肩の前へ垂らす）
Ringlet $g 160 112 -1
# 首と顔
Shape $g 'blob' @(226, 150, 254, 150, 256, 182, 224, 182) $skin $skinD 5 | Out-Null
Shape $g 'ellipse' @(190, 66, 100, 112) $skin $skinD 6 80 | Out-Null
# 前髪
Shape $g 'blob' @(186, 120, 186, 76, 214, 54, 262, 52, 294, 76, 296, 118, 282, 96, 262, 84, 248, 98, 232, 84, 214, 92, 198, 104) $gold $goldD 5 80 | Out-Null
Shine $g 214 62 46 10 170
# ティアラ
Shape $g 'poly' @(206, 64, 216, 40, 228, 56, 240, 30, 252, 56, 264, 40, 274, 64, 240, 70) (C '#fff4a8') (C '#e6a92a') 4 | Out-Null
Shape $g 'ellipse' @(234, 44, 12, 12) (C '#7de8ff') (C '#2a8fd8') 2.5 | Out-Null
# 目（得意げに半分閉じた目と長いまつげ）
foreach ($ex in @(219, 261)) {
  Shape $g 'blob' @(($ex - 13), 124, $ex, 116, ($ex + 13), 124, $ex, 134) (C '#ffffff') $null 3 | Out-Null
  Shape $g 'ellipse' @(($ex - 6), 119, 12, 14) (C '#4fb3ff') (C '#1f5fbf') 0 | Out-Null
  $g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#1a1a3a'))), [single]($ex - 3), 123, 6, 7)
  Shine $g ($ex - 4) 120 4 4 230
  # まぶた（半分閉じる）
  $lid = Shape $g 'blob' @(($ex - 15), 125, ($ex - 6), 114, ($ex + 6), 114, ($ex + 15), 125, $ex, 123) $skin $skinD 0
  Line $g @(($ex - 15), 125, $ex, 120, ($ex + 15), 125) 4.5
  Line $g @(($ex + 13), 123, ($ex + 20), 117) 3; Line $g @(($ex - 13), 123, ($ex - 20), 117) 3
  Line $g @(($ex - 14), 104, $ex, 98, ($ex + 14), 102) 3.5
}
$g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#ff9eb0' 120))), 198, 140, 18, 9); $g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#ff9eb0' 120))), 264, 140, 18, 9)
Line $g @(240, 132, 242, 142, 238, 145) 2.5 $skinD
# 高笑いの口（扇子のかげから見える）
Shape $g 'blob' @(226, 152, 240, 148, 252, 152, 240, 164) (C '#d84a6a') (C '#9a2040') 3.5 | Out-Null
# 右うで（扇子を口元に）
Shape $g 'blob' @(286, 190, 318, 210, 334, 238, 322, 246, 300, 220, 282, 206) $skin $skinD 6 | Out-Null
Shape $g 'blob' @(322, 246, 334, 236, 308, 196, 290, 170, 278, 176, 296, 208) $skin $skinD 6 | Out-Null
Ringlet $g 330 112 1
# 扇子（ひらいた扇）
$fan = New-Object System.Drawing.Drawing2D.GraphicsPath
$fan.AddPie(232, 104, 150, 150, 245, 105)
$fb = Grad $fan.GetBounds() (C '#ffd1e6') (C '#ff6fa6') 90
$g.FillPath($fb, $fan)
$g.SetClip($fan)
for ($i = 0; $i -le 7; $i++) { $a = (245 + $i * 15) * [Math]::PI / 180; Line $g @(307, 179, (307 + [Math]::Cos($a) * 76), (179 + [Math]::Sin($a) * 76)) 2.5 (C '#c2407a') $false }
$g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#ffffff' 160))), 300, 108, 50, 16)
$g.ResetClip()
$g.DrawPath((New-Object System.Drawing.Pen($script:OL, 5)), $fan)
$g.DrawArc((New-Object System.Drawing.Pen((C '#ffd34a'), 4)), 235, 107, 144, 144, 245, 105)
# 扇子を持つ手
Shape $g 'ellipse' @(292, 166, 28, 26) $skin $skinD 5 | Out-Null
$bmp.Save((Join-Path $out 'boss_water.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
Write-Output 'wrote boss_water.png'

# ---------------------------------------------------------------
# 炎の四天王：上半身はだかの筋肉マッチョ。髪が炎のように燃えている（両うでで力こぶのポーズ）
# ---------------------------------------------------------------
$bmp, $g = NewCanvas
Shadow $g 240 450 300 38
$sk = C '#f0a46e'; $skD = C '#b9643a'
# 燃える髪（いちばん後ろ）
function Flame($g, $pts, $c1, $c2) { Shape $g 'blob' $pts $c1 $c2 5 90 0.45 | Out-Null }
Flame $g @(176, 96, 168, 52, 186, 70, 190, 18, 214, 50, 232, 4, 248, 46, 270, 12, 278, 56, 304, 30, 300, 74, 312, 96, 240, 110) (C '#ffdf5a') (C '#e5371f')
Flame $g @(192, 92, 196, 60, 210, 72, 220, 36, 236, 62, 252, 30, 262, 66, 282, 48, 286, 92, 240, 102) (C '#fff4a0') (C '#ff8a2a')
# ズボンとブーツ
Shape $g 'blob' @(166, 330, 314, 330, 322, 392, 300, 420, 252, 420, 242, 372, 236, 372, 228, 420, 180, 420, 158, 392) (C '#5a4a7a') (C '#2b2240') 6 | Out-Null
Shape $g 'blob' @(172, 412, 232, 412, 236, 444, 162, 446) (C '#7a4a2a') (C '#3a2010') 6 | Out-Null
Shape $g 'blob' @(248, 412, 308, 412, 318, 446, 244, 444) (C '#7a4a2a') (C '#3a2010') 6 | Out-Null
# 上半身（逆三角形）
Shape $g 'blob' @(150, 160, 240, 146, 330, 160, 348, 200, 318, 260, 306, 336, 174, 336, 162, 260, 132, 200) $sk $skD 6 70 | Out-Null
# 胸の筋肉
Shape $g 'blob' @(170, 186, 236, 184, 238, 236, 200, 246, 168, 226) (C '#f7b688') (C '#cf7a4a') 4.5 | Out-Null
Shape $g 'blob' @(244, 184, 310, 186, 312, 226, 280, 246, 242, 236) (C '#f7b688') (C '#cf7a4a') 4.5 | Out-Null
Shine $g 182 192 30 10 120; Shine $g 256 192 30 10 120
# 腹筋（6つ）
for ($r = 0; $r -lt 3; $r++) { foreach ($cx in @(214, 266)) { Shape $g 'blob' @(($cx - 22), (254 + $r * 26), ($cx + 22), (254 + $r * 26), ($cx + 20), (276 + $r * 26), ($cx - 20), (276 + $r * 26)) (C '#f3ad7c') (C '#c8743f') 3.5 90 0.6 | Out-Null } }
# ベルト
Shape $g 'blob' @(168, 324, 312, 324, 314, 344, 166, 344) (C '#3a2a2a') (C '#1a1010') 5 90 0.2 | Out-Null
Shape $g 'blob' @(222, 318, 258, 318, 262, 350, 218, 350) (C '#ffe27a') (C '#d08a1a') 4 90 0.2 | Out-Null
# うで（力こぶ）：肩→ひじ（横）→こぶし（上）
foreach ($sd in @(-1, 1)) {
  $sx = 240 + $sd * 96
  Shape $g 'blob' @(($sx), 158, ($sx + $sd * 50), 150, ($sx + $sd * 104), 176, ($sx + $sd * 108), 206, ($sx + $sd * 60), 214, ($sx + $sd * 6), 212) $sk $skD 6 | Out-Null
  # 力こぶ
  Shape $g 'blob' @(($sx + $sd * 30), 150, ($sx + $sd * 62), 128, ($sx + $sd * 90), 150, ($sx + $sd * 60), 170) (C '#f7b688') (C '#cf7a4a') 5 | Out-Null
  Shine $g ($sx + $sd * 60 - 12) 136 20 8 140
  # 前うで（上へ）
  Shape $g 'blob' @(($sx + $sd * 80), 196, ($sx + $sd * 112), 196, ($sx + $sd * 116), 130, ($sx + $sd * 104), 92, ($sx + $sd * 80), 96, ($sx + $sd * 84), 140) $sk $skD 6 | Out-Null
  # リストバンド
  Shape $g 'blob' @(($sx + $sd * 78), 100, ($sx + $sd * 108), 98, ($sx + $sd * 110), 116, ($sx + $sd * 80), 118) (C '#ff5a3a') (C '#b0201a') 4 90 0.2 | Out-Null
  # こぶし
  Shape $g 'blob' @(($sx + $sd * 72), 58, ($sx + $sd * 112), 56, ($sx + $sd * 118), 84, ($sx + $sd * 106), 102, ($sx + $sd * 78), 102, ($sx + $sd * 70), 82) $sk $skD 6 | Out-Null
  Line $g @(($sx + $sd * 80), 70, ($sx + $sd * 108), 70) 3 $skD; Line $g @(($sx + $sd * 80), 84, ($sx + $sd * 108), 84) 3 $skD
}
# 首と顔（四角いあご）
Shape $g 'blob' @(212, 130, 268, 130, 272, 164, 208, 164) $sk $skD 5 | Out-Null
Shape $g 'blob' @(190, 74, 290, 74, 296, 112, 284, 148, 262, 162, 218, 162, 196, 148, 184, 112) $sk $skD 6 80 0.45 | Out-Null
# 前髪の炎
Flame $g @(186, 92, 194, 60, 210, 78, 222, 50, 238, 76, 254, 48, 268, 78, 286, 58, 294, 92, 240, 86) (C '#ffe66a') (C '#ff5a22')
# 太いまゆ・やる気の目・歯を見せて笑う口
Line $g @(204, 100, 220, 94, 234, 100) 7; Line $g @(246, 100, 260, 94, 276, 100) 7
foreach ($ex in @(220, 260)) { Shape $g 'ellipse' @(($ex - 9), 106, 18, 14) (C '#ffffff') $null 3 | Out-Null; $g.FillEllipse((New-Object System.Drawing.SolidBrush((C '#2a1a1a'))), [single]($ex - 4), 108, 9, 10); Shine $g ($ex - 2) 109 4 4 230 }
Line $g @(240, 116, 236, 128, 244, 130) 3 $skD
Shape $g 'blob' @(214, 136, 266, 136, 260, 152, 240, 156, 220, 152) (C '#ffffff') (C '#e6e0d8') 4 90 0.4 | Out-Null
Line $g @(216, 144, 264, 144) 2.5 (C '#b8aca0')
foreach ($tx in @(228, 240, 252)) { Line $g @($tx, 137, $tx, 152) 2 (C '#b8aca0') }
# 火の粉
foreach ($sp in @(@(150, 60), @(330, 40), @(120, 120), @(360, 110), @(200, 20))) { Shape $g 'ellipse' @($sp[0], $sp[1], 10, 10) (C '#fff2a0') (C '#ff7a2a') 0 | Out-Null }
$bmp.Save((Join-Path $out 'boss_fire.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
Write-Output 'wrote boss_fire.png'
# ---------------------------------------------------------------
# 風の四天王：メガネをかけただけのダチョウ（雑魚のダチョウの絵にメガネを足す）
# ---------------------------------------------------------------
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $root 'assets/monsters/irasutoya/ostrich.png'))
$bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.DrawImage($src, 0, 0, $src.Width, $src.Height); $src.Dispose()
$frame = New-Object System.Drawing.Pen((C '#2a2230'), 2.6)
$lens = New-Object System.Drawing.SolidBrush((C '#bfe6ff' 90))
foreach ($e in @(@(31.5, 24.5), @(52, 27))) {
  $g.FillEllipse($lens, [single]($e[0] - 8), [single]($e[1] - 8), 16, 16)
  $g.DrawEllipse($frame, [single]($e[0] - 8), [single]($e[1] - 8), 16, 16)
  $g.DrawArc((New-Object System.Drawing.Pen((C '#ffffff' 220), 1.6)), [single]($e[0] - 5), [single]($e[1] - 5), 10, 10, 200, 70)
}
$g.DrawCurve($frame, (Pts @(39.5, 25.5, 41.8, 24, 44, 26.5)), [single]0.5)
$g.DrawLine($frame, 60, 26, 66, 23)
$bmp.Save((Join-Path $out 'boss_wind.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
Write-Output 'wrote boss_wind.png'