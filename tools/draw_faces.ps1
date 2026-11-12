# 段階9：会話の顔アイコン（主要キャラ12人）を描く。31x31のドット絵で、画面では2倍で出す
# 見た目は歩行グラフィックに合わせる（髪型・髪の色・目の色・服の色）
# 使い方（プロジェクトのフォルダで）：powershell -ExecutionPolicy Bypass -File tools/draw_faces.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets/faces'
New-Item -ItemType Directory -Force $out | Out-Null
$N = 31

function C([string]$hex) { $h = $hex.TrimStart('#'); [System.Drawing.Color]::FromArgb(255, [Convert]::ToInt32($h.Substring(0, 2), 16), [Convert]::ToInt32($h.Substring(2, 2), 16), [Convert]::ToInt32($h.Substring(4, 2), 16)) }
$script:OUTLINE = C '#3a2420'

# ---- 1つの部品（髪・顔・服など）を描く板 ----
function NewLayer { $b = New-Object System.Drawing.Bitmap $N, $N; $g = [System.Drawing.Graphics]::FromImage($b); $g.SmoothingMode = 'None'; $g.PixelOffsetMode = 'Half'; $g.Clear([System.Drawing.Color]::Transparent); return @($b, $g) }
function Brush($c) { New-Object System.Drawing.SolidBrush($c) }
function E($g, $c, $x, $y, $w, $h) { $g.FillEllipse((Brush $c), [single]$x, [single]$y, [single]$w, [single]$h) }
function Rc($g, $c, $x, $y, $w, $h) { $g.FillRectangle((Brush $c), [single]$x, [single]$y, [single]$w, [single]$h) }
function P($g, $c, $list) { $p = New-Object 'System.Drawing.PointF[]' ($list.Count / 2); for ($i = 0; $i -lt $list.Count; $i += 2) { $p[$i / 2] = New-Object System.Drawing.PointF([single]$list[$i], [single]$list[$i + 1]) }; $g.FillPolygon((Brush $c), $p) }
function Px($b, $x, $y, $c) { if ($x -ge 0 -and $y -ge 0 -and $x -lt $N -and $y -lt $N) { $b.SetPixel($x, $y, $c) } }
function Op($b, $x, $y) { return ($x -ge 0 -and $y -ge 0 -and $x -lt $N -and $y -lt $N -and $b.GetPixel($x, $y).A -gt 0) }

# 影とハイライトを自動でつけて、まわりを1ドットの輪郭線で囲む
function Finish($b, $base, $shade, $light, [bool]$outline = $true) {
  $mark = @()
  for ($y = 0; $y -lt $N; $y++) { for ($x = 0; $x -lt $N; $x++) {
    if (-not (Op $b $x $y)) { continue }
    if ($shade -and (-not (Op $b ($x + 1) ($y + 1)) -or -not (Op $b $x ($y + 2)))) { $mark += , @($x, $y, $shade) }
    elseif ($light -and -not (Op $b ($x - 1) ($y - 1)) -and -not (Op $b $x ($y - 2))) { $mark += , @($x, $y, $light) }
  } }
  foreach ($m in $mark) { $b.SetPixel($m[0], $m[1], $m[2]) }
  if ($outline) {
    $edge = @()
    for ($y = 0; $y -lt $N; $y++) { for ($x = 0; $x -lt $N; $x++) {
      if (Op $b $x $y) { continue }
      if ((Op $b ($x - 1) $y) -or (Op $b ($x + 1) $y) -or (Op $b $x ($y - 1)) -or (Op $b $x ($y + 1))) { $edge += , @($x, $y) }
    } }
    foreach ($e in $edge) { $b.SetPixel($e[0], $e[1], $script:OUTLINE) }
  }
}

