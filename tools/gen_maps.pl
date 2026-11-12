# Map generator for stage 2 maps (castle throne room, castle hall, castle town, home).
# Output is Tiled-compatible JSON in data/maps. Run from the project root:  perl tools/gen_maps.pl
# Tile number (gid) = row * 8 + column + 1 in [Base]BaseChip_pipo.png.
# Extra castle tiles (tools/draw_castle_tiles.ps1): E(row, column) = 1065 + row * 8 + column.
use strict; use warnings;

sub E { my ($r, $c) = @_; return 1065 + $r * 8 + $c; }
sub newmap { my ($w, $h) = @_; my %m = (w => $w, h => $h, n => 0, objs => []);
  for my $l (qw(g d c r)) { $m{$l} = [ map { [ (0) x $w ] } 1 .. $h ]; } return \%m; }
sub put { my ($m, $l, $x, $y, $gid) = @_; return if $x < 0 || $y < 0 || $x >= $m->{w} || $y >= $m->{h}; $m->{$l}[$y][$x] = $gid; }
sub fill { my ($m, $l, $x0, $y0, $x1, $y1, $gid) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { put($m, $l, $x, $y, $gid); } } }
sub col2 { my ($m, $l, $x, $y, @gids) = @_; my $i = 0; for my $gid (@gids) { put($m, $l, $x, $y + $i, $gid); $i++; } }   # vertical run
sub blk { my ($m, $l, $x, $y, $r0, $c0, $w, $h) = @_; for my $dy (0 .. $h - 1) { for my $dx (0 .. $w - 1) { put($m, $l, $x + $dx, $y + $dy, E($r0 + $dy, $c0 + $dx)); } } }
sub obj { my ($m, $name, $type, $x, $y, %p) = @_; $m->{n}++;
  my $props = join(', ', map { my $v = $p{$_}; $v =~ /^-?\d+$/ ? qq({ "name": "$_", "type": "int", "value": $v }) : qq({ "name": "$_", "type": "string", "value": "$v" }) } sort keys %p);
  push @{ $m->{objs} }, qq(        { "id": $m->{n}, "name": "$name", "type": "$type", "x": @{[$x * 32]}, "y": @{[$y * 32]}, "width": 32, "height": 32, "rotation": 0, "visible": true, "properties": [$props] }); }
sub layer { my ($m, $id, $name, $l, $vis) = @_; my $data = join(",\n        ", map { join(',', @$_) } @{ $m->{$l} });
  return qq(    { "id": $id, "type": "tilelayer", "name": "$name", "x": 0, "y": 0, "width": $m->{w}, "height": $m->{h}, "opacity": 1, "visible": $vis,\n      "data": [\n        $data\n      ] }); }
