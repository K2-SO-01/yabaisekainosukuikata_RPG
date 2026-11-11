# Map generator for stage 2 maps (castle throne room, castle hall, castle town, home).
# Output is Tiled-compatible JSON in data/maps. Run from the project root:  perl tools/gen_maps.pl
# Tile number (gid) = row * 8 + column + 1 in [Base]BaseChip_pipo.png.
# Extra castle tiles (tools/draw_castle_tiles.ps1): E(row, column) = 1065 + row * 8 + column.
use strict; use warnings;

sub E { my ($r, $c) = @_; return 1065 + $r * 8 + $c; }
sub newmap { my ($w, $h) = @_; my %m = (w => $w, h => $h, n => 0, objs => []);
  for my $l (qw(g d c)) { $m{$l} = [ map { [ (0) x $w ] } 1 .. $h ]; } return \%m; }
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
  print $o qq({\n  "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": false,\n  "width": $m->{w}, "height": $m->{h}, "tilewidth": 32, "tileheight": 32, "nextlayerid": 5, "nextobjectid": @{[$m->{n} + 1]},\n  "properties": [\n    { "name": "name", "type": "string", "value": "$name" },\n    { "name": "bgm", "type": "string", "value": "$bgm" }$more\n  ],\n  "tilesets": [\n    { "firstgid": 1, "name": "BaseChip", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/[Base]BaseChip_pipo.png", "imagewidth": 256, "imageheight": 4256, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 1064, "margin": 0, "spacing": 0 },\n    { "firstgid": 1065, "name": "CastleExtra", "image": "../../assets/tiles/extra/castle_extra.png", "imagewidth": 256, "imageheight": 320, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 80, "margin": 0, "spacing": 0 }\n  ],\n  "layers": [\n);
  print $o join(",\n", layer($m, 1, 'ground', 'g', 'true'), layer($m, 2, 'deco', 'd', 'true'), layer($m, 3, 'collision', 'c', 'false'));
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

# ---- town: castle town (40x36). The castle front fills the top; stage 3 adds people, shops, houses and the well ----
{ my $m = newmap(40, 36); my $S = 6;
  fill($m, 'g', 0, 0, 39, 35, 1);
  # sky behind the castle
  fill($m, 'g', 0, 0, 39, 0, E(0, 7)); fill($m, 'g', 0, 1, 39, 2, E(1, 7)); fill($m, 'g', 0, 3, 39, 3, E(2, 7)); fill($m, 'g', 0, 4, 39, 4, E(6, 6));
  for my $c ([4, 2], [31, 1], [36, 2]) { put($m, 'g', $c->[0], $c->[1], E(5, 5)); put($m, 'g', $c->[0] + 1, $c->[1], E(5, 6)); }
  # outer wall (rows 4-7) and the castle body (rows 4-9, x 10-28)
  fill($m, 'd', 0, 4, 39, 4, E(3, 7));
  fill($m, 'g', 0, 5, 39, 6, E(4, 7)); fill($m, 'g', 0, 7, 39, 7, E(6, 7));
  put($m, 'g', $_, 6, E(5, 7)) for (1, 5, 8, 31, 34, 38);
  fill($m, 'g', 10, 5, 28, 8, E(4, 7)); fill($m, 'g', 10, 9, 28, 9, E(6, 7));
  put($m, 'g', $_, 6, E(5, 7)) for (12, 16, 17, 21, 22, 26);
  col2($m, 'd', $_, 7, @$BANNER) for (12, 16, 22, 26);
  fill($m, 'c', 0, 0, 39, 7, 1); fill($m, 'c', 10, 8, 28, 9, 1);
  # grand gate and the clock tower above it
  blk($m, 'g', 18, 7, 0, 3, 3, 3); put($m, 'c', 19, 9, 0);
  blk($m, 'd', 18, 0, 0, 0, 3, 3); blk($m, 'd', 18, 3, 3, 0, 3, 1); blk($m, 'd', 18, 4, 4, 0, 3, 1); blk($m, 'd', 18, 5, 9, 0, 3, 1); blk($m, 'd', 18, 6, 5, 0, 3, 1);
  col2($m, 'd', $_, 2, E(0, 6), E(1, 6)) for (17, 21);
  big_tower($m, 13, 1, 9); big_tower($m, 23, 1, 9);
  small_tower($m, 10, 2, 9); small_tower($m, 27, 2, 9);
  small_tower($m, 2, 2, 7); small_tower($m, 36, 2, 7);
  obj($m, 'お城へ', 'exit', 19, 9, map => 'castle_hall', x => 7, y => 11, dir => 'up');
  # front garden: knight statues, flowers
  fill($m, 'g', 16, 10, 22, 12, 291);
  statue($m, 16, 10); statue($m, 22, 10);
  put($m, 'd', $_, 10, ($_ % 2) ? 53 : 56) for (10 .. 14, 24 .. 28);
  bush($m, $_, 11) for (10, 14, 24, 28);
  # border hedges
  for my $x (0 .. 39) { bush($m, $x, 28 + $S); bush($m, $x, 29 + $S); }
  for my $y (8 .. 35) { bush($m, 0, $y); bush($m, 39, $y); }
  # roads and plaza
  fill($m, 'g', 18, 13, 20, 27 + $S, 291); fill($m, 'g', 14, 10 + $S, 24, 16 + $S, 291);
  for my $y (28 + $S, 29 + $S) { put($m, 'g', 19, $y, 291); put($m, 'd', 19, $y, 0); put($m, 'c', 19, $y, 0); }
  fill($m, 'g', 7, 20 + $S, 17, 20 + $S, 291); fill($m, 'g', 7, 18 + $S, 7, 19 + $S, 291);
  # fountain
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 12 + $S + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 12 + $S + $dy, 1); } }
  # the hero's home
  my $hy = 14 + $S;
  fill($m, 'g', 5, $hy, 9, $hy, 580); fill($m, 'g', 5, $hy + 1, 9, $hy + 1, 588); fill($m, 'g', 5, $hy + 2, 9, $hy + 2, 386); fill($m, 'g', 5, $hy + 3, 9, $hy + 3, 394);
  fill($m, 'c', 5, $hy, 9, $hy + 3, 1); col2($m, 'd', 7, $hy + 2, 376, 384); put($m, 'c', 7, $hy + 3, 0);
  col2($m, 'd', $_, $hy + 2, 594, 602) for (6, 8);
  obj($m, '家へ', 'exit', 7, $hy + 3, map => 'home', x => 5, y => 7, dir => 'up');
  # decorations
  put($m, 'd', $_->[0], $_->[1] + $S, 53) for ([3, 6], [12, 8], [30, 7], [33, 20], [10, 24], [26, 22], [4, 22]);
  put($m, 'd', $_->[0], $_->[1] + $S, 56) for ([8, 9], [28, 12], [31, 25], [13, 23], [35, 9]);
  for my $r ([32, 15], [6, 26]) { put($m, 'd', $r->[0], $r->[1] + $S, 65); put($m, 'c', $r->[0], $r->[1] + $S, 1); }
  obj($m, 'start', 'start', 19, 10, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 22, 11 + $S);
  obj($m, '門の兵士', 'npc', 19, 27 + $S, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 20, 27 + $S, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, '町の出口', 'trigger', 19, 29 + $S, script => 'gate_wip');
  emit($m, "town", "城下町", "town", lift => "5,11,17"); }

# ---- home: the hero's home (11x9) ----
{ my $m = newmap(11, 9);
  fill($m, 'g', 0, 0, 10, 0, 498); fill($m, 'g', 0, 1, 10, 1, 506); fill($m, 'c', 0, 0, 10, 1, 1);
  fill($m, 'g', 0, 2, 10, 7, 305); fill($m, 'c', 0, 8, 10, 8, 1);
  put($m, 'g', 5, 8, 305); put($m, 'c', 5, 8, 0);
  for my $b ([1, 2, 777], [2, 2, 778], [9, 5, 779]) { col2($m, 'd', $b->[0], $b->[1], $b->[2], $b->[2] + 8); fill($m, 'c', $b->[0], $b->[1], $b->[0], $b->[1] + 1, 1); }
  for my $f ([4, 713, 721], [6, 716, 724], [8, 762, 770], [9, 763, 771]) { col2($m, 'd', $f->[0], 1, $f->[1], $f->[2]); put($m, 'c', $f->[0], 2, 1); }
  put($m, 'd', 7, 5, 717); put($m, 'c', 7, 5, 1);
  put($m, 'd', 1, 7, 857); put($m, 'c', 1, 7, 1);
  obj($m, 'start', 'start', 5, 7, dir => 'up');
  obj($m, 'おじさん', 'npc', 4, 4, character => 'oji', dialogue => 'oji_after', dir => 'down');
  obj($m, 'おばさん', 'npc', 6, 4, character => 'oba', script => 'talk_oba', dir => 'down');
  obj($m, '旅立ち', 'auto', 0, 0, script => 'home_event', unless => 'home_event_done');
  obj($m, '外へ', 'exit', 5, 8, map => 'town', x => 7, y => 24, dir => 'down');
  emit($m, 'home', '〇〇の家', 'town'); }