# ---- 顔のつくり（みんな共通。目の色・女の人のまつげ・ほお紅・ひげ は人ごと） ----
$SKIN = C '#fbdcc0'; $SKIN_S = C '#eab08e'; $SKIN_L = C '#fff0e2'
function Face($ch) {
  $b, $g = NewLayer
  E $g $SKIN 7 6 17 19
  Rc $g $SKIN 6 14 2 4; Rc $g $SKIN 23 14 2 4
  Finish $b $SKIN $SKIN_S $null
  $iris = C $ch.eye; $irisD = C $ch.eyeD
  foreach ($ex in @(10, 18)) {
    Px $b $ex 15 $script:OUTLINE; Px $b ($ex + 1) 15 $script:OUTLINE; Px $b ($ex + 2) 15 $script:OUTLINE
    Px $b $ex 16 $iris; Px $b ($ex + 1) 16 (C '#ffffff'); Px $b ($ex + 2) 16 $irisD
    Px $b $ex 17 $irisD; Px $b ($ex + 1) 17 $iris; Px $b ($ex + 2) 17 $irisD
    Px $b ($ex + 1) 18 $irisD
  }
  if ($ch.female) { Px $b 9 14 $script:OUTLINE; Px $b 21 14 $script:OUTLINE; Px $b 9 15 $script:OUTLINE; Px $b 21 15 $script:OUTLINE; Px $b 10 20 (C '#f6a8a0'); Px $b 20 20 (C '#f6a8a0') }
  $brow = C $ch.brow
  foreach ($bx in @(10, 18)) { Px $b $bx 13 $brow; Px $b ($bx + 1) 13 $brow; Px $b ($bx + 2) 13 $brow }
  Px $b 15 19 $SKIN_S
  Px $b 14 21 (C '#c46a5a'); Px $b 15 21 (C '#c46a5a'); Px $b 16 21 (C '#c46a5a')
  if ($ch.smile) { Px $b 13 20 (C '#c46a5a'); Px $b 17 20 (C '#c46a5a') }
  return $b
}

# ---- 人ごとの髪・服・小物 ----
# 各部品は、描く関数と（基本の色・影・ハイライト）。back は顔の後ろ、front は顔の前
$P = @{}
$P.hero_m_sword = @{ eye = '#8a4a20'; eyeD = '#4a2410'; brow = '#5a3a28'
  hair = @('#7a5a48', '#5a3e30', '#a88270'); cloth = @('#3c5a8a', '#283e64', '#5a80b8'); collar = '#e8e8f0'
  back = { param($g, $c) E $g $c 5 2 21 20 }
  front = { param($g, $c) P $g $c @(5, 13, 6, 4, 9, 1, 11, 4, 14, 0, 16, 3, 19, 0, 21, 4, 24, 2, 25, 8, 26, 13, 23, 10, 20, 12, 17, 9, 14, 12, 11, 9, 8, 12) }
  extra = { param($g) Rc $g (C '#d83a2a') 6 10 19 2; P $g (C '#d83a2a') @(24, 10, 28, 8, 28, 14, 25, 12) } ; extraC = @('#d83a2a', '#a01e14', '#ff7a5a') }
$P.hero_m_mage = @{ eye = '#8a4a20'; eyeD = '#4a2410'; brow = '#5a3a28'
  hair = @('#6a4a38', '#4a3226', '#8a6a58'); cloth = @('#f2f2f6', '#c8c8d8', '#ffffff'); collar = '#3a5aa8'
  back = { param($g, $c) E $g $c 5 6 21 18 }
  front = { param($g, $c) P $g $c @(6, 15, 7, 9, 24, 9, 25, 15, 22, 12, 18, 13, 14, 12, 10, 13) }
  extra = { param($g) E $g (C '#3a6ad0') 0 6 31 6; P $g (C '#3a6ad0') @(7, 8, 12, 2, 17, 0, 22, 3, 26, 1, 24, 6, 24, 8); Rc $g (C '#f2c83a') 7 6 17 2 } ; extraC = @('#3a6ad0', '#24448e', '#6a9af0') }
$P.hero_f_sword = @{ eye = '#7a4ab0'; eyeD = '#3e2468'; brow = '#4a3480'; female = $true
  hair = @('#7a6ae0', '#5446b0', '#a89cf6'); cloth = @('#2a2a3a', '#18182a', '#4a4a5a'); collar = '#f2c83a'
  back = { param($g, $c) E $g $c 5 3 21 22; E $g $c 3 0 8 8; E $g $c 20 0 8 8 }
  front = { param($g, $c) P $g $c @(6, 14, 6, 6, 10, 3, 21, 3, 25, 6, 25, 14, 23, 10, 19, 11, 15, 10, 11, 11, 8, 10) }
  extra = $null }
