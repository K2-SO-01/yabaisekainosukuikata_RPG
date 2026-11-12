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

# ---- town: the castle town (40x36). Walled all round; the gate is in the south ----
{ my $m = newmap(40, 36);
  fill($m, 'g', 0, 0, 39, 35, 1);
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
  # town walls: the sides seen from above, the south wall from the front, towers at the corners and by the gate
  fill($m, 'g', 0, 8, 0, 33, E(10, 6)); fill($m, 'g', 39, 8, 39, 33, E(10, 6)); fill($m, 'c', 0, 8, 0, 35, 1); fill($m, 'c', 39, 8, 39, 35, 1);
  fill($m, 'd', 0, 34, 39, 34, E(3, 7)); fill($m, 'g', 0, 35, 39, 35, E(6, 7)); fill($m, 'c', 0, 34, 39, 35, 1);
  small_tower($m, 0, 31, 35); small_tower($m, 38, 31, 35);
  fill($m, 'c', $_->[0], 31, $_->[0] + 1, 35, 1) for ([0], [38]);
  for my $y (34, 35) { put($m, 'g', 19, $y, 291); put($m, 'd', 19, $y, 0); put($m, 'c', 19, $y, 0); }
  put($m, 'g', $_, 35, E(6, 7)) for (18, 20);
  # front garden of the castle
  fill($m, 'g', 16, 10, 22, 12, 291);
  statue($m, 16, 10); statue($m, 22, 10);
  put($m, 'd', $_, 10, ($_ % 2) ? 53 : 56) for (10 .. 14, 24 .. 28);
  bush($m, $_, 11) for (10, 14, 24, 28);
  # streets: the main street, the plaza with the fountain, and paths to each door
  fill($m, 'g', 18, 13, 20, 33, 291); fill($m, 'g', 14, 15, 24, 22, 291);
  fill($m, 'g', 6, 18, 17, 18, 291); fill($m, 'g', 21, 16, 33, 16, 291); fill($m, 'g', 21, 23, 33, 23, 291);
  fill($m, 'g', 6, 33, 18, 33, 291); fill($m, 'g', 20, 33, 32, 33, 291); fill($m, 'g', 11, 22, 11, 23, 291); fill($m, 'g', 11, 27, 11, 32, 291);
  fill($m, 'g', 26, 27, 26, 32, 291); fill($m, 'g', 11, 19, 13, 22, 291);
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 18 + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 18 + $dy, 1); } }
  # the canal across the town, and three bridges
  water($m, [1, 24, 38, 26]);
  bridge($m, 18, 24, 'ns'); bridge($m, 10, 24, 'ns'); bridge($m, 25, 24, 'ns');
  # buildings
  house($m, 2, 12, 8, 6, 'blue', 6, name => '民家');
  house($m, 29, 10, 9, 6, 'grey', 33, name => '武器と防具の店', signs => [[31, 657], [35, 658]]);
  house($m, 29, 17, 9, 6, 'orange', 33, name => '道具屋', signs => [[31, 666], [35, 659]]);
  house($m, 2, 27, 8, 6, 'red', 6, name => '主人公の家');
  house($m, 29, 27, 8, 6, 'wood', 32, name => '空き家');
  # inside the hero's home
  thing($m, 3, 28, 777, 785); thing($m, 4, 28, 778, 786);
  drawer2($m, 8, 28, item => 'cure_potion');
  pot2($m, 3, 30, item => 'potion_s');
  obj($m, 'おじさん', 'npc', 5, 28, character => 'oji', dialogue => 'oji_after', dir => 'down');
  obj($m, 'おばさん', 'npc', 6, 28, character => 'oba', script => 'talk_oba', dir => 'down');
  obj($m, '旅立ち', 'trigger', 6, 30, script => 'home_event', unless => 'home_event_done');
  # inside the other house (the mother waiting for her son)
  thing($m, 8, 13, 779, 787); drawer2($m, 3, 13, gold => 30);
  pot2($m, 8, 15, item => 'potion_s'); pot2($m, 3, 15);
  obj($m, '町の人H', 'npc', 5, 14, character => 'town_h', dialogue => 'town_h', dir => 'down');
  # the empty house
  thing($m, 35, 28, 778, 786); drawer2($m, 30, 28, item => 'potion_s', count => 2);
  pot2($m, 33, 28, item => 'warp_potion'); pot2($m, 30, 30); pot2($m, 35, 30, gold => 20);
  # the shops: the keeper stands behind the counter
  counter2($m, 31, 35, 12);
  thing($m, $_->[0], 11, $_->[1]) for ([30, 1041], [36, 1042]);
  obj($m, '武器屋', 'npc', 33, 11, character => 'shop_weapon', script => 'talk_shop_weapon', dir => 'down', counter => 1);
  counter2($m, 31, 35, 19);
  thing($m, $_->[0], 18, $_->[1]) for ([30, 877], [36, 878]);
  obj($m, '道具屋', 'npc', 33, 18, character => 'shop_item', script => 'talk_shop_item', dir => 'down', counter => 1);
  # the well
  put($m, 'd', 12, 20, 227); put($m, 'c', 12, 20, 1);
  obj($m, '井戸', 'sign', 12, 20, script => 'well_down');
  # trees and flowers
  tree($m, @$_) for ([12, 13], [25, 12], [12, 28], [27, 28], [14, 30], [23, 30], [3, 21], [9, 21], [27, 18], [27, 20], [37, 28]);
  put($m, 'd', $_->[0], $_->[1], 53) for ([4, 19], [15, 13], [23, 13], [10, 30], [28, 31], [16, 28], [22, 28], [2, 23]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([8, 19], [24, 14], [13, 23], [27, 23], [11, 32], [26, 32]);
  # people
  obj($m, '町の人A', 'npc', 15, 32, character => 'town_a', dialogue => 'town_a', wander => 1);
  obj($m, '町の人B', 'npc', 28, 16, character => 'town_b', dialogue => 'town_b', dir => 'down');
  obj($m, '町の人C', 'npc', 11, 33, character => 'town_c', dialogue => 'town_c', wander => 1);
  obj($m, '町の人D', 'npc', 15, 20, character => 'town_d', dialogue => 'town_d', wander => 1);
  obj($m, '町の人E', 'npc', 12, 11, character => 'town_e', dialogue => 'town_e', wander => 1);
  obj($m, '町の人F', 'npc', 23, 21, character => 'town_f', dialogue => 'town_f', dir => 'left');
  obj($m, '町の人G', 'npc', 25, 22, character => 'town_g', dialogue => 'town_g', wander => 1);
  obj($m, '町の人I', 'npc', 17, 19, character => 'town_i', dialogue => 'town_i', dir => 'right');
  obj($m, '科学の村人', 'npc', 25, 31, character => 'science', dialogue => 'science', dir => 'down');
  obj($m, 'start', 'start', 19, 10, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 23, 14);
  obj($m, '門の兵士', 'npc', 19, 33, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 20, 32, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, 'ルーク', 'npc', 18, 32, character => 'luke', dialogue => 'luke_join', dir => 'right', if => 'home_event_done', unless => 'luke_joined');
  obj($m, '町の門', 'trigger', 19, 34, script => 'town_gate');
  emit($m, "town", "城下町", "town", lift => "5,11,17", town => "town"); }

