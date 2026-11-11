# Map generator for stage 2 maps (castle throne room, castle hall, castle town, home).
# Output is Tiled-compatible JSON in data/maps. Run from the project root:  perl tools/gen_maps.pl
# Tile number (gid) = row * 8 + column + 1 in [Base]BaseChip_pipo.png.
use strict; use warnings;

sub newmap { my ($w, $h) = @_; my %m = (w => $w, h => $h, n => 0, objs => []);
  for my $l (qw(g d c)) { $m{$l} = [ map { [ (0) x $w ] } 1 .. $h ]; } return \%m; }
sub put { my ($m, $l, $x, $y, $gid) = @_; $m->{$l}[$y][$x] = $gid; }
sub fill { my ($m, $l, $x0, $y0, $x1, $y1, $gid) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { $m->{$l}[$y][$x] = $gid; } } }
sub col2 { my ($m, $l, $x, $y, @gids) = @_; my $i = 0; for my $gid (@gids) { $m->{$l}[$y + $i][$x] = $gid; $i++; } }   # vertical run
sub obj { my ($m, $name, $type, $x, $y, %p) = @_; $m->{n}++;
  my $props = join(', ', map { my $v = $p{$_}; $v =~ /^-?\d+$/ ? qq({ "name": "$_", "type": "int", "value": $v }) : qq({ "name": "$_", "type": "string", "value": "$v" }) } sort keys %p);
  push @{ $m->{objs} }, qq(        { "id": $m->{n}, "name": "$name", "type": "$type", "x": @{[$x * 32]}, "y": @{[$y * 32]}, "width": 32, "height": 32, "rotation": 0, "visible": true, "properties": [$props] }); }
sub layer { my ($m, $id, $name, $l, $vis) = @_; my $data = join(",\n        ", map { join(',', @$_) } @{ $m->{$l} });
  return qq(    { "id": $id, "type": "tilelayer", "name": "$name", "x": 0, "y": 0, "width": $m->{w}, "height": $m->{h}, "opacity": 1, "visible": $vis,\n      "data": [\n        $data\n      ] }); }
sub emit { my ($m, $file, $name, $bgm) = @_; open my $o, '>:raw', "data/maps/$file.json" or die "$file: $!";
  print $o qq({\n  "type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": false,\n  "width": $m->{w}, "height": $m->{h}, "tilewidth": 32, "tileheight": 32, "nextlayerid": 5, "nextobjectid": @{[$m->{n} + 1]},\n  "properties": [\n    { "name": "name", "type": "string", "value": "$name" },\n    { "name": "bgm", "type": "string", "value": "$bgm" }\n  ],\n  "tilesets": [\n    { "firstgid": 1, "name": "BaseChip", "image": "../../assets/tiles/Pipoya RPG Tileset 32x32/[Base]BaseChip_pipo.png", "imagewidth": 256, "imageheight": 4256, "tilewidth": 32, "tileheight": 32, "columns": 8, "tilecount": 1064, "margin": 0, "spacing": 0 }\n  ],\n  "layers": [\n);
  print $o join(",\n", layer($m, 1, 'ground', 'g', 'true'), layer($m, 2, 'deco', 'd', 'true'), layer($m, 3, 'collision', 'c', 'false'));
  print $o qq(,\n    { "id": 4, "type": "objectgroup", "name": "events", "x": 0, "y": 0, "opacity": 1, "visible": true, "draworder": "topdown",\n      "objects": [\n) . join(",\n", @{ $m->{objs} }) . qq(\n      ] }\n  ]\n}\n);
  close $o; print "wrote data/maps/$file.json ($m->{w}x$m->{h}, $m->{n} objects)\n"; }
sub pillar { my ($m, $x, $y) = @_; col2($m, 'd', $x, $y, 907, 915, 923); fill($m, 'c', $x, $y, $x, $y + 2, 1); }
sub plant { my ($m, $x, $y) = @_; col2($m, 'd', $x, $y, 912, 920); fill($m, 'c', $x, $y, $x, $y + 1, 1); }
sub bush { my ($m, $x, $y) = @_; put($m, 'd', $x, $y, (($x + $y) % 2) ? 42 : 41); put($m, 'c', $x, $y, 1); }

# ---- castle_throne: throne room (19x11) ----
{ my $m = newmap(19, 11);
  fill($m, 'g', 0, 0, 18, 0, 418); fill($m, 'g', 0, 1, 18, 1, 426); fill($m, 'c', 0, 0, 18, 1, 1);
  fill($m, 'g', 0, 2, 18, 9, 292); fill($m, 'c', 0, 10, 18, 10, 1);
  put($m, 'g', 8 + $_, 3, 790 + $_) for 0 .. 2;
  for my $y (4 .. 10) { put($m, 'g', 8 + $_, $y, 798 + $_) for 0 .. 2; }
  fill($m, 'c', 8, 10, 10, 10, 0);
  col2($m, 'd', 9, 1, 813, 821);
  col2($m, 'd', $_, 0, 829, 837) for (6, 12);
  for my $x (4, 14) { pillar($m, $x, 2); pillar($m, $x, 6); }
  plant($m, $_, 2) for (1, 17);
  obj($m, 'start', 'start', 9, 6, dir => 'up');
  obj($m, '王様', 'npc', 9, 2, character => 'king', script => 'talk_king', dir => 'down');
  obj($m, '大臣', 'npc', 11, 3, character => 'minister', dialogue => 'minister', dir => 'down');
  obj($m, '巫女', 'npc', 7, 3, character => 'priestess', dialogue => 'priestess', dir => 'down');
  obj($m, '謁見', 'auto', 0, 0, script => 'throne_intro', unless => 'audience_done');
  obj($m, '出口', 'exit', $_, 10, map => 'castle_hall', x => 7, y => 2, dir => 'down') for 8 .. 10;
  emit($m, 'castle_throne', '王様のお城', 'castle'); }

