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

# ---- town buildings: roof (2 rows), white wall, brick wall with the door. The door's lower tile is the way in ----
my %ROOF = (red => [580, 588], blue => [579, 587], grey => [581, 589], orange => [578, 586], wood => [577, 585]);
sub building { my ($m, $x, $y, $w, $roof, $door, %o) = @_;
  fill($m, 'g', $x, $y, $x + $w - 1, $y, $ROOF{$roof}[0]); fill($m, 'g', $x, $y + 1, $x + $w - 1, $y + 1, $ROOF{$roof}[1]);
  fill($m, 'g', $x, $y + 2, $x + $w - 1, $y + 2, 386); fill($m, 'g', $x, $y + 3, $x + $w - 1, $y + 3, 394);
  fill($m, 'c', $x, $y, $x + $w - 1, $y + 3, 1);
  col2($m, 'd', $door, $y + 2, 376, 384); put($m, 'c', $door, $y + 3, 0);
  for my $wx ($x .. $x + $w - 1) { next if abs($wx - $door) < 2 || ($o{sign} && $wx == $o{sign}[0]); col2($m, 'd', $wx, $y + 2, 594, 602) if ($wx - $x) % 2 == 1; }
  put($m, 'd', $o{sign}[0], $y + 2, $o{sign}[1]) if $o{sign};
  obj($m, $o{name} // '入口', 'exit', $door, $y + 3, map => $o{to}, x => 5, y => 7, dir => 'up'); }

# ---- town: castle town (40x36). The castle front fills the top ----
{ my $m = newmap(40, 36);
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
  # border hedges; the town gate is the gap at x 19 in the south
  for my $x (0 .. 39) { bush($m, $x, 34); bush($m, $x, 35); }
  for my $y (8 .. 35) { bush($m, 0, $y); bush($m, 39, $y); }
  # roads, plaza and paths to each door
  fill($m, 'g', 18, 13, 20, 33, 291); fill($m, 'g', 14, 16, 24, 22, 291);
  for my $y (34, 35) { put($m, 'g', 19, $y, 291); put($m, 'd', 19, $y, 0); put($m, 'c', 19, $y, 0); }
  fill($m, 'g', 5, 17, 17, 17, 291);               # house 2
  fill($m, 'g', 21, 17, 28, 17, 291);              # weapon shop
  fill($m, 'g', 21, 28, 28, 28, 291);              # item shop
  fill($m, 'g', 21, 33, 32, 33, 291);              # house 3
  fill($m, 'g', 7, 26, 17, 26, 291); fill($m, 'g', 7, 24, 7, 25, 291);   # home
  fill($m, 'g', 11, 27, 13, 30, 291);              # around the well
  # fountain
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 18 + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 18 + $dy, 1); } }
  # buildings
  building($m, 5, 20, 5, 'red', 7, to => 'home', name => '家へ');
  building($m, 3, 13, 5, 'blue', 5, to => 'house2');
  building($m, 26, 13, 6, 'grey', 28, to => 'shop_weapon', sign => [30, 657], name => '武器と防具の店へ');
  building($m, 26, 24, 6, 'orange', 28, to => 'shop_item', sign => [30, 666], name => '道具屋へ');
  building($m, 30, 29, 5, 'wood', 32, to => 'house3');
  # the well (look into it to climb down)
  put($m, 'd', 12, 28, 227); put($m, 'c', 12, 28, 1);
  obj($m, '井戸', 'sign', 12, 28, script => 'well_down');
  # decorations
  put($m, 'd', $_->[0], $_->[1], 53) for ([3, 18], [12, 14], [35, 15], [33, 26], [10, 31], [4, 28], [24, 12], [36, 31]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([8, 15], [36, 19], [13, 32], [23, 31], [2, 23], [11, 19]);
  for my $r ([33, 21], [6, 32], [2, 26]) { put($m, 'd', $r->[0], $r->[1], 65); put($m, 'c', $r->[0], $r->[1], 1); }
  # people (the hint, tips and rumour lines are in data/dialogues/town.json)
  obj($m, '町の人A', 'npc', 15, 31, character => 'town_a', dialogue => 'town_a', wander => 1);
  obj($m, '町の人B', 'npc', 27, 18, character => 'town_b', dialogue => 'town_b', dir => 'down');
  obj($m, '町の人C', 'npc', 11, 23, character => 'town_c', dialogue => 'town_c', wander => 1);
  obj($m, '町の人D', 'npc', 15, 19, character => 'town_d', dialogue => 'town_d', wander => 1);
  obj($m, '町の人E', 'npc', 12, 12, character => 'town_e', dialogue => 'town_e', wander => 1);
  obj($m, '町の人F', 'npc', 23, 21, character => 'town_f', dialogue => 'town_f', dir => 'left');
  obj($m, '町の人G', 'npc', 34, 23, character => 'town_g', dialogue => 'town_g', wander => 1);
  obj($m, '町の人I', 'npc', 17, 19, character => 'town_i', dialogue => 'town_i', dir => 'right');
  obj($m, '科学の村人', 'npc', 24, 30, character => 'science', dialogue => 'science', dir => 'down');
  obj($m, 'start', 'start', 19, 10, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 22, 14);
  obj($m, '門の兵士', 'npc', 19, 33, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 20, 33, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, 'ルーク', 'npc', 18, 33, character => 'luke', dialogue => 'luke_join', dir => 'right', if => 'home_event_done', unless => 'luke_joined');
  obj($m, '町の門', 'trigger', 19, 34, script => 'town_gate');
  emit($m, "town", "城下町", "town", lift => "5,11,17", town => "town"); }