sub emit { my ($m, $file, $name, $bgm, %extra) = @_;
  my $more = join("", map { qq(,
    { "name": "$_", "type": "string", "value": "$extra{$_}" }) } sort keys %extra); open my $o, '>:raw', "data/maps/$file.json" or die "$file: $!";
  print $o qq({\n  "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": false,\n  "width": $m->{w}, "height": $m->{h}, "tilewidth": 32, "tileheight": 32, "nextlayerid": 6, "nextobjectid": @{[$m->{n} + 1]},\n  "properties": [\n    { "name": "name", "type": "string", "value": "$name" },\n    { "name": "bgm", "type": "string", "value": "$bgm" }$more\n  ],\n  "tilesets": [\n    { "firstgid": 1, "name": "BaseChip", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/[Base]BaseChip_pipo.png", "imagewidth": 256, "imageheight": 4256, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 1064, "margin": 0, "spacing": 0 },\n    { "firstgid": 1065, "name": "CastleExtra", "image": "../../assets/tiles/extra/castle_extra.png", "imagewidth": 256, "imageheight": 512, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 128, "margin": 0, "spacing": 0 },
    { "firstgid": 1200, "name": "Water", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/SampleMap/[A]Water_pipo.png", "imagewidth": 2048, "imageheight": 1536, "tilewidth": 32, "tileheight": 32, "columns": 64, "tilecount": 3072, "margin": 0, "spacing": 0, "properties": [{ "name": "frames", "type": "int", "value": 8 }] }\n  ],\n  "layers": [\n);
  print $o join(",\n", layer($m, 1, 'ground', 'g', 'true'), layer($m, 2, 'deco', 'd', 'true'), layer($m, 3, 'collision', 'c', 'false'), layer($m, 5, 'roof', 'r', 'true'));
  print $o qq(,\n    { "id": 4, "type": "objectgroup", "name": "events", "x": 0, "y": 0, "opacity": 1, "visible": true, "draworder": "topdown",\n      "objects": [\n) . join(",\n", @{ $m->{objs} }) . qq(\n      ] }\n  ]\n}\n);
  close $o; print "wrote data/maps/$file.json ($m->{w}x$m->{h}, $m->{n} objects)\n"; }

# base tileset pieces
my ($PILLAR, $PLANT, $STATUE, $BANNER, $STAINED, $CANDLE) = ([907, 915, 923], [912, 920], [909, 917], [829, 837], [631, 639], 1005);
my @GOLD_DOOR = ([645, 646], [653, 654]);
sub pillar { my ($m, $x, $y) = @_; col2($m, 'd', $x, $y, @$PILLAR); fill($m, 'c', $x, $y, $x, $y + 2, 1); }
sub plant { my ($m, $x, $y) = @_; col2($m, 'd', $x, $y, @$PLANT); fill($m, 'c', $x, $y, $x, $y + 1, 1); }
sub statue { my ($m, $x, $y) = @_; col2($m, 'd', $x, $y, @$STATUE); fill($m, 'c', $x, $y, $x, $y + 1, 1); }
sub candle { my ($m, $x, $y) = @_; put($m, 'd', $x, $y, $CANDLE); put($m, 'c', $x, $y, 1); }
sub bush { my ($m, $x, $y) = @_; put($m, 'd', $x, $y, (($x + $y) % 2) ? 42 : 41); put($m, 'c', $x, $y, 1); }

# palace room: wall (2 rows), marble floor, gold-edged red carpet from $cx0 to $cx1
sub palace { my ($m, $cx0, $cx1) = @_;
  fill($m, 'g', 0, 0, $m->{w} - 1, 0, E(8, 0)); fill($m, 'g', 0, 1, $m->{w} - 1, 1, E(8, 1)); fill($m, 'c', 0, 0, $m->{w} - 1, 1, 1);
  fill($m, 'g', 0, 2, $m->{w} - 1, $m->{h} - 1, E(7, 0));
  for my $y (2 .. $m->{h} - 1) { for my $x ($cx0 .. $cx1) {
    my $c = $x == $cx0 ? 0 : $x == $cx1 ? 2 : 1;
    put($m, 'g', $x, $y, $y == 2 ? E(7, 4 + $c) : E(7, 1 + $c)); } }
  fill($m, 'c', 0, $m->{h} - 1, $m->{w} - 1, $m->{h} - 1, 1); fill($m, 'c', $cx0, $m->{h} - 1, $cx1, $m->{h} - 1, 0); }

# towers: big (3 wide) and small (2 wide); roof starts at row $top, body runs down to row $bottom (the last row is the base)
sub big_tower { my ($m, $x, $top, $bottom) = @_;
  blk($m, 'd', $x, $top, 0, 0, 3, 3); blk($m, 'd', $x, $top + 3, 3, 0, 3, 1); blk($m, 'd', $x, $top + 4, 4, 0, 3, 1);
  for my $y ($top + 5 .. $bottom - 1) { blk($m, 'd', $x, $y, 5, 0, 3, 1); }
  blk($m, 'd', $x, $bottom, 6, 0, 3, 1) if $bottom > $top + 4; }
sub small_tower { my ($m, $x, $top, $bottom) = @_;
  blk($m, 'd', $x, $top, 3, 5, 2, 2); blk($m, 'd', $x, $top + 2, 3, 3, 2, 1); blk($m, 'd', $x, $top + 3, 4, 3, 2, 1);
  for my $y ($top + 4 .. $bottom - 1) { blk($m, 'd', $x, $y, 5, 3, 2, 1); }
  blk($m, 'd', $x, $bottom, 6, 3, 2, 1) if $bottom > $top + 3; }

# ---- castle_throne: throne room (21x15) ----
{ my $m = newmap(21, 15);
  palace($m, 9, 11);
  fill($m, 'g', 6, 4, 8, 4, E(7, 7)); fill($m, 'g', 12, 4, 14, 4, E(7, 7));   # dais step
  col2($m, 'd', 10, 1, 813, 821);                                             # throne
  col2($m, 'd', $_, 0, @$BANNER) for (8, 12, 5, 15);
  col2($m, 'd', $_, 0, @$STAINED) for (2, 18);
  candle($m, $_, 2) for (7, 13);
  for my $x (3, 17) { pillar($m, $x, 4); pillar($m, $x, 9); }
  for my $x (1, 19) { statue($m, $x, 2); statue($m, $x, 6); plant($m, $x, 11); }
  obj($m, 'start', 'start', 10, 9, dir => 'up');
  obj($m, '王様', 'npc', 10, 2, character => 'king', script => 'talk_king', dir => 'down');
  obj($m, '大臣', 'npc', 12, 3, character => 'minister', dialogue => 'minister', dir => 'down');
  obj($m, '巫女', 'npc', 8, 3, character => 'priestess', dialogue => 'priestess', dir => 'down');
  obj($m, '謁見', 'auto', 0, 0, script => 'throne_intro', unless => 'audience_done');
  obj($m, 'おじさん', 'npc', 8, 5, character => 'oji', dialogue => 'oji_after', dir => 'up', if => 'ending');
  obj($m, 'おばさん', 'npc', 12, 5, character => 'oba', dialogue => 'oba_morning', dir => 'up', if => 'ending');
  obj($m, 'エンディング', 'auto', 0, 0, script => 'ending_scene', if => 'ending', unless => 'cleared');
  obj($m, '出口', 'exit', $_, 14, map => 'castle_hall', x => 7, y => 2, dir => 'down') for 9 .. 11;
  emit($m, 'castle_throne', '王様のお城', 'castle'); }

# ---- castle_hall: castle entrance hall (16x13) ----
{ my $m = newmap(16, 13);
  palace($m, 7, 8);
  for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'd', 7 + $dx, $dy, $GOLD_DOOR[$dy][$dx]); } }
  put($m, 'c', $_, 1, 0) for (7, 8);
  col2($m, 'd', $_, 0, @$STAINED) for (3, 12);
  col2($m, 'd', $_, 0, @$BANNER) for (5, 10);
  candle($m, $_, 2) for (5, 10);
  for my $x (3, 12) { pillar($m, $x, 4); pillar($m, $x, 8); }
  for my $x (1, 14) { statue($m, $x, 2); plant($m, $x, 9); }
  obj($m, '玉座の間へ', 'exit', $_, 1, map => 'castle_throne', x => 10, y => 13, dir => 'up') for (7, 8);
  obj($m, '城下町へ', 'exit', $_, 12, map => 'town', x => 19, y => 10, dir => 'down') for (7, 8);
  obj($m, '城の兵士', 'npc', 5, 8, character => 'soldier_castle', dialogue => 'castle_soldier', dir => 'right');
  emit($m, 'castle_hall', '王様のお城', 'castle'); }