$P.hero_f_mage = @{ eye = '#3aa0c8'; eyeD = '#1a5a80'; brow = '#b0a0b8'; female = $true
  hair = @('#ece0ee', '#c8b4d0', '#ffffff'); cloth = @('#e86a9a', '#b04070', '#ff9ac0'); collar = '#3a8a6a'
  back = { param($g, $c) E $g $c 4 3 23 18; Rc $g $c 4 12 6 16; Rc $g $c 21 12 6 16 }
  front = { param($g, $c) P $g $c @(5, 16, 6, 6, 10, 3, 21, 3, 25, 6, 26, 16, 23, 11, 20, 12, 16, 10, 12, 12, 8, 11) }
  extra = $null }
$P.luke = @{ eye = '#8a4a20'; eyeD = '#4a2410'; brow = '#5a3a28'
  hair = @('#6a4a38', '#4a3226', '#8a6a58'); cloth = @('#f2f2f6', '#c8c8d8', '#ffffff'); collar = '#f2c83a'
  back = { param($g, $c) E $g $c 5 4 21 18 }
  front = { param($g, $c) P $g $c @(6, 14, 7, 7, 24, 7, 25, 14, 22, 11, 18, 12, 14, 11, 10, 12) }
  extra = { param($g) E $g (C '#f6f6fa') 6 0 19 10; Rc $g (C '#f2c83a') 6 7 19 2 } ; extraC = @('#f6f6fa', '#c8c8d8', '#ffffff') }
$P.leo_sword = @{ eye = '#8a5a30'; eyeD = '#4a3018'; brow = '#a8884a'
  hair = @('#e8cc78', '#b89a4a', '#fff0b0'); cloth = @('#8a8e9a', '#5a5e6a', '#c0c4cc'); collar = '#3a5a9a'
  back = { param($g, $c) E $g $c 5 3 21 19 }
  front = { param($g, $c) P $g $c @(5, 14, 5, 6, 9, 2, 17, 1, 24, 3, 27, 8, 26, 14, 22, 9, 17, 11, 21, 6, 12, 8, 8, 12) }
  extra = $null }
$P.leo_mage = @{ eye = '#3a9a4a'; eyeD = '#1a5a24'; brow = '#a8884a'
  hair = @('#e8cc78', '#b89a4a', '#fff0b0'); cloth = @('#3a3a4a', '#22222e', '#5a5a6a'); collar = '#5a7ac8'
  back = { param($g, $c) E $g $c 5 3 21 19 }
  front = { param($g, $c) P $g $c @(5, 14, 4, 5, 8, 6, 9, 1, 13, 4, 16, 0, 19, 4, 23, 1, 23, 6, 27, 5, 26, 14, 23, 10, 20, 12, 17, 9, 14, 12, 11, 9, 8, 12) }
  extra = $null }
$P.lina_sword = @{ eye = '#8a5a30'; eyeD = '#4a3018'; brow = '#b0904a'; female = $true
  hair = @('#f6d878', '#c8a44a', '#fff4c0'); cloth = @('#d83a5a', '#9a1e3a', '#ff7a90'); collar = '#2a2a3a'
  back = { param($g, $c) E $g $c 5 3 21 19; P $g $c @(22, 4, 29, 2, 30, 12, 28, 22, 24, 26, 25, 16, 22, 10) }
  front = { param($g, $c) P $g $c @(6, 15, 6, 6, 10, 3, 21, 3, 25, 6, 25, 14, 22, 10, 18, 11, 15, 9, 12, 11, 9, 11) }
  extra = { param($g) Rc $g (C '#d83a5a') 22 4 3 3 } ; extraC = @('#d83a5a', '#9a1e3a', '#ff7a90') }
$P.lina_mage = @{ eye = '#3a9a4a'; eyeD = '#1a5a24'; brow = '#b0904a'; female = $true
  hair = @('#f6d878', '#c8a44a', '#fff4c0'); cloth = @('#f2f2f6', '#b8bcd0', '#ffffff'); collar = '#3a6ad0'
  back = { param($g, $c) E $g $c 4 3 23 20; Rc $g $c 4 12 5 12; Rc $g $c 22 12 5 12 }
  front = { param($g, $c) P $g $c @(6, 15, 6, 7, 10, 4, 21, 4, 25, 7, 25, 15, 22, 11, 18, 12, 15, 10, 12, 12, 9, 11) }
  extra = { param($g) Rc $g (C '#3a6ad0') 6 5 19 2 } ; extraC = @('#3a6ad0', '#24448e', '#6a9af0') }