# ---- small rooms (11x9): wooden walls, wooden floor, the door at the bottom middle ----
sub room { my ($back) = @_; my $m = newmap(11, 9);
  fill($m, 'g', 0, 0, 10, 0, 498); fill($m, 'g', 0, 1, 10, 1, 506); fill($m, 'c', 0, 0, 10, 1, 1);
  fill($m, 'g', 0, 2, 10, 7, 305); fill($m, 'c', 0, 8, 10, 8, 1);
  put($m, 'g', 5, 8, 305); put($m, 'c', 5, 8, 0);
  obj($m, 'start', 'start', 5, 7, dir => 'up');
  obj($m, '外へ', 'exit', 5, 8, map => 'town', x => $back->[0], y => $back->[1], dir => 'down');
  return $m; }
sub bed { my ($m, $x, $y, $gid) = @_; col2($m, 'd', $x, $y, $gid, $gid + 8); fill($m, 'c', $x, $y, $x, $y + 1, 1); }
sub furniture { my ($m, $x, $top, $bottom) = @_; col2($m, 'd', $x, 1, $top, $bottom); put($m, 'c', $x, 2, 1); }
sub pot { my ($m, $x, $y, %p) = @_; put($m, 'd', $x, $y, 857); put($m, 'c', $x, $y, 1); obj($m, 'つぼ', 'search', $x, $y, kind => 'pot', %p); }
sub drawer { my ($m, $x, %p) = @_; furniture($m, $x, 713, 721); obj($m, 'タンス', 'search', $x, 2, kind => 'drawer', %p); }
sub counter { my ($m) = @_; put($m, 'd', 3, 3, 758); put($m, 'd', $_, 3, 759) for (4 .. 6); put($m, 'd', 7, 3, 760); fill($m, 'c', 3, 3, 7, 3, 1); }

