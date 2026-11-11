# Draws the extra castle tiles (32x32) that the base tileset does not have:
# blue pointed roofs, round towers, castle walls, a grand gate, a clock, sky, and palace interior pieces.
# Output: assets/tiles/extra/castle_extra.png  (8 columns x 10 rows)
# Run:    powershell -ExecutionPolicy Bypass -File tools/draw_castle_tiles.ps1
#
# Layout (row, column) -> tile number in maps = 1065 + row*8 + column
#   r0-2 c0-2 big cone roof     r0-2 c3-5 grand gate      r0-1 c6 thin spire   r2 c6 clock
#   r0 c7 sky top   r1 c7 sky middle   r2 c7 sky low      r6 c6 sky bottom
#   r3-6 c0-2 big tower: ring / window / plain / base     r9 c0-2 big tower with clock
#   r3-6 c3-4 small tower: ring / window / plain / base   r3-4 c5-6 small cone roof
#   r5 c5-6 cloud           r3 c7 wall top (battlements)  r4 c7 wall   r5 c7 wall window   r6 c7 wall base
#   r7: c0 marble floor, c1-3 carpet left/middle/right, c4-6 carpet top left/middle/right, c7 dais step
#   r8: c0 palace wall upper, c1 palace wall lower
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'assets\tiles\extra'
New-Item -ItemType Directory -Force $outDir | Out-Null
$W = 256; $H = 320
$bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

function Hex($h) { [System.Drawing.ColorTranslator]::FromHtml($h) }
function P([int]$x, [int]$y, $c) { if ($x -ge 0 -and $y -ge 0 -and $x -lt $script:W -and $y -lt $script:H) { $script:bmp.SetPixel($x, $y, $c) } }  # script: scope (names ignore case)
function Mix($a, $b, [double]$t) {
  [System.Drawing.Color]::FromArgb([int]($a.R + ($b.R - $a.R) * $t), [int]($a.G + ($b.G - $a.G) * $t), [int]($a.B + ($b.B - $a.B) * $t))
}
$stone = '#8c7c60', '#b9a986', '#dacdaf', '#eee5d0', '#fbf7ec' | ForEach-Object { Hex $_ }
$blue = '#142c5e', '#224c96', '#3770c2', '#64a0e0', '#a8ccf2' | ForEach-Object { Hex $_ }
$gold = '#875f12', '#c29827', '#ebc847', '#fff2a3' | ForEach-Object { Hex $_ }
$skyTop = Hex '#8cc2ec'; $skyBottom = Hex '#e4f2fb'
$glass = Hex '#22355f'; $glassHi = Hex '#5079b8'
$red = Hex '#cf3434'; $redDark = Hex '#8f1e1e'

function Bricks($ox, $oy, $wpx, $hpx) {
  $rnd = New-Object System.Random ($ox * 7 + $oy * 13)
  for ($ly = 0; $ly -lt $hpx; $ly++) {
    $row = [Math]::Floor($ly / 8)
    for ($lx = 0; $lx -lt $wpx; $lx++) {
      $j = ($lx + ($row % 2) * 8) % 16
      $s = 3
      if (($ly % 8) -eq 7 -or $j -eq 15) { $s = 1 }
      elseif (($ly % 8) -eq 0) { $s = 4 }
      elseif ($j -eq 14 -or ($ly % 8) -eq 6) { $s = 2 }
      elseif ($rnd.NextDouble() -lt 0.05) { $s = 2 }
      P ($ox + $lx) ($oy + $ly) $stone[$s]
    }
  }
}

# arched window centred on $cx (pixel centre), $w wide, $h tall
function Window([double]$cx, $top, $w, $h) {
  $r = $w / 2.0; $acy = $top + $r
  function Inside([double]$dx, [double]$yc, [double]$rr) {
    if ($yc -lt $acy) { return ($dx * $dx + ($yc - $acy) * ($yc - $acy)) -le ($rr * $rr) }
    return [Math]::Abs($dx) -le $rr
  }
  for ($y = $top - 1; $y -le $top + $h; $y++) {
    for ($x = [int]($cx - $r - 2); $x -le [int]($cx + $r + 2); $x++) {
      $dx = $x - $cx; $yc = $y + 0.5
      if ($y -gt $top + $h - 1) { if ([Math]::Abs($dx) -le $r + 1) { P $x $y $gold[1] }; continue }
      if (-not (Inside $dx $yc ($r + 1))) { continue }
      if (-not (Inside $dx $yc ($r - 0.2))) { P $x $y $gold[2]; continue }
      $c = $glass
      if ([Math]::Abs($dx) -lt 0.6) { $c = $gold[0] }
      elseif ((($dx + ($y - $top) * 0.5) % 7 + 7) % 7 -lt 1.6 -and $dx -lt 0) { $c = $glassHi }
      P $x $y $c
    }
  }
}