# ---- the little room under the well ----
{ my $m = newmap(9, 7);
  fill($m, 'g', 0, 0, 8, 6, 6); fill($m, 'g', 0, 0, 8, 0, 449); fill($m, 'g', 0, 1, 8, 1, 457);
  fill($m, 'c', 0, 0, 8, 1, 1); fill($m, 'c', 0, 0, 0, 6, 1); fill($m, 'c', 8, 0, 8, 6, 1); fill($m, 'c', 0, 6, 8, 6, 1);
  fill($m, 'g', 0, 2, 0, 6, 449); fill($m, 'g', 8, 2, 8, 6, 449); fill($m, 'g', 1, 6, 7, 6, 449);
  col2($m, 'd', 4, 2, 295, 303);
  obj($m, 'はしご', 'exit', 4, 3, map => 'town', x => 12, y => 21, dir => 'down');
  obj($m, '宝箱', 'search', 6, 3, kind => 'chest', item => 'potion_m');
  put($m, 'd', $_->[0], $_->[1], 65) for ([2, 5], [7, 5]);
  put($m, 'c', $_->[0], $_->[1], 1) for ([2, 5], [7, 5]);
  obj($m, 'start', 'start', 4, 4, dir => 'down');
  emit($m, 'well', '井戸の底', 'town', back => '#0d0b10'); }