# ---- castle_hall: castle entrance hall (15x11) ----
{ my $m = newmap(15, 11);
  fill($m, 'g', 0, 0, 14, 0, 418); fill($m, 'g', 0, 1, 14, 1, 426); fill($m, 'c', 0, 0, 14, 1, 1);
  fill($m, 'g', 0, 2, 14, 9, 292); fill($m, 'c', 0, 10, 14, 10, 1);
  put($m, 'g', 6 + $_, 2, 790 + $_) for 0 .. 2;
  for my $y (3 .. 10) { put($m, 'g', 6 + $_, $y, 798 + $_) for 0 .. 2; }
  fill($m, 'c', 6, 10, 8, 10, 0);
  col2($m, 'd', 7, 0, 424, 432); put($m, 'c', 7, 1, 0);
  pillar($m, $_, 4) for (3, 11);
  plant($m, $_, 2) for (1, 13);
  obj($m, '玉座の間へ', 'exit', 7, 1, map => 'castle_throne', x => 9, y => 9, dir => 'up');
  obj($m, '城下町へ', 'exit', $_, 10, map => 'town', x => 19, y => 4, dir => 'down') for 6 .. 8;
  obj($m, '城の兵士', 'npc', 5, 7, character => 'soldier_castle', dialogue => 'castle_soldier', dir => 'right');
  emit($m, 'castle_hall', '王様のお城', 'castle'); }

# ---- town: castle town (40x30). Stage 3 adds people, shops, houses and the well ----
{ my $m = newmap(40, 30);
  fill($m, 'g', 0, 0, 39, 29, 1);
  for my $x (0 .. 39) { bush($m, $x, 0); bush($m, $x, 28); bush($m, $x, 29); }
  for my $y (0 .. 29) { bush($m, 0, $y); bush($m, 39, $y); }
  # castle front wall
  for my $x (11 .. 27) { fill($m, 'g', $x, 0, $x, 2, 450); put($m, 'g', $x, 3, 458); fill($m, 'd', $x, 0, $x, 3, 0); fill($m, 'c', $x, 0, $x, 3, 1); }
  for my $p ([11, 449, 457], [27, 451, 459], [18, 451, 459], [20, 449, 457]) { fill($m, 'g', $p->[0], 0, $p->[0], 2, $p->[1]); put($m, 'g', $p->[0], 3, $p->[2]); }
  col2($m, 'd', 19, 2, 392, 400); put($m, 'c', 19, 3, 0);
  obj($m, 'お城へ', 'exit', 19, 3, map => 'castle_hall', x => 7, y => 9, dir => 'up');
  # roads and plaza
  fill($m, 'g', 18, 4, 20, 27, 291); fill($m, 'g', 14, 10, 24, 16, 291);
  for my $y (28, 29) { put($m, 'g', 19, $y, 291); put($m, 'd', 19, $y, 0); put($m, 'c', 19, $y, 0); }
  fill($m, 'g', 7, 20, 17, 20, 291); fill($m, 'g', 7, 18, 7, 19, 291);
  # fountain
  for my $dy (0 .. 2) { for my $dx (0 .. 2) { put($m, 'd', 18 + $dx, 12 + $dy, 929 + $dy * 8 + $dx); put($m, 'c', 18 + $dx, 12 + $dy, 1); } }
  # the hero's home
  fill($m, 'g', 5, 14, 9, 14, 580); fill($m, 'g', 5, 15, 9, 15, 588); fill($m, 'g', 5, 16, 9, 16, 386); fill($m, 'g', 5, 17, 9, 17, 394);
  fill($m, 'c', 5, 14, 9, 17, 1); col2($m, 'd', 7, 16, 376, 384); put($m, 'c', 7, 17, 0);
  col2($m, 'd', $_, 16, 594, 602) for (6, 8);
  obj($m, '家へ', 'exit', 7, 17, map => 'home', x => 5, y => 7, dir => 'up');
  # decorations
  put($m, 'd', $_->[0], $_->[1], 53) for ([3, 6], [12, 8], [30, 7], [33, 20], [10, 24], [26, 22], [4, 22]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([8, 9], [28, 12], [31, 25], [13, 23], [35, 9]);
  for my $r ([32, 15], [6, 26]) { put($m, 'd', $r->[0], $r->[1], 65); put($m, 'c', $r->[0], $r->[1], 1); }
  obj($m, 'start', 'start', 19, 5, dir => 'down');
  obj($m, '光の結晶', 'savepoint', 22, 11);
  obj($m, '門の兵士', 'npc', 19, 27, character => 'gate_soldier', dialogue => 'gate_before', dir => 'up', unless => 'home_event_done');
  obj($m, '門の兵士', 'npc', 20, 27, character => 'gate_soldier', dialogue => 'gate_after', dir => 'left', if => 'home_event_done');
  obj($m, '町の出口', 'trigger', 19, 29, script => 'gate_wip');
  emit($m, 'town', '城下町', 'town'); }

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
  obj($m, '外へ', 'exit', 5, 8, map => 'town', x => 7, y => 18, dir => 'down');
  emit($m, 'home', '〇〇の家', 'town'); }