function Cone($ox, $oy, $wT, $hT) {
  $wd = 32 * $wT; $hd = 32 * $hT
  $cx = $ox + $wd / 2.0 - 0.5
  $apex = $oy + 8 + 2 * ($wT - 1)
  $base = $oy + $hd - 6
  $half = $wd / 2.0 - 3
  for ($y = $apex; $y -le $base; $y++) {
    $t = ($y - $apex) / [double]($base - $apex)
    $hw = [Math]::Max(0.7, $t * $half)
    $x0 = [int][Math]::Ceiling($cx - $hw); $x1 = [int][Math]::Floor($cx + $hw)
    $band = [Math]::Floor(($y - $apex) / 5); $by = ($y - $apex) % 5
    for ($x = $x0; $x -le $x1; $x++) {
      $u = ($x - ($cx - $hw)) / (2 * $hw)
      $s = 0
      if ($u -lt 0.07) { $s = 1 } elseif ($u -lt 0.2) { $s = 2 } elseif ($u -lt 0.4) { $s = 3 } elseif ($u -lt 0.47) { $s = 4 } elseif ($u -lt 0.7) { $s = 2 } elseif ($u -lt 0.9) { $s = 1 }
      if ($by -eq 4) { $s = [Math]::Max(0, $s - 1) }
      elseif ($by -ge 2 -and ((($x + $band * 3) % 6) -eq 0)) { $s = [Math]::Max(0, $s - 1) }
      if ($x -eq $x0 -or $x -eq $x1) { $s = 0 }
      P $x $y $blue[$s]
    }
  }
  $ex0 = [int][Math]::Round($cx - $half - 1); $ex1 = [int][Math]::Round($cx + $half + 1)
  for ($y = $base + 1; $y -lt $oy + $hd; $y++) {
    $k = $y - $base
    for ($x = $ex0; $x -le $ex1; $x++) {
      $c = $blue[0]
      if ($k -eq 1) { $c = $gold[3] } elseif ($k -eq 2) { $c = $gold[2] } elseif ($k -eq 3) { $c = $(if (($x % 4) -eq 0) { $gold[0] } else { $gold[1] }) }
      P $x $y $c
    }
  }
  # golden finial and a small red pennant
  $pl = [int][Math]::Floor($cx); $pr = [int][Math]::Ceiling($cx)
  for ($y = $oy + 1; $y -le $apex; $y++) { P $pl $y $gold[1]; P $pr $y $gold[2] }
  for ($y = $apex - 5; $y -le $apex - 3; $y++) { for ($x = $pl - 1; $x -le $pr + 1; $x++) { P $x $y $(if ($y -eq $apex - 5) { $gold[3] } else { $gold[2] }) } }
  $len = 3 + 2 * $wT
  for ($i = 0; $i -lt 4; $i++) { for ($x = 1; $x -le $len - $i * [Math]::Ceiling($len / 4.0) + 1; $x++) { P ($pr + $x) ($oy + 1 + $i) $(if ($i -eq 3) { $redDark } else { $red }) } }
}

function Clock([double]$cx, [double]$cy) {
  $face = Hex '#2f5fb8'
  for ($y = [int]($cy - 14); $y -le [int]($cy + 14); $y++) {
    for ($x = [int]($cx - 14); $x -le [int]($cx + 14); $x++) {
      $d = [Math]::Sqrt(($x - $cx) * ($x - $cx) + ($y - $cy) * ($y - $cy))
      if ($d -gt 13.5) { continue }
      if ($d -gt 12.5) { P $x $y $gold[0] } elseif ($d -gt 10.5) { P $x $y $(if ($y -lt $cy) { $gold[3] } else { $gold[2] }) } else { P $x $y $face }
    }
  }
  for ($k = 0; $k -lt 12; $k++) {
    $a = $k * [Math]::PI / 6
    P ([int][Math]::Round($cx + [Math]::Sin($a) * 8.6)) ([int][Math]::Round($cy - [Math]::Cos($a) * 8.6)) (Hex '#ffffff')
  }
  foreach ($hand in @(@(-1.05, 5.0), @(1.05, 7.5))) {
    for ($i = 0; $i -le $hand[1] * 2; $i++) {
      $r = $i / 2.0
      P ([int][Math]::Round($cx + [Math]::Sin($hand[0]) * $r)) ([int][Math]::Round($cy - [Math]::Cos($hand[0]) * $r)) $gold[3]
    }
  }
  P ([int]$cx) ([int]$cy) $gold[3]
}