# ---- home: the hero's home ----
{ my $m = room([7, 24]);
  bed($m, $_->[0], $_->[1], $_->[2]) for ([1, 2, 777], [2, 2, 778], [9, 5, 779]);
  drawer($m, 4, item => 'cure_potion');
  furniture($m, $_->[0], $_->[1], $_->[2]) for ([6, 716, 724], [8, 762, 770], [9, 763, 771]);
  put($m, 'd', 7, 5, 717); put($m, 'c', 7, 5, 1);
  pot($m, 1, 7, item => 'potion_s');
  obj($m, 'おじさん', 'npc', 4, 4, character => 'oji', dialogue => 'oji_after', dir => 'down');
  obj($m, 'おばさん', 'npc', 6, 4, character => 'oba', script => 'talk_oba', dir => 'down');
  obj($m, '旅立ち', 'auto', 0, 0, script => 'home_event', unless => 'home_event_done');
  emit($m, 'home', '〇〇の家', 'town'); }

# ---- house 2 (the mother waiting for her son) ----
{ my $m = room([5, 17]);
  bed($m, 9, 2, 777); bed($m, 8, 2, 779);
  drawer($m, 2, gold => 30);
  furniture($m, 4, 716, 724);
  put($m, 'd', 5, 4, 717); put($m, 'c', 5, 4, 1);
  pot($m, 1, 7, item => 'potion_s'); pot($m, 9, 7);
  obj($m, '町の人H', 'npc', 3, 5, character => 'town_h', dialogue => 'town_h', dir => 'down');
  emit($m, 'house2', '城下町', 'town'); }

# ---- house 3 (nobody home) ----
{ my $m = room([32, 33]);
  bed($m, 1, 2, 778);
  drawer($m, 4, item => 'potion_s', count => 2);
  furniture($m, $_->[0], $_->[1], $_->[2]) for ([6, 716, 724], [7, 716, 724]);
  put($m, 'd', 5, 5, 717); put($m, 'c', 5, 5, 1);
  pot($m, 9, 2, item => 'warp_potion'); pot($m, 1, 7); pot($m, 9, 7, gold => 20);
  emit($m, 'house3', '城下町', 'town'); }

# ---- weapon and armour shop ----
{ my $m = room([28, 17]);
  counter($m);
  furniture($m, $_->[0], $_->[1], $_->[2]) for ([2, 716, 724], [8, 716, 724]);
  for my $s ([1, 4, 1041], [9, 4, 1042], [1, 6, 1043], [9, 6, 1044]) { put($m, 'd', $s->[0], $s->[1], $s->[2]); put($m, 'c', $s->[0], $s->[1], 1); }
  obj($m, '武器屋', 'npc', 5, 2, character => 'shop_weapon', script => 'talk_shop_weapon', dir => 'down', counter => 1);
  emit($m, 'shop_weapon', '武器と防具の店', 'town'); }

# ---- item shop ----
{ my $m = room([28, 28]);
  counter($m);
  furniture($m, $_->[0], $_->[1], $_->[2]) for ([2, 716, 724], [8, 716, 724]);
  for my $s ([1, 4, 877], [9, 4, 878], [1, 6, 858], [9, 6, 859]) { put($m, 'd', $s->[0], $s->[1], $s->[2]); put($m, 'c', $s->[0], $s->[1], 1); }
  obj($m, '道具屋', 'npc', 5, 2, character => 'shop_item', script => 'talk_shop_item', dir => 'down', counter => 1);
  emit($m, 'shop_item', '道具屋', 'town'); }

# ---- the little room under the well ----
{ my $m = newmap(9, 7);
  fill($m, 'g', 0, 0, 8, 6, 6); fill($m, 'g', 0, 0, 8, 0, 449); fill($m, 'g', 0, 1, 8, 1, 457);
  fill($m, 'c', 0, 0, 8, 1, 1); fill($m, 'c', 0, 0, 0, 6, 1); fill($m, 'c', 8, 0, 8, 6, 1); fill($m, 'c', 0, 6, 8, 6, 1);
  fill($m, 'g', 0, 2, 0, 6, 449); fill($m, 'g', 8, 2, 8, 6, 449); fill($m, 'g', 1, 6, 7, 6, 449);
  col2($m, 'd', 4, 2, 295, 303);
  obj($m, 'はしご', 'exit', 4, 3, map => 'town', x => 12, y => 29, dir => 'down');
  obj($m, '宝箱', 'search', 6, 3, kind => 'chest', item => 'potion_m');
  put($m, 'd', $_->[0], $_->[1], 65) for ([2, 5], [7, 5]);
  put($m, 'c', $_->[0], $_->[1], 1) for ([2, 5], [7, 5]);
  obj($m, 'start', 'start', 4, 4, dir => 'down');
  emit($m, 'well', '井戸の底', 'town', back => '#0d0b10'); }

