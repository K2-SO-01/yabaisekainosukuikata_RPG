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
  print $o qq({\n  "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": false,\n  "width": $m->{w}, "height": $m->{h}, "tilewidth": 32, "tileheight": 32, "nextlayerid": 6, "nextobjectid": @{[$m->{n} + 1]},\n  "properties": [\n    { "name": "name", "type": "string", "value": "$name" },\n    { "name": "bgm", "type": "string", "value": "$bgm" }$more\n  ],\n  "tilesets": [\n    { "firstgid": 1, "name": "BaseChip", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/[Base]BaseChip_pipo.png", "imagewidth": 256, "imageheight": 4256, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 1064, "margin": 0, "spacing": 0 },\n    { "firstgid": 1065, "name": "CastleExtra", "image": "../../assets/tiles/extra/castle_extra.png", "imagewidth": 256, "imageheight": 384, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 96, "margin": 0, "spacing": 0 },
    { "firstgid": 1161, "name": "Water", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/SampleMap/[A]Water_pipo.png", "imagewidth": 2048, "imageheight": 1536, "tilewidth": 32, "tileheight": 32, "columns": 64, "tilecount": 3072, "margin": 0, "spacing": 0, "properties": [{ "name": "frames", "type": "int", "value": 8 }] }\n  ],\n  "layers": [\n);
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
my $WATER = 1161;
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
my %ROOF = (red => [580, 588], blue => [579, 587], grey => [581, 589], orange => [578, 586], wood => [577, 585]);
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

# ---- town: the castle town (40x30). A crowded, paved town inside the walls; the gate is in the south ----
{ my $m = newmap(40, 30);
  fill($m, 'g', 0, 0, 39, 29, 291);
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
  # town walls (sides from above, the south wall from the front, towers at the corners); the gate is the gap at x 19
  fill($m, 'g', 0, 8, 0, 27, E(10, 6)); fill($m, 'g', 39, 8, 39, 27, E(10, 6)); fill($m, 'c', 0, 8, 0, 29, 1); fill($m, 'c', 39, 8, 39, 29, 1);
  fill($m, 'd', 0, 28, 39, 28, E(3, 7)); fill($m, 'g', 0, 29, 39, 29, E(6, 7)); fill($m, 'g', 0, 28, 39, 28, 1); fill($m, 'c', 0, 28, 39, 29, 1);
  small_tower($m, 0, 25, 29); small_tower($m, 38, 25, 29); fill($m, 'c', $_->[0], 25, $_->[0] + 1, 29, 1) for ([0], [38]);
  for my $y (28, 29) { put($m, 'g', 19, $y, 291); put($m, 'd', 19, $y, 0); put($m, 'c', 19, $y, 0); }
  # the square in front of the castle and the plaza with the fountain (stone slabs)
  fill($m, 'g', 10, 10, 28, 11, 292); fill($m, 'g', 16, 12, 22, 19, 292);
  statue($m, 17, 10); statue($m, 21, 10);
  plantpot($m, $_, 10) for (11, 27);
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 14 + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 14 + $dy, 1); } }
  # buildings you can enter (the roof disappears inside)
  house($m, 1, 8, 7, 6, 'blue', 4, name => '民家');
  house($m, 8, 12, 8, 6, 'grey', 12, name => '武器と防具の店', signs => [[9, 657], [14, 658]]);
  house($m, 23, 12, 8, 6, 'orange', 27, name => '道具屋', signs => [[24, 666], [29, 659]]);
  house($m, 1, 20, 8, 6, 'red', 5, name => '主人公の家');
  house($m, 30, 20, 8, 6, 'wood', 33, name => '空き家');
  # houses you can't enter
  locked_house($m, 31, 8, 8, 5, 'red', 34);
  locked_house($m, 9, 21, 6, 5, 'wood', 11);
  locked_house($m, 23, 21, 6, 5, 'blue', 25);
  # inside: the hero's home
  thing($m, 2, 21, 777, 785); thing($m, 3, 21, 778, 786);
  drawer2($m, 7, 21, item => 'cure_potion');
  pot2($m, 2, 23, item => 'potion_s');
  obj($m, 'おじさん', 'npc', 4, 21, character => 'oji', dialogue => 'oji_after', dir => 'down');
  obj($m, 'おばさん', 'npc', 5, 21, character => 'oba', script => 'talk_oba', dir => 'down');
  obj($m, '旅立ち', 'trigger', 5, 23, script => 'home_event', unless => 'home_event_done');
  # inside: the other house (the mother waiting for her son)
  thing($m, 6, 9, 779, 787); drawer2($m, 2, 9, gold => 30);
  pot2($m, 2, 11, item => 'potion_s'); pot2($m, 6, 11);
  obj($m, '町の人H', 'npc', 4, 10, character => 'town_h', dialogue => 'town_h', dir => 'down');
  # inside: the empty house
  thing($m, 36, 21, 778, 786); drawer2($m, 31, 21, item => 'potion_s', count => 2);
  pot2($m, 34, 21, item => 'warp_potion'); pot2($m, 31, 23); pot2($m, 36, 23, gold => 20);
  # inside: the shops
  counter2($m, 10, 13, 14); thing($m, $_->[0], 13, $_->[1]) for ([9, 1041], [14, 1042]);
  obj($m, '武器屋', 'npc', 12, 13, character => 'shop_weapon', script => 'talk_shop_weapon', dir => 'down', counter => 1);
  counter2($m, 25, 28, 14); thing($m, $_->[0], 13, $_->[1]) for ([24, 877], [29, 878]);
  obj($m, '道具屋', 'npc', 27, 13, character => 'shop_item', script => 'talk_shop_item', dir => 'down', counter => 1);
  # the well
  put($m, 'd', 16, 23, 227); put($m, 'c', 16, 23, 1);
  obj($m, '井戸', 'sign', 16, 23, script => 'well_down');
  # the clutter of a busy town
  props($m, [crate => 1, 15], [crate2 => 2, 15], [barrel => 1, 16], [sacks => 2, 16], [barrel2 => 1, 17], [wood => 7, 15],
            [mail => 7, 14], [bucket => 6, 17], [pot => 3, 19], [pot2 => 4, 19]);
  thing($m, 5, 15, 231, 239); thing($m, 6, 15, 232, 240);                       # notice board
  props($m, [apples => 31, 15], [oranges => 32, 15], [greens => 33, 15], [basket => 34, 15], [crate => 36, 14], [crate2 => 37, 14],
            [ironbox => 37, 15], [sack => 38, 14], [hay => 38, 16], [barrel => 31, 17], [barrel2 => 32, 17], [tub => 37, 18]);
  props($m, [barrel => 15, 20], [crate => 15, 21], [flowerpot => 17, 20], [flowerpot => 17, 22], [bucket => 17, 24], [stump => 15, 25]);
  props($m, [barrel => 21, 20], [barrel2 => 22, 20], [crate => 22, 21], [flowerpot => 21, 23], [sacks => 22, 26], [pot3 => 29, 26]);
  props($m, [crate => 2, 27], [barrel => 3, 27], [wood => 13, 27], [hay => 25, 27], [crate2 => 31, 27], [barrel => 36, 27], [pot2 => 37, 27]);
  props($m, [signpost => 18, 25], [flowerpot => 8, 19], [flowerpot => 23, 19], [flowerpot => 30, 19]);
  plantpot($m, $_->[0], $_->[1]) for ([8, 10], [30, 9]);
  flowerbed($m, 2, 18, 3, 18); flowerbed($m, 35, 18, 36, 18); flowerbed($m, 11, 19, 12, 19); flowerbed($m, 26, 19, 27, 19);
  # people
  obj($m, '町の人A', 'npc', 17, 26, character => 'town_a', dialogue => 'town_a', wander => 1);
  obj($m, '町の人B', 'npc', 14, 18, character => 'town_b', dialogue => 'town_b', dir => 'down');
  obj($m, '町の人C', 'npc', 7, 26, character => 'town_c', dialogue => 'town_c', wander => 1);
  obj($m, '町の人D', 'npc', 17, 13, character => 'town_d', dialogue => 'town_d', wander => 1);
  obj($m, '町の人E', 'npc', 13, 11, character => 'town_e', dialogue => 'town_e', wander => 1);
  obj($m, '町の人F', 'npc', 21, 19, character => 'town_f', dialogue => 'town_f', dir => 'left');
  obj($m, '町の人G', 'npc', 34, 17, character => 'town_g', dialogue => 'town_g', wander => 1);
  obj($m, '町の人I', 'npc', 17, 15, character => 'town_i', dialogue => 'town_i', dir => 'right');
  obj($m, '科学の村人', 'npc', 21, 24, character => 'science', dialogue => 'science', dir => 'down');
  obj($m, 'start', 'start', 19, 10, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 16, 19);
  obj($m, '門の兵士', 'npc', 19, 27, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 20, 26, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, 'ルーク', 'npc', 18, 26, character => 'luke', dialogue => 'luke_join', dir => 'right', if => 'home_event_done', unless => 'luke_joined');
  obj($m, '町の門', 'trigger', 19, 28, script => 'town_gate');
  emit($m, "town", "城下町", "town", lift => "5,11,17", town => "town"); }

# ---- the little room under the well ----
{ my $m = newmap(9, 7);
  fill($m, 'g', 0, 0, 8, 6, 6); fill($m, 'g', 0, 0, 8, 0, 449); fill($m, 'g', 0, 1, 8, 1, 457);
  fill($m, 'c', 0, 0, 8, 1, 1); fill($m, 'c', 0, 0, 0, 6, 1); fill($m, 'c', 8, 0, 8, 6, 1); fill($m, 'c', 0, 6, 8, 6, 1);
  fill($m, 'g', 0, 2, 0, 6, 449); fill($m, 'g', 8, 2, 8, 6, 449); fill($m, 'g', 1, 6, 7, 6, 449);
  col2($m, 'd', 4, 2, 295, 303);
  obj($m, 'はしご', 'exit', 4, 3, map => 'town', x => 16, y => 24, dir => 'down');
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
  obj($m, '城下町', 'exit', $_, 12, map => 'town', x => 19, y => 27, dir => 'up') for (18, 19);
  obj($m, '宝箱', 'search', 5, 4, kind => 'chest', item => 'potion_s', count => 2);
  obj($m, '宝箱', 'search', 33, 21, kind => 'chest', gold => 50);
  obj($m, '東の出口', 'trigger', 39, $_, script => 'to_water_area') for (12 .. 15);
  obj($m, 'start', 'start', 18, 13, dir => 'down');
  emit($m, 'field_town', '城下町周辺', 'field', area => 'field_town'); }