function TowerBody($ox, $oy, $wT, $kind) {
  $wd = 32 * $wT
  $l = $ox + 4; $r = $ox + $wd - 5
  for ($ly = 0; $ly -lt 32; $ly++) {
    $y = $oy + $ly
    $wide = ($kind -eq 'ring' -and $ly -lt 10)
    $ll = $(if ($wide) { $ox + 1 } else { $l }); $rr = $(if ($wide) { $ox + $wd - 2 } else { $r })
    for ($x = $ll; $x -le $rr; $x++) {
      $u = ($x - $ll) / [double]($rr - $ll)
      $b = 1 - [Math]::Abs($u - 0.35) * 1.7
      $s = 1
      if ($b -gt 0.72) { $s = 4 } elseif ($b -gt 0.4) { $s = 3 } elseif ($b -gt 0.12) { $s = 2 }
      if ($kind -eq 'ring' -and $ly -lt 14) {
        if ($ly -lt 10) { if ($ly -eq 0) { $s = [Math]::Min(4, $s + 1) } elseif ($ly -eq 9) { $s = 1 } }
        else { $k = ($x - $l) % 8; if ($k -ge 2 -and $k -le 5) { $s = $(if ($ly -eq 13) { 1 } else { [Math]::Max(1, $s - 1) }) } else { $s = 0 } }
      } else {
        $row = [Math]::Floor($ly / 8)
        if (($ly % 8) -eq 7 -or ((($x - $l) + ($row % 2) * 6) % 12) -eq 11) { $s = [Math]::Max(0, $s - 1) }
      }
      if ($x -eq $ll -or $x -eq $rr) { $s = 0 }
      P $x $y $stone[$s]
    }
  }
  $cx = $ox + $wd / 2.0 - 0.5
  if ($kind -eq 'window') { Window $cx ($oy + 6) $(if ($wT -ge 3) { 10 } else { 8 }) 20 }
  if ($kind -eq 'clock') { Clock $cx ($oy + 16) }
  if ($kind -eq 'base') {
    for ($ly = 25; $ly -lt 32; $ly++) {
      for ($x = $l - 1; $x -le $r + 1; $x++) {
        $c = $stone[2]
        if ($ly -eq 25) { $c = $stone[4] } elseif ($ly -eq 31 -or $x -eq $l - 1 -or $x -eq $r + 1) { $c = $stone[0] } elseif ($ly -ge 29) { $c = $stone[1] }
        P $x ($oy + $ly) $c
      }
    }
  }
}

function SkyTile($ox, $oy, [double]$t0, [double]$t1) {
  for ($ly = 0; $ly -lt 32; $ly++) {
    $c = Mix $skyTop $skyBottom ($t0 + ($t1 - $t0) * $ly / 31.0)
    for ($lx = 0; $lx -lt 32; $lx++) { P ($ox + $lx) ($oy + $ly) $c }
  }
}

# ---- roofs, gate, clock, sky ----
Cone 0 0 3 3
Cone 192 0 1 2
Cone 160 96 2 2
Clock 207.5 79.5
SkyTile 224 0 0.0 0.5
SkyTile 224 32 0.5 0.5
SkyTile 224 64 0.5 1.0
SkyTile 192 192 1.0 1.0