# ---- field_town: the field around the castle town (60x40). Forest on the north, west and south; the way on is the east edge ----
{ my $m = newmap(60, 40);
  fill($m, 'g', 0, 0, 59, 39, 1);
  my $forest = sub { my ($x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { put($m, 'd', $x, $y, ($y % 2) ? 33 : 25); put($m, 'c', $x, $y, 1); } } };
  $forest->(0, 0, 59, 2); $forest->(0, 37, 59, 39); $forest->(0, 0, 2, 39);
  $forest->(57, 0, 59, 16); $forest->(57, 23, 59, 39);
  # tree groups and rocks to walk around
  $forest->(@$_) for ([8, 5, 14, 9], [18, 28, 25, 33], [40, 6, 47, 11], [44, 27, 52, 32], [6, 24, 10, 30], [33, 30, 37, 34], [50, 14, 53, 16]);
  for my $t ([20, 8], [24, 11], [36, 15], [15, 18], [12, 14], [46, 22], [52, 24], [26, 26], [6, 17]) { col2($m, 'd', $t->[0], $t->[1], 9, 17); put($m, 'c', $t->[0], $t->[1] + 1, 1); }
  for my $r ([34, 21], [17, 23], [43, 18], [9, 33], [54, 8]) { put($m, 'd', $r->[0], $r->[1], 65); put($m, 'c', $r->[0], $r->[1], 1); }
  put($m, 'd', $_->[0], $_->[1], 53) for ([22, 20], [38, 25], [13, 12], [49, 20], [30, 30]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([25, 15], [41, 29], [8, 20], [55, 33]);
  put($m, 'd', $_->[0], $_->[1], 49) for ([27, 24], [44, 15], [16, 30], [53, 11], [11, 26]);
  # the dirt road from the town to the east edge
  fill($m, 'g', 29, 22, 30, 24, 6); fill($m, 'g', 30, 24, 39, 25, 6); fill($m, 'g', 38, 19, 39, 25, 6); fill($m, 'g', 38, 19, 59, 20, 6);
  # the castle town (a small castle with two towers)
  small_tower($m, 27, 17, 21); small_tower($m, 31, 17, 21);
  put($m, 'd', $_, 19, E(3, 7)) for (29, 30);
  put($m, 'g', $_, 20, E(4, 7)) for (29, 30);
  put($m, 'g', $_, 21, E(6, 7)) for (29, 30);
  col2($m, 'd', $_, 20, 392, 400) for (29, 30);
  fill($m, 'c', 27, 17, 32, 21, 1);
  obj($m, '城下町', 'exit', $_, 21, map => 'town', x => 19, y => 33, dir => 'up') for (29, 30);
  # chests (small things: potions and gold)
  obj($m, '宝箱', 'search', 11, 10, kind => 'chest', item => 'potion_s', count => 2);
  obj($m, '宝箱', 'search', 49, 33, kind => 'chest', gold => 50);
  # the east edge leads to the water area (stage 5)
  obj($m, '東の出口', 'trigger', 59, $_, script => 'to_water_area') for (19, 20);
  obj($m, 'start', 'start', 30, 22, dir => 'down');
  emit($m, 'field_town', '城下町周辺', 'field', area => 'field_town'); }