# ---- field_town: the land around the castle town (60x40), drawn like an old-style world map ----
# mountains (can't pass) close the north, west and south; forests and hills can be walked through;
# a river runs north to south east of the town and the bridge leads on to the pass in the east (to the water area)
{ my $m = newmap(60, 40);
  fill($m, 'g', 0, 0, 59, 39, 1);
  my $mount = sub { my ($x0, $y0, $x1, $y1, $snow) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) {
    my $v = ($x * 7 + $y * 13) % 5; my $c = $snow && $v == 0 ? 2 : ($v % 2);
    put($m, 'd', $x, $y, E(10, $c)); put($m, 'c', $x, $y, 1); } } };
  # forests (walkable): one-tile groves of small round trees drawn for this game (extra sheet row 11, c0/c1).
  # every tree sits inside its own tile, so a forest never shows a cut tree; the two groves are mixed so it doesn't look stamped
  my $forest = sub { my ($x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) {
    put($m, 'd', $x, $y, E(11, (($x * 7 + $y * 13) % 3) == 0 ? 1 : 0)); } } };


  $mount->(0, 0, 59, 2, 1); $mount->(0, 37, 59, 39, 0); $mount->(0, 0, 2, 39, 1);
  $mount->(57, 0, 59, 17, 1); $mount->(57, 22, 59, 39, 0); $mount->(54, 15, 56, 17, 0); $mount->(54, 22, 56, 24, 0);
  $mount->(@$_) for ([8, 5, 13, 8, 1], [3, 3, 6, 5, 1], [6, 29, 11, 33, 0], [44, 4, 50, 7, 1], [24, 33, 31, 36, 0], [48, 31, 53, 36, 0], [20, 3, 23, 4, 1]);
  $forest->(@$_) for ([14, 5, 19, 9], [5, 17, 10, 23], [43, 25, 48, 30], [47, 11, 52, 15], [25, 7, 30, 10], [13, 26, 18, 30], [34, 29, 35, 33]);
  # river with a pond, and the bridge on the way east
  water($m, [39, 3, 41, 36], [42, 9, 44, 12], [15, 13, 19, 15]);
  bridge($m, 39, 19, 'ew');
  # hills and flowers
  put($m, 'd', $_->[0], $_->[1], E(11, 2)) for ([24, 17], [35, 11], [11, 15], [46, 34], [33, 22], [21, 29], [50, 20]);
  put($m, 'd', $_->[0], $_->[1], E(10, 3)) for ([22, 22], [33, 13], [12, 11], [46, 20], [50, 27], [24, 27], [8, 26], [35, 24], [52, 9]);
  put($m, 'd', $_->[0], $_->[1], 53) for ([27, 21], [32, 16], [44, 17], [21, 13], [10, 15], [37, 27]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([25, 15], [47, 23], [9, 24], [31, 25]);
  # the castle town
  for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'd', 29 + $dx, 18 + $dy, E(10 + $dy, 4 + $dx)); } }
  fill($m, 'c', 29, 18, 30, 18, 1);
  obj($m, '城下町', 'exit', $_, 19, map => 'town', x => 19, y => 33, dir => 'up') for (29, 30);
  # chests (small things)
  obj($m, '宝箱', 'search', 16, 7, kind => 'chest', item => 'potion_s', count => 2);
  obj($m, '宝箱', 'search', 51, 33 - 3, kind => 'chest', gold => 50);
  # the pass in the east leads to the water area (stage 5)
  obj($m, '東の出口', 'trigger', 59, $_, script => 'to_water_area') for (18 .. 21);
  obj($m, 'start', 'start', 29, 20, dir => 'down');
  emit($m, 'field_town', '城下町周辺', 'field', area => 'field_town'); }