# grand gate (3x3 tiles at r0 c3)
$gx = 96; $gy = 0
Bricks $gx $gy 96 96
$acx = $gx + 47.5; $acy = $gy + 40.0
$dark = Hex '#1c1824'; $floor = Hex '#6b5a48'
for ($y = $gy; $y -lt $gy + 96; $y++) {
  for ($x = $gx; $x -lt $gx + 96; $x++) {
    $dx = $x - $acx; $dy = $y + 0.5 - $acy
    $d = [Math]::Sqrt($dx * $dx + $dy * $dy)
    $inOpen = $(if ($dy -lt 0) { $d -le 26 } else { [Math]::Abs($dx) -le 26 })
    $inRing = $(if ($dy -lt 0) { $d -le 34 } else { [Math]::Abs($dx) -le 34 })
    if ($inOpen) {
      $c = Mix $dark (Hex '#3b3029') (($y - $gy) / 95.0)
      if ($y -ge $gy + 88) { $c = $floor }
      elseif ([Math]::Abs($dx) -ge 19 -and $dy -gt -12) {
        $c = $gold[1]
        if ([Math]::Abs($dx) -ge 25) { $c = $gold[0] } elseif ((($y - $gy) % 12) -eq 0) { $c = $gold[0] } elseif ([Math]::Abs($dx) -lt 21) { $c = $gold[2] }
      }
      P $x $y $c
    } elseif ($inRing) {
      $s = 3
      if ($dy -lt 0) {
        $ang = [Math]::Atan2($dy, $dx) * 180 / [Math]::PI
        if (([Math]::Abs(($ang + 360) % 15) -lt 1.4) -or $d -gt 33.2) { $s = 1 } elseif ($d -lt 27.4) { $s = 4 }
      } else {
        if ((($y - $gy) % 10) -eq 9 -or [Math]::Abs($dx) -gt 33.2) { $s = 1 } elseif ([Math]::Abs($dx) -lt 27.4) { $s = 4 }
      }
      P $x $y $stone[$s]
    }
  }
}
for ($y = $gy + 2; $y -le $gy + 13; $y++) {
  $hw = 3 + [Math]::Floor(($y - $gy - 2) / 4)
  for ($x = [int]($acx - $hw); $x -le [int]($acx + $hw + 1); $x++) { P $x $y $(if ($y -eq $gy + 2) { $gold[3] } elseif ($x -le [int]($acx - $hw)) { $gold[0] } else { $gold[2] }) }
}

# ---- towers ----
TowerBody 0 96 3 'ring'; TowerBody 0 128 3 'window'; TowerBody 0 160 3 'plain'; TowerBody 0 192 3 'base'; TowerBody 0 288 3 'clock'
TowerBody 96 96 2 'ring'; TowerBody 96 128 2 'window'; TowerBody 96 160 2 'plain'; TowerBody 96 192 2 'base'

# ---- walls ----
Bricks 224 96 32 32
for ($ly = 0; $ly -lt 12; $ly++) { for ($lx = 0; $lx -lt 32; $lx++) { P (224 + $lx) (96 + $ly) ([System.Drawing.Color]::Transparent) } }
for ($ly = 0; $ly -lt 12; $ly++) {
  for ($lx = 0; $lx -lt 32; $lx++) {
    $merlon = ($lx -ge 4 -and $lx -le 13) -or ($lx -ge 20 -and $lx -le 29)
    if ($ly -ge 10) { P (224 + $lx) (96 + $ly) $(if ($ly -eq 10) { $stone[4] } else { $stone[1] }); continue }
    if (-not $merlon) { continue }
    $s = 3
    if ($ly -eq 0 -or $lx -eq 4 -or $lx -eq 20) { $s = 4 } elseif ($lx -eq 13 -or $lx -eq 29) { $s = 1 }
    P (224 + $lx) (96 + $ly) $stone[$s]
  }
}
Bricks 224 128 32 32
Bricks 224 160 32 32; Window 239.5 166 10 20
Bricks 224 192 32 32
for ($ly = 24; $ly -lt 32; $ly++) { for ($lx = 0; $lx -lt 32; $lx++) { P (224 + $lx) (192 + $ly) $(if ($ly -eq 24) { $stone[4] } elseif ($ly -eq 31) { $stone[0] } else { $stone[1] }) } }

# ---- cloud (2 tiles at r5 c5) ----
SkyTile 160 160 0.5 0.5; SkyTile 192 160 0.5 0.5
$puffs = @(@(20, 19, 9), @(33, 14, 11), @(47, 18, 9), @(11, 23, 6), @(55, 23, 6))
for ($y = 160; $y -lt 192; $y++) {
  for ($x = 160; $x -lt 224; $x++) {
    $lx = $x - 160; $ly = $y - 160
    if ($ly -gt 27) { continue }
    $inside = $false
    foreach ($p in $puffs) { if ((($lx - $p[0]) * ($lx - $p[0]) + ($ly - $p[1]) * ($ly - $p[1])) -le $p[2] * $p[2]) { $inside = $true; break } }
    if ($inside) { P $x $y $(if ($ly -ge 24) { Hex '#d5e5f3' } else { Hex '#ffffff' }) }
  }
}

