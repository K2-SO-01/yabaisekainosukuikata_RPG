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
  # めがね
  if ($ch.glasses) {
    $gc = C $ch.glasses
    foreach ($ex in @(10, 18)) {
      for ($x = $ex - 1; $x -le $ex + 3; $x++) { Px $b $x 14 $gc; Px $b $x 18 $gc }
      for ($y = 14; $y -le 18; $y++) { Px $b ($ex - 1) $y $gc; Px $b ($ex + 3) $y $gc }
    }
    Px $b 14 15 $gc; Px $b 15 15 $gc; Px $b 16 15 $gc
  }
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

# ---- 町の人・お店の人・兵士など（すべての登場人物に顔を作る） ----
# 髪・服の色は、その人の歩行グラフィックから自動で読む（色ちがいの村人も、それぞれの色になる）
$CHARS = Get-Content (Join-Path $root 'data/characters.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Hex2($c) { '#{0:x2}{1:x2}{2:x2}' -f $c.R, $c.G, $c.B }
function Shade($hex, [double]$k) { $c = C $hex; '#{0:x2}{1:x2}{2:x2}' -f [int][Math]::Min(255, [Math]::Max(0, $c.R * $k)), [int][Math]::Min(255, [Math]::Max(0, $c.G * $k)), [int][Math]::Min(255, [Math]::Max(0, $c.B * $k)) }
function Tri($hex) { @($hex, (Shade $hex 0.72), (Shade $hex 1.25)) }
function IsSkin($c) { $c.R -gt 200 -and $c.G -gt 150 -and $c.B -gt 110 -and $c.R -gt $c.B + 30 }
# いちばん多い色（肌・輪郭の黒っぽい色・透明をのぞく）
function MainColor($bmp, $x0, $y0, $x1, $y1) {
  $count = @{}
  for ($y = $y0; $y -le $y1; $y++) { for ($x = $x0; $x -le $x1; $x++) {
    $c = $bmp.GetPixel(32 + $x, $y)
    if ($c.A -lt 200 -or (IsSkin $c) -or ($c.R + $c.G + $c.B) -lt 120) { continue }
    $k = Hex2 $c; if ($count.ContainsKey($k)) { $count[$k]++ } else { $count[$k] = 1 }
  } }
  if (-not $count.Count) { return '#7a5a40' }
  ($count.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
}

# 髪型・かぶり物の型。$h：髪（かぶり物）の色、$c：服の色
$NPC_STYLE = @{
  soldier = { param($h, $c) @{ eye = '#3a3a3a'; eyeD = '#1a1a1a'; brow = '#2a2a2a'; hair = (Tri $h); cloth = (Tri $c); collar = '#c8c8d0'; noFace = $true
      back = { param($g, $col) E $g $col 4 1 23 26 }
      front = { param($g, $col) E $g $col 4 1 23 26; Rc $g (C '#141418') 7 13 17 4; Rc $g (C '#141418') 14 17 3 7 } } }
  bob = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; hair = (Tri $h); cloth = (Tri $c); collar = '#f2f2e8'
      back = { param($g, $col) E $g $col 5 3 21 20 }
      front = { param($g, $col) P $g $col @(6, 14, 6, 6, 10, 3, 21, 3, 25, 6, 25, 14, 22, 10, 18, 11, 14, 9, 10, 11) } } }
  tied = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; hair = (Tri $h); cloth = (Tri $c); collar = '#e8e8e8'
      back = { param($g, $col) E $g $col 5 3 21 19; E $g $col 11 -1 9 6 }
      front = { param($g, $col) P $g $col @(6, 13, 6, 6, 10, 3, 21, 3, 25, 6, 25, 13, 22, 9, 15, 7, 9, 9) } } }
  pigtails = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; smile = $true; hair = (Tri $h); cloth = (Tri $c); collar = '#f2f2e8'
      back = { param($g, $col) E $g $col 5 3 21 18; E $g $col 0 6 7 12; E $g $col 24 6 7 12 }
      front = { param($g, $col) P $g $col @(6, 13, 6, 6, 10, 3, 21, 3, 25, 6, 25, 13, 22, 10, 16, 9, 10, 10) } } }
  oldbun = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; smile = $true; glasses = '#9a3ac8'; hair = (Tri $h); cloth = (Tri $c); collar = '#f2f2e8'
      back = { param($g, $col) E $g $col 5 3 21 17; E $g $col 10 -2 11 8 }
      front = { param($g, $col) P $g $col @(6, 12, 6, 6, 10, 3, 21, 3, 25, 6, 25, 12, 22, 8, 15, 7, 9, 8) } } }
  maid = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; smile = $true; hair = (Tri $h); cloth = (Tri $c); collar = '#ffffff'
      back = { param($g, $col) E $g $col 5 3 21 20 }
      front = { param($g, $col) P $g $col @(6, 14, 6, 6, 10, 3, 21, 3, 25, 6, 25, 14, 22, 10, 18, 11, 14, 9, 10, 11) }
      extra = { param($g) Rc $g (C '#ffffff') 6 4 19 3; foreach ($x in 6, 10, 14, 18, 22) { E $g (C '#ffffff') $x 2 4 3 } }; extraC = @('#ffffff', '#c8c8d8', '#ffffff') } }
  veil = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); female = $true; hair = (Tri $h); cloth = (Tri $c); collar = '#f2c83a'
      back = { param($g, $col) E $g $col 4 3 23 18; Rc $g $col 4 12 6 16; Rc $g $col 21 12 6 16 }
      front = { param($g, $col) P $g $col @(6, 13, 7, 8, 24, 8, 25, 13, 21, 10, 10, 10) }
      extra = { param($g) E $g (C '#f8f8fa') 4 0 23 10; Rc $g (C '#f2c83a') 5 7 21 2 }; extraC = @('#f8f8fa', '#c8c8d8', '#ffffff') } }
  hood = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#e8e8e8'; hair = (Tri $h); cloth = (Tri $h); collar = '#f2c83a'; beardC = '#f0f0f0'
      back = { param($g, $col) E $g $col 3 0 25 28 }
      front = { param($g, $col) P $g $col @(4, 18, 6, 6, 11, 2, 15, -1, 20, 2, 25, 6, 27, 18, 24, 11, 15, 8, 7, 11) }
      beard = { param($g, $col) P $g $col @(8, 18, 11, 21, 15, 21, 20, 21, 23, 18, 22, 24, 18, 29, 13, 29, 9, 24) }
      extra = { param($g) Rc $g (C '#f2c83a') 6 9 19 1 }; extraC = @('#f2c83a', '#b08a1a', '#ffe88a') } }
  hat = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#8a8a8a'; hair = @('#a0a0a0', '#787878', '#c8c8c8'); cloth = (Tri $c); collar = '#3a8aa8'; beardC = '#b8b8b8'
      back = { param($g, $col) E $g $col 5 6 21 16 }
      front = { param($g, $col) Rc $g $col 7 11 2 4; Rc $g $col 22 11 2 4 }
      beard = { param($g, $col) P $g $col @(8, 18, 11, 21, 15, 21, 20, 21, 23, 18, 22, 24, 18, 27, 13, 27, 9, 24) }
      extra = ({ param($g) E $g (C $h) 0 6 31 7; P $g (C $h) @(7, 9, 9, 1, 22, 1, 24, 9); Rc $g (C '#6a8ad8') 8 6 16 2 }).GetNewClosure(); extraC = (Tri $h) } }
  spiky = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); hair = (Tri $h); cloth = (Tri $c); collar = '#f2f2e8'
      back = { param($g, $col) E $g $col 5 3 21 19 }
      front = { param($g, $col) P $g $col @(5, 14, 4, 6, 8, 6, 9, 1, 13, 4, 16, 0, 19, 4, 23, 1, 23, 6, 27, 5, 26, 14, 23, 10, 20, 12, 17, 9, 14, 12, 11, 9, 8, 12) } } }
  slick = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); hair = (Tri $h); cloth = (Tri $c); collar = '#d8c050'
      back = { param($g, $col) E $g $col 5 2 21 18 }
      front = { param($g, $col) P $g $col @(6, 12, 6, 5, 11, 2, 21, 2, 25, 5, 25, 12, 23, 8, 18, 6, 12, 7, 8, 9) } } }
  bald = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = '#8a8a8a'; smile = $true; hair = @('#9a9a9a', '#787878', '#c0c0c0'); cloth = (Tri $c); collar = '#e8e8d8'; beardC = '#a8a8a8'
      back = { param($g, $col) Rc $g $col 5 11 3 7; Rc $g $col 23 11 3 7 }
      front = { param($g, $col) Rc $g $col 6 11 2 5; Rc $g $col 23 11 2 5 }
      beard = { param($g, $col) P $g $col @(8, 19, 11, 22, 15, 21, 20, 22, 23, 19, 22, 24, 18, 28, 13, 28, 9, 24) } } }
  short = { param($h, $c) @{ eye = '#7a4a20'; eyeD = '#4a2410'; brow = (Shade $h 0.6); hair = (Tri $h); cloth = (Tri $c); collar = '#f2f2e8'
      back = { param($g, $col) E $g $col 5 3 21 18 }
      front = { param($g, $col) P $g $col @(6, 13, 6, 6, 10, 3, 21, 3, 25, 6, 25, 13, 22, 9, 16, 8, 10, 9) } } }
  otaku = { param($h, $c) @{ eye = '#3a3a3a'; eyeD = '#1a1a1a'; brow = '#1a1a1a'; smile = $true; glasses = '#d8d8e0'; hair = @('#2a2a32', '#16161c', '#4a4a56'); cloth = (Tri $c); collar = '#f2f2f2'
      back = { param($g, $col) E $g $col 4 2 23 19 }
      front = { param($g, $col) P $g $col @(5, 13, 4, 5, 8, 2, 12, 3, 15, 0, 18, 3, 22, 1, 25, 5, 27, 13, 24, 9, 20, 11, 16, 8, 12, 11, 8, 9) } } }
}
# 歩行グラフィックの見た目ごとの型
$LOOK_STYLE = @{ 'Soldier 06' = 'soldier'; 'Soldier 01' = 'soldier'; 'Female 17' = 'bob'; 'Male 07' = 'hood'; 'Female 05' = 'veil'; 'pipo-charachip_otaku01' = 'otaku'; 'Female 14' = 'maid'; 'Male 17' = 'hat'
  'Male 03' = 'spiky'; 'Male 09' = 'slick'; 'Male 12' = 'bald'; 'Male 13' = 'short'; 'Male 14' = 'spiky'; 'Male 10' = 'short'; 'Female 02' = 'tied'; 'Female 19' = 'oldbun'; 'Female 20' = 'pigtails' }