# ---- water (animated sheet, Tiled corner terrain). Water areas must be at least 2 tiles wide ----
my $WATER = 1200;
my %WPAT = (',,,1' => 389, ',,1,1' => 390, ',,1,' => 391, ',1,,1' => 453, '1,1,1,1' => 454, '1,,1,' => 455,
            ',1,,' => 517, '1,1,,' => 518, '1,,,' => 519, '1,1,1,' => 580, '1,1,,1' => 581, '1,,1,1' => 644, ',1,1,1' => 645);
sub water { my ($m, @rects) = @_; my %set;
  for my $r (@rects) { my ($x0, $y0, $x1, $y1) = @$r; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { $set{"$x,$y"} = 1; } } }
  my $in = sub { my ($x, $y) = @_; return 1 if $x < 0 || $y < 0 || $x >= $m->{w} || $y >= $m->{h}; return $set{"$x,$y"} ? 1 : 0; };
  for my $k (keys %set) { my ($x, $y) = split /,/, $k;
    my $tl = $in->($x - 1, $y - 1) && $in->($x, $y - 1) && $in->($x - 1, $y);
    my $tr = $in->($x, $y - 1) && $in->($x + 1, $y - 1) && $in->($x + 1, $y);
    my $bl = $in->($x - 1, $y) && $in->($x - 1, $y + 1) && $in->($x, $y + 1);
    my $br = $in->($x + 1, $y) && $in->($x, $y + 1) && $in->($x + 1, $y + 1);
    my $pat = join(',', map { $_ ? '1' : '' } ($tl, $tr, $bl, $br));
    my $id = $WPAT{$pat}; if (!defined $id) { warn "water: no tile for '$pat' at $x,$y\n"; $id = 454; }
    put($m, 'g', $x, $y, $WATER + $id); put($m, 'd', $x, $y, 0); put($m, 'c', $x, $y, 1); } }
# 3x3 plank bridges. 'ns' = walk north-south (river runs east-west), 'ew' = walk east-west
sub bridge { my ($m, $x, $y, $dir) = @_; my $base = $dir eq 'ns' ? 268 : 265;
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', $x + $dx, $y + $dy, $base + $dy * 8 + $dx);
    put($m, 'c', $x + $dx, $y + $dy, ($dir eq 'ns' ? $dx == 1 : $dy == 1) ? 0 : 1); } } }