# ---- palace interior (r7, r8) ----
$mar = '#f6f2ea', '#e9e2d4', '#d9cfbb' | ForEach-Object { Hex $_ }
for ($ly = 0; $ly -lt 32; $ly++) {
  for ($lx = 0; $lx -lt 32; $lx++) {
    $c = $mar[0]
    $v = [Math]::Sin($lx * 0.21 + $ly * 0.37) + [Math]::Sin($lx * 0.05 - $ly * 0.13) * 0.6
    if ([Math]::Abs($v) -lt 0.06) { $c = $mar[1] }
    if ($lx -eq 0 -or $ly -eq 0) { $c = $mar[2] }
    $dd = [Math]::Min($lx, 32 - $lx) + [Math]::Min($ly, 32 - $ly)
    if ($dd -le 1) { $c = $gold[3] } elseif ($dd -le 3) { $c = $gold[2] } elseif ($dd -eq 4) { $c = $gold[1] }
    P $lx (224 + $ly) $c
  }
}
$cRed = Hex '#a3192d'; $cPat = Hex '#b92b3e'; $cDark = Hex '#6a0f1d'
function Carpet($ox, $oy, $left, $right, $top) {
  $edge = $gold[1], $gold[3], $gold[2], $gold[1]
  for ($ly = 0; $ly -lt 32; $ly++) {
    for ($lx = 0; $lx -lt 32; $lx++) {
      $c = $cRed
      if ((($lx + $ly) % 16) -eq 8 -or ((($lx - $ly) + 64) % 16) -eq 8) { $c = $cPat }
      if ($left -and $lx -le 3) { $c = $edge[$lx] } elseif ($left -and $lx -eq 4) { $c = $cDark }
      if ($right -and $lx -ge 28) { $c = $edge[31 - $lx] } elseif ($right -and $lx -eq 27) { $c = $cDark }
      if ($top -and $ly -le 3) { $c = $edge[$ly] } elseif ($top -and $ly -eq 4 -and -not (($left -and $lx -le 3) -or ($right -and $lx -ge 28))) { $c = $cDark }
      P ($ox + $lx) ($oy + $ly) $c
    }
  }
}
Carpet 32 224 $true $false $false; Carpet 64 224 $false $false $false; Carpet 96 224 $false $true $false
Carpet 128 224 $true $false $true; Carpet 160 224 $false $false $true; Carpet 192 224 $false $true $true
for ($ly = 0; $ly -lt 32; $ly++) {
  for ($lx = 0; $lx -lt 32; $lx++) {
    $c = Hex '#ebe3d3'
    if ($ly -eq 0) { $c = $gold[3] } elseif ($ly -eq 1) { $c = $gold[2] } elseif ($ly -eq 2) { $c = $gold[1] }
    elseif ($ly -ge 26) { $c = Hex '#d6ccb9' } elseif ($ly -ge 21) { $c = Hex '#c9bca2' } elseif (($lx % 16) -eq 0) { $c = Hex '#d8cdb8' }
    P (224 + $lx) (224 + $ly) $c
  }
}
$wBase = Hex '#efe2c4'; $wPanel = Hex '#e7d7b2'; $wShade = Hex '#c9b68c'; $wLight = Hex '#fbf3df'
for ($ly = 0; $ly -lt 32; $ly++) {
  for ($lx = 0; $lx -lt 32; $lx++) {
    $c = $wBase
    if ($ly -eq 0) { $c = $gold[1] } elseif ($ly -le 2) { $c = $gold[2] } elseif ($ly -eq 3) { $c = $gold[0] }
    elseif ($lx -ge 5 -and $lx -le 26 -and $ly -ge 9) {
      $c = $wPanel
      if ($ly -eq 9 -or $lx -eq 5) { $c = $wShade } elseif ($lx -eq 26) { $c = $wLight }
    }
    P $lx (256 + $ly) $c
  }
}
$wain = Hex '#7c2d2a'; $wainIn = Hex '#8e3632'; $wainDk = Hex '#4f1714'; $wainLt = Hex '#a8524a'
for ($ly = 0; $ly -lt 32; $ly++) {
  for ($lx = 0; $lx -lt 32; $lx++) {
    $c = $wain
    if ($ly -eq 0) { $c = $gold[3] } elseif ($ly -eq 1) { $c = $gold[2] } elseif ($ly -eq 2) { $c = $gold[0] }
    elseif ($ly -ge 27) { $c = $(if ($ly -eq 27) { Hex '#5a201c' } else { Hex '#3e1512' }) }
    elseif ($lx -ge 4 -and $lx -le 27 -and $ly -ge 7 -and $ly -le 22) {
      $c = $wainIn
      if ($ly -eq 7 -or $lx -eq 4) { $c = $wainDk } elseif ($ly -eq 22 -or $lx -eq 27) { $c = $wainLt }
    }
    P (32 + $lx) (256 + $ly) $c
  }
}

$out = Join-Path $outDir 'castle_extra.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $out"