$NPC_IDS = @()
foreach ($prop in $CHARS.PSObject.Properties) {
  $id = $prop.Name
  if ($id.StartsWith('_') -or $P.ContainsKey($id)) { continue }
  $sprite = $prop.Value.sprite
  $look = ([IO.Path]::GetFileNameWithoutExtension($sprite)) -replace '-\d+$', ''
  $style = $LOOK_STYLE[$look]
  if (-not $style) { Write-Output "（型がない）$id $look"; continue }
  $bmp = [System.Drawing.Bitmap]::FromFile((Join-Path $root $sprite))
  $hair = MainColor $bmp 9 1 22 8
  $cloth = MainColor $bmp 9 21 22 27
  $bmp.Dispose()
  $P[$id] = & $NPC_STYLE[$style] $hair $cloth
  $NPC_IDS += $id
}
Write-Output "町の人など：$($NPC_IDS.Count)人"

foreach ($id in $P.Keys) {
  $ch = $P[$id]
  $final = New-Object System.Drawing.Bitmap $N, $N
  $fg = [System.Drawing.Graphics]::FromImage($final); $fg.Clear([System.Drawing.Color]::Transparent)
  $layers = @()
  $layers += Layer $ch.back $ch.hair
  $layers += Body $ch
  $layers += Face $ch
  if ($ch.beard) { $layers += Layer $ch.beard $(if ($ch.beardC) { Tri $ch.beardC } else { $ch.hair }) }
  $layers += Layer $ch.front $ch.hair
  if ($ch.extra) { $layers += Layer $ch.extra $ch.extraC }
  foreach ($l in $layers) { $fg.DrawImage($l, 0, 0, $N, $N) }
  if ($ch.gem) { $final.SetPixel(15, 5, (C '#e83a3a')); $final.SetPixel(15, 6, (C '#a01e1e')) }
  $final.Save((Join-Path $out "$id.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}
Write-Output "wrote $($P.Count) faces"