$P.king = @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#4a3020'; smile = $true
  hair = @('#7a5a40', '#5a4030', '#9a7a60'); cloth = @('#4aa83a', '#2e7024', '#7ad064'); collar = '#f2c83a'
  back = { param($g, $c) E $g $c 4 5 23 18 }
  front = { param($g, $c) P $g $c @(6, 14, 6, 8, 25, 8, 25, 14, 22, 11, 9, 11) }
  beard = { param($g, $c) P $g $c @(7, 18, 9, 22, 12, 23, 14, 22, 17, 22, 19, 23, 22, 22, 24, 18, 24, 22, 21, 27, 15, 29, 10, 27, 7, 22) }
  extra = { param($g) P $g (C '#f6cc3a') @(8, 8, 8, 2, 11, 5, 13, 0, 15, 4, 17, 0, 19, 5, 22, 2, 22, 8) } ; extraC = @('#f6cc3a', '#c08a1a', '#fff2a0'); gem = $true }
$P.oji = @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#4a3020'; smile = $true
  hair = @('#7a5a40', '#5a4030', '#9a7a60'); cloth = @('#6ac83a', '#3e8a24', '#9ae070'); collar = '#f2f2e8'
  back = { param($g, $c) E $g $c 5 3 21 18 }
  front = { param($g, $c) P $g $c @(6, 13, 6, 6, 10, 3, 21, 3, 25, 6, 25, 13, 22, 9, 16, 8, 10, 9) }
  beard = { param($g, $c) P $g $c @(8, 19, 11, 22, 14, 21, 17, 21, 20, 22, 23, 19, 23, 22, 19, 25, 12, 25, 8, 22) }
  extra = $null }
$P.oba = @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#4a3020'; female = $true; smile = $true
  hair = @('#7a5a40', '#5a4030', '#9a7a60'); cloth = @('#6ac83a', '#3e8a24', '#9ae070'); collar = '#f2f2e8'
  back = { param($g, $c) E $g $c 5 3 21 18; E $g $c 10 -1 11 7 }
  front = { param($g, $c) P $g $c @(6, 14, 6, 7, 10, 4, 21, 4, 25, 7, 25, 14, 22, 9, 15, 8, 9, 10) }
  extra = $null }

function Layer($fn, $colors, [bool]$outline = $true) {
  $b, $g = NewLayer
  & $fn $g (C $colors[0])
  Finish $b (C $colors[0]) (C $colors[1]) (C $colors[2]) $outline
  return $b
}
function Body($ch) {
  $b, $g = NewLayer
  $c = C $ch.cloth[0]
  P $g $c @(2, 31, 4, 27, 9, 25, 22, 25, 27, 27, 29, 31)
  Rc $g $SKIN 12 22 7 4
  Finish $b $c (C $ch.cloth[1]) (C $ch.cloth[2])
  $col = C $ch.collar
  for ($x = 10; $x -le 20; $x++) { Px $b $x 26 $col }
  Px $b 11 27 $col; Px $b 19 27 $col; Px $b 12 28 $col; Px $b 18 28 $col
  return $b
}

foreach ($id in $P.Keys) {
  $ch = $P[$id]
  $final = New-Object System.Drawing.Bitmap $N, $N
  $fg = [System.Drawing.Graphics]::FromImage($final); $fg.Clear([System.Drawing.Color]::Transparent)
  $layers = @()
  $layers += Layer $ch.back $ch.hair
  $layers += Body $ch
  $layers += Face $ch
  if ($ch.beard) { $layers += Layer $ch.beard $ch.hair }
  $layers += Layer $ch.front $ch.hair
  if ($ch.extra) { $layers += Layer $ch.extra $ch.extraC }
  foreach ($l in $layers) { $fg.DrawImage($l, 0, 0, $N, $N) }
  if ($ch.gem) { $final.SetPixel(15, 5, (C '#e83a3a')); $final.SetPixel(15, 6, (C '#a01e1e')) }
  $final.Save((Join-Path $out "$id.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}
Write-Output "wrote $($P.Count) faces"