# a tree is 2x2 tiles (tileset rows 1-2, columns 0-1)
sub tree { my ($m, $x, $y) = @_; for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'd', $x + $dx, $y + $dy, 9 + $dx + $dy * 8); put($m, 'c', $x + $dx, $y + $dy, 1); } } }

# ---- buildings you can walk into: the roof disappears while you are inside (the 'roof' layer and a 'house' object) ----
my %ROOF = (red => [580, 588], blue => [579, 587], grey => [581, 589], orange => [578, 586], wood => [577, 585], thatch => [583, 591]);
sub house { my ($m, $x0, $y0, $w, $h, $roof, $door, %o) = @_; my ($x1, $y1) = ($x0 + $w - 1, $y0 + $h - 1);
  fill($m, 'g', $x0 + 1, $y0 + 1, $x1 - 1, $y1 - 2, 305);
  fill($m, 'g', $x0, $y0, $x1, $y0, 506); fill($m, 'g', $x0, $y0, $x0, $y1 - 2, 506); fill($m, 'g', $x1, $y0, $x1, $y1 - 2, 506);
  fill($m, 'c', $x0, $y0, $x1, $y0, 1); fill($m, 'c', $x0, $y0, $x0, $y1, 1); fill($m, 'c', $x1, $y0, $x1, $y1, 1);
  fill($m, 'g', $x0, $y1 - 1, $x1, $y1 - 1, 386); fill($m, 'g', $x0, $y1, $x1, $y1, 394); fill($m, 'c', $x0, $y1 - 1, $x1, $y1, 1);
  col2($m, 'd', $door, $y1 - 1, 376, 384); put($m, 'c', $door, $y1 - 1, 0); put($m, 'c', $door, $y1, 0);
  my %sign = map { $_->[0] => $_->[1] } @{ $o{signs} // [] };
  for my $wx ($x0 + 1 .. $x1 - 1) { next if abs($wx - $door) < 2; if ($sign{$wx}) { put($m, 'd', $wx, $y1 - 1, $sign{$wx}); next; } col2($m, 'd', $wx, $y1 - 1, 594, 602) if ($wx - $x0) % 2 == 0 && !$sign{$wx}; }
  fill($m, 'r', $x0, $y0, $x1, $y1 - 3, $ROOF{$roof}[0]); fill($m, 'r', $x0, $y1 - 2, $x1, $y1 - 2, $ROOF{$roof}[1]);
  obj($m, $o{name} // '建物', 'house', $x0, $y0, w => $w, h => $h); }
sub thing { my ($m, $x, $y, @gids) = @_; col2($m, 'd', $x, $y, @gids); fill($m, 'c', $x, $y, $x, $y + $#gids, 1); }
sub pot2 { my ($m, $x, $y, %p) = @_; thing($m, $x, $y, 857); obj($m, 'つぼ', 'search', $x, $y, kind => 'pot', %p); }
sub drawer2 { my ($m, $x, $y, %p) = @_; thing($m, $x, $y, 713, 721); obj($m, 'タンス', 'search', $x, $y + 1, kind => 'drawer', %p); }
sub counter2 { my ($m, $x0, $x1, $y) = @_; put($m, 'd', $x0, $y, 758); put($m, 'd', $_, $y, 759) for ($x0 + 1 .. $x1 - 1); put($m, 'd', $x1, $y, 760); fill($m, 'c', $x0, $y, $x1, $y, 1); }

# ---- houses you can't enter: the roof and the front wall only; the door is locked ----
sub locked_house { my ($m, $x0, $y0, $w, $h, $roof, $door) = @_; my ($x1, $y1) = ($x0 + $w - 1, $y0 + $h - 1);
  fill($m, 'g', $x0, $y0, $x1, $y1 - 3, $ROOF{$roof}[0]); fill($m, 'g', $x0, $y1 - 2, $x1, $y1 - 2, $ROOF{$roof}[1]);
  fill($m, 'g', $x0, $y1 - 1, $x1, $y1 - 1, 386); fill($m, 'g', $x0, $y1, $x1, $y1, 394); fill($m, 'c', $x0, $y0, $x1, $y1, 1);
  col2($m, 'd', $door, $y1 - 1, 376, 384);
  for my $wx ($x0 .. $x1) { next if abs($wx - $door) < 2; col2($m, 'd', $wx, $y1 - 1, 594, 602) if ($wx - $x0) % 2 == 1; }
  obj($m, '扉', 'sign', $door, $y1, text => 'カギが かかっている。'); }
# little things to fill the streets (each blocks its tile)
my %PROP = (barrel => 876, barrel2 => 860, crate => 861, crate2 => 869, ironbox => 862, pot => 857, pot2 => 858, pot3 => 859,
            sack => 873, sacks => 875, hay => 874, apples => 878, greens => 879, oranges => 880, basket => 877,
            wood => 867, bucket => 865, tub => 866, stump => 868, flowerpot => 944, mail => 229, signpost => 230, rock => 65);
sub props { my ($m, @list) = @_; for my $p (@list) { my ($name, $x, $y) = @$p; my $gid = $PROP{$name} // die "prop $name\n"; put($m, 'd', $x, $y, $gid); put($m, 'c', $x, $y, 1); } }
sub plantpot { my ($m, $x, $y) = @_; thing($m, $x, $y, 912, 920); }
sub flowerbed { my ($m, $x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { put($m, 'g', $x, $y, 1); put($m, 'd', $x, $y, (($x + $y) % 3 == 0) ? 56 : (($x + $y) % 3 == 1) ? 53 : 55); put($m, 'c', $x, $y, 1); } } }

# ---- town: the castle town (40x34). Walled; the castle and its hedged garden in the north, a cobbled main street
#      and cross street, three rows of houses, trees and hedges, a vegetable patch, a stream with a bridge in the north-west ----
sub hedge { my ($m, $x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { put($m, 'd', $x, $y, (($x + $y) % 2) ? 42 : 41); put($m, 'c', $x, $y, 1); } } }
sub ttree { my ($m, @at) = @_; for my $p (@at) { put($m, 'd', $p->[0], $p->[1], E(11, 2)); put($m, 'c', $p->[0], $p->[1], 1); } }
{ my $m = newmap(40, 34);
  fill($m, 'g', 0, 0, 39, 33, 1);
  # sky behind the castle, the castle front, the grand gate and the clock tower
  fill($m, 'g', 0, 0, 39, 0, E(0, 7)); fill($m, 'g', 0, 1, 39, 2, E(1, 7)); fill($m, 'g', 0, 3, 39, 3, E(2, 7)); fill($m, 'g', 0, 4, 39, 4, E(6, 6));
  for my $c ([4, 2], [31, 1], [36, 2]) { put($m, 'g', $c->[0], $c->[1], E(5, 5)); put($m, 'g', $c->[0] + 1, $c->[1], E(5, 6)); }
  fill($m, 'd', 0, 4, 39, 4, E(3, 7));
  fill($m, 'g', 0, 5, 39, 6, E(4, 7)); fill($m, 'g', 0, 7, 39, 7, E(6, 7));
  put($m, 'g', $_, 6, E(5, 7)) for (1, 5, 8, 31, 34, 38);
  fill($m, 'g', 10, 5, 28, 8, E(4, 7)); fill($m, 'g', 10, 9, 28, 9, E(6, 7));
  put($m, 'g', $_, 6, E(5, 7)) for (12, 16, 17, 21, 22, 26);
  col2($m, 'd', $_, 7, @$BANNER) for (12, 16, 22, 26);
  fill($m, 'c', 0, 0, 39, 7, 1); fill($m, 'c', 10, 8, 28, 9, 1);
  blk($m, 'g', 18, 7, 0, 3, 3, 3); put($m, 'c', 19, 9, 0);
  blk($m, 'd', 18, 0, 0, 0, 3, 3); blk($m, 'd', 18, 3, 3, 0, 3, 1); blk($m, 'd', 18, 4, 4, 0, 3, 1); blk($m, 'd', 18, 5, 9, 0, 3, 1); blk($m, 'd', 18, 6, 5, 0, 3, 1);
  col2($m, 'd', $_, 2, E(0, 6), E(1, 6)) for (17, 21);
  big_tower($m, 13, 1, 9); big_tower($m, 23, 1, 9);
  small_tower($m, 10, 2, 9); small_tower($m, 27, 2, 9);
  small_tower($m, 2, 2, 7); small_tower($m, 36, 2, 7);
  obj($m, 'お城へ', 'exit', 19, 9, map => 'castle_hall', x => 7, y => 11, dir => 'up');
  # town walls; the gate is the gap at x 19 in the south
  fill($m, 'g', 0, 8, 0, 31, E(10, 6)); fill($m, 'g', 39, 8, 39, 31, E(10, 6)); fill($m, 'c', 0, 8, 0, 33, 1); fill($m, 'c', 39, 8, 39, 33, 1);
  fill($m, 'd', 0, 32, 39, 32, E(3, 7)); fill($m, 'g', 0, 33, 39, 33, E(6, 7)); fill($m, 'c', 0, 32, 39, 33, 1);
  small_tower($m, 0, 29, 33); small_tower($m, 38, 29, 33); fill($m, 'c', $_->[0], 29, $_->[0] + 1, 33, 1) for ([0], [38]);
  for my $y (32, 33) { for my $x (18 .. 20) { put($m, 'g', $x, $y, 291); put($m, 'd', $x, $y, 0); put($m, 'c', $x, $y, 0); } }
  for my $tx (16, 21) {
    for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'r', $tx + $dx, 29 + $dy, E(3 + $dy, 5 + $dx)); } }
    put($m, 'r', $tx + $_, 31, E(3, 3 + $_)) for (0, 1);
    put($m, 'd', $tx + $_, 32, E(4, 3 + $_)) for (0, 1);
    put($m, 'd', $tx + $_, 33, E(6, 3 + $_)) for (0, 1);
    fill($m, 'c', $tx, 32, $tx + 1, 33, 1); }
  # streets: the cobbled main street (castle -> gate), the cross street, the plaza; dirt paths to the doors
  fill($m, 'g', 18, 10, 20, 31, 291); fill($m, 'g', 1, 16, 38, 17, 291); fill($m, 'g', 15, 16, 23, 21, 291);
  fill($m, 'g', 3, 15, 3, 15, 6); fill($m, 'g', 33, 15, 33, 15, 6);
  fill($m, 'g', 4, 24, 14, 24, 6); fill($m, 'g', 8, 18, 8, 24, 6); fill($m, 'g', 11, 23, 11, 23, 6);
  fill($m, 'g', 27, 24, 38, 24, 6); fill($m, 'g', 32, 18, 32, 24, 6); fill($m, 'g', 35, 23, 35, 23, 6);
  fill($m, 'g', 2, 31, 37, 31, 6); fill($m, 'g', 15, 24, 17, 24, 6); fill($m, 'g', 21, 24, 26, 24, 6);
  fill($m, 'g', 1, 9, 6, 14, 6);                                               # the yard of the house by the stream
  # the castle garden: lawns, hedges, flower beds and two knight statues
  statue($m, 17, 10); statue($m, 21, 10);
  put($m, 'd', $_, 10, ($_ % 2) ? 55 : 54) for (11 .. 15, 23 .. 27);
  put($m, 'c', $_, 10, 1) for (11 .. 15, 23 .. 27);
  hedge($m, 10, 14, 15, 14); hedge($m, 23, 14, 28, 14); hedge($m, 10, 12, 10, 13); hedge($m, 28, 12, 28, 13);
  ttree($m, [12, 12], [14, 12], [24, 12], [26, 12]);
  # the stream in the north-west with a small bridge, and its pond
  water($m, [7, 8, 9, 13], [6, 12, 10, 14]);
  bridge($m, 7, 9, 'ew');
  # houses you can enter (the roof disappears inside)
  house($m, 1, 9, 5, 6, 'orange', 3, name => '民家');
  house($m, 30, 9, 8, 6, 'grey', 33, name => '武器と防具の店', signs => [[31, 657], [36, 658]]);
  house($m, 1, 18, 7, 6, 'red', 4, name => '主人公の家');
  house($m, 24, 18, 8, 6, 'blue', 27, name => '道具屋', signs => [[25, 666], [30, 659]]);
  house($m, 1, 25, 7, 6, 'thatch', 4, name => '空き家');
  # houses you can't enter
  locked_house($m, 9, 18, 6, 5, 'red', 11);
  locked_house($m, 33, 18, 6, 5, 'blue', 35);
  locked_house($m, 23, 25, 6, 5, 'thatch', 25);
  locked_house($m, 31, 25, 7, 6, 'orange', 34);
  # the vegetable patch with a scarecrow and a fence
  for my $y (26 .. 29) { put($m, 'g', 9, $y, 161); put($m, 'g', $_, $y, 162) for (10 .. 12); put($m, 'g', 13, $y, 163); fill($m, 'c', 9, $y, 13, $y, 1); }
  my @crop = (168, 167, 159, 160, 176, 166);
  for my $y (26 .. 29) { for my $x (9 .. 13) { put($m, 'd', $x, $y, $crop[($x * 3 + $y) % @crop]); } }
  col2($m, 'd', 14, 26, 156, 164); fill($m, 'c', 14, 26, 14, 27, 1);
  put($m, 'd', $_, 30, 183) for (9 .. 14); put($m, 'c', $_, 30, 1) for (9 .. 14);
  # inside: the hero's home
  thing($m, 2, 19, 777, 785); thing($m, 3, 19, 778, 786);
  drawer2($m, 6, 19, item => 'cure_potion');
  pot2($m, 2, 21, item => 'potion_s');
  obj($m, 'おじさん', 'npc', 5, 19, character => 'oji', dialogue => 'oji_after', dir => 'down');
  obj($m, 'おばさん', 'npc', 4, 19, character => 'oba', script => 'talk_oba', dir => 'down');
  obj($m, '旅立ち', 'trigger', 4, 21, script => 'home_event', unless => 'home_event_done');
  # inside: the house by the stream (the mother waiting for her son)
  thing($m, 4, 10, 779, 787); drawer2($m, 2, 10, gold => 30); pot2($m, 2, 12, item => 'potion_s');
  obj($m, '町の人H', 'npc', 3, 11, character => 'town_h', dialogue => 'town_h', dir => 'down');
  # inside: the empty house
  thing($m, 6, 26, 778, 786); drawer2($m, 2, 26, item => 'potion_s', count => 2);
  pot2($m, 4, 26, item => 'warp_potion'); pot2($m, 2, 28); pot2($m, 6, 28, gold => 20);
  # inside: the shops
  counter2($m, 32, 35, 11); thing($m, $_->[0], 10, $_->[1]) for ([31, 1041], [36, 1042]);
  obj($m, '武器屋', 'npc', 33, 10, character => 'shop_weapon', script => 'talk_shop_weapon', dir => 'down', counter => 1);
  counter2($m, 26, 29, 20); thing($m, $_->[0], 19, $_->[1]) for ([25, 877], [30, 878]);
  obj($m, '道具屋', 'npc', 27, 19, character => 'shop_item', script => 'talk_shop_item', dir => 'down', counter => 1);
  # the fountain in the plaza, the well
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 18 + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 18 + $dy, 1); } }
  put($m, 'd', 17, 22, 227); put($m, 'c', 17, 22, 1);
  obj($m, '井戸', 'sign', 17, 22, script => 'well_down');
  # trees along the main street and around the town, hedges between the houses
  ttree($m, [16, 23], [16, 25], [16, 27], [22, 23], [22, 25], [22, 27], [8, 15], [29, 15], [12, 15], [25, 15],
            [29, 8], [38, 9], [8, 26], [8, 28], [30, 26], [30, 28], [1, 15], [38, 15], [38, 23], [1, 24], [15, 30], [23, 30]);
  hedge($m, 15, 25, 15, 29);
  # a few things by the doors
  props($m, [barrel => 5, 15], [crate => 2, 15], [barrel => 23, 22], [sacks => 38, 25],
            [pot => 37, 15], [wood => 14, 25], [flowerpot => 15, 22], [flowerpot => 23, 23], [mail => 10, 23]);
  # people
  obj($m, '町の人A', 'npc', 24, 30, character => 'town_a', dialogue => 'town_a', dir => 'down');
  obj($m, '町の人B', 'npc', 36, 16, character => 'town_b', dialogue => 'town_b', dir => 'down');
  obj($m, '町の人C', 'npc', 10, 24, character => 'town_c', dialogue => 'town_c', wander => 1);
  obj($m, '町の人D', 'npc', 16, 20, character => 'town_d', dialogue => 'town_d', wander => 1);
  obj($m, '町の人E', 'npc', 13, 11, character => 'town_e', dialogue => 'town_e', wander => 1);
  obj($m, '町の人F', 'npc', 22, 17, character => 'town_f', dialogue => 'town_f', dir => 'left');
  obj($m, '町の人G', 'npc', 36, 31, character => 'town_g', dialogue => 'town_g', wander => 1);
  obj($m, '町の人I', 'npc', 17, 19, character => 'town_i', dialogue => 'town_i', dir => 'right');
  obj($m, '科学の村人', 'npc', 13, 25, character => 'science', dialogue => 'science', dir => 'down');
  obj($m, 'start', 'start', 19, 10, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 21, 22);
  obj($m, '門の兵士', 'npc', 19, 31, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 23, 31, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, '町の門', 'trigger', $_, 32, script => 'town_gate') for (18 .. 20);
  emit($m, "town", "城下町", "town", lift => "5,11,17", town => "town"); }

# ---- the little room under the well ----
{ my $m = newmap(9, 7);
  fill($m, 'g', 0, 0, 8, 6, 6); fill($m, 'g', 0, 0, 8, 0, 449); fill($m, 'g', 0, 1, 8, 1, 457);
  fill($m, 'c', 0, 0, 8, 1, 1); fill($m, 'c', 0, 0, 0, 6, 1); fill($m, 'c', 8, 0, 8, 6, 1); fill($m, 'c', 0, 6, 8, 6, 1);
  fill($m, 'g', 0, 2, 0, 6, 449); fill($m, 'g', 8, 2, 8, 6, 449); fill($m, 'g', 1, 6, 7, 6, 449);
  col2($m, 'd', 4, 2, 295, 303);
  obj($m, 'はしご', 'exit', 4, 3, map => 'town', x => 17, y => 21, dir => 'up');
  obj($m, '宝箱', 'search', 6, 3, kind => 'chest', item => 'potion_m');
  put($m, 'd', $_->[0], $_->[1], 65) for ([2, 5], [7, 5]);
  put($m, 'c', $_->[0], $_->[1], 1) for ([2, 5], [7, 5]);
  obj($m, 'start', 'start', 4, 4, dir => 'down');
  emit($m, 'well', '井戸の底', 'town', back => '#0d0b10'); }

# ---- field_town: the land around the castle town (40x28), like an old-style world map ----
{ my $m = newmap(40, 28);
  fill($m, 'g', 0, 0, 39, 27, 1);
  my $mount = sub { my ($x0, $y0, $x1, $y1, $snow) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) {
    my $v = ($x * 7 + $y * 13) % 5; my $c = $snow && $v == 0 ? 2 : ($v % 2);
    put($m, 'd', $x, $y, E(10, $c)); put($m, 'c', $x, $y, 1); } } };
  # forests (walkable): one-tile groves of small round trees drawn for this game, two kinds mixed
  my $forest = sub { my ($x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) {
    put($m, 'd', $x, $y, E(11, (($x * 7 + $y * 13) % 3) == 0 ? 1 : 0)); } } };
  $mount->(0, 0, 39, 1, 1); $mount->(0, 26, 39, 27, 0); $mount->(0, 0, 1, 27, 1);
  $mount->(38, 0, 39, 11, 1); $mount->(38, 16, 39, 27, 0); $mount->(36, 10, 37, 11, 0); $mount->(36, 16, 37, 17, 0);
  $mount->(@$_) for ([10, 2, 14, 4, 1], [2, 20, 5, 23, 0], [17, 22, 22, 25, 0], [31, 2, 34, 3, 1]);
  $forest->(@$_) for ([3, 3, 8, 7], [20, 3, 24, 6], [30, 18, 35, 22], [9, 19, 14, 23], [31, 6, 35, 8]);
  water($m, [26, 2, 28, 25], [9, 14, 12, 16]);
  bridge($m, 26, 12, 'ew');
  put($m, 'd', $_->[0], $_->[1], E(11, 2)) for ([15, 8], [23, 10], [7, 11], [33, 13], [24, 19]);
  put($m, 'd', $_->[0], $_->[1], E(10, 3)) for ([14, 17], [21, 15], [6, 9], [32, 24], [16, 6]);
  put($m, 'd', $_->[0], $_->[1], 53) for ([16, 14], [22, 8], [5, 13], [30, 15]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([13, 12], [24, 16], [34, 10]);
  # the castle town
  for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'd', 18 + $dx, 11 + $dy, E(10 + $dy, 4 + $dx)); } }
  fill($m, 'c', 18, 11, 19, 11, 1);
  obj($m, '城下町', 'exit', $_, 12, map => 'town', x => 19, y => 31, dir => 'up') for (18, 19);
  obj($m, '宝箱', 'search', 5, 4, kind => 'chest', item => 'potion_s', count => 2);
  obj($m, '宝箱', 'search', 33, 21, kind => 'chest', gold => 50);
  obj($m, '東の出口', 'exit', 39, $_, map => 'field_water', x => 1, y => $_, dir => 'right') for (12 .. 15);
  # Luke runs out of the town after the hero the first time they leave it (he is shown only during that event)
  obj($m, 'ルーク', 'npc', 19, 12, character => 'luke', dialogue => 'luke_join', dir => 'down', if => 'luke_appear', unless => 'luke_joined');
  obj($m, 'ルーク加入', 'auto', 0, 0, script => 'luke_join_field', if => 'home_event_done', unless => 'luke_joined');
  obj($m, 'start', 'start', 18, 13, dir => 'down');
  emit($m, 'field_town', '城下町周辺', 'field', area => 'field_town'); }

# stage 5-7 maps
do './tools/gen_world.pl' or die $@ || $!;
