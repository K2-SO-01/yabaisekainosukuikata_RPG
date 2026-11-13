# Stage 5-7 maps: the four villages, the dungeons (mazes) and boss rooms, the fields of each area, the demon castle.
# Loaded by tools/gen_maps.pl (shares its helpers): perl tools/gen_maps.pl
use strict; use warnings;

# ---------- villages (26x20): inn, weapon and armour shop, item shop, one house, five villagers, a save crystal ----------
my %VIL = (
  water   => { name => '水の村', roofs => [qw(blue orange blue wood)],   ground => 1, field => 'field_water',   back => [18, 16] },
  wind    => { name => '風の村', roofs => [qw(thatch wood red thatch)],  ground => 1, field => 'field_wind',    back => [30, 13] },
  fire    => { name => '炎の村', roofs => [qw(red orange red grey)],     ground => 7, field => 'field_fire',    back => [18, 13] },
  thunder => { name => '雷の村', roofs => [qw(grey blue grey wood)],     ground => 2, field => 'field_thunder', back => [7, 13] },
);
for my $k (sort keys %VIL) { my $v = $VIL{$k}; my $m = newmap(26, 20);
  fill($m, 'g', 0, 0, 25, 19, $v->{ground});
  for my $x (0 .. 25) { for my $y (0, 19) { next if $y == 19 && ($x == 12 || $x == 13); put($m, 'd', $x, $y, E(11, ($x + $y) % 3 == 0 ? 1 : 0)); put($m, 'c', $x, $y, 1); } }
  for my $y (1 .. 18) { for my $x (0, 25) { put($m, 'd', $x, $y, E(11, ($x + $y) % 3 == 0 ? 1 : 0)); put($m, 'c', $x, $y, 1); } }
  fill($m, 'g', 12, 1, 13, 19, 291); fill($m, 'g', 1, 9, 24, 10, 291); fill($m, 'g', 4, 18, 24, 18, 6); fill($m, 'g', 5, 17, 5, 17, 6); fill($m, 'g', 19, 17, 19, 17, 6);
  my ($r0, $r1, $r2, $r3) = @{ $v->{roofs} };
  house($m, 2, 2, 8, 6, $r0, 5, name => '宿屋', signs => [[3, 665]]);
  house($m, 16, 2, 8, 6, $r1, 19, name => '武器と防具の店', signs => [[17, 657], [22, 658]]);
  house($m, 16, 11, 8, 6, $r2, 19, name => '道具屋', signs => [[17, 666], [22, 659]]);
  house($m, 2, 11, 7, 6, $r3, 5, name => '民家');
  # the inn: the keeper behind the counter, two beds
  counter2($m, 4, 7, 4); thing($m, 3, 3, 777, 785); thing($m, 8, 3, 778, 786);
  obj($m, '宿の人', 'npc', 6, 3, character => 'innkeeper', script => "inn_$k", dir => 'down', counter => 1);
  counter2($m, 18, 21, 4); thing($m, $_->[0], 3, $_->[1]) for ([17, 1041], [22, 1042]);
  obj($m, '武器屋', 'npc', 19, 3, character => 'shop_weapon', script => "shop_${k}_weapon", dir => 'down', counter => 1);
  counter2($m, 18, 21, 13); thing($m, $_->[0], 12, $_->[1]) for ([17, 877], [22, 878]);
  obj($m, '道具屋', 'npc', 19, 12, character => 'shop_item', script => "shop_${k}_item", dir => 'down', counter => 1);
  thing($m, 7, 12, 779, 787); drawer2($m, 3, 12, item => 'potion_m'); pot2($m, 3, 14, gold => 60); pot2($m, 7, 14);
  # people: next place, a tip, two who are scared of the area's king (their lines change after it falls), and the science villager
  obj($m, 'ヒント', 'npc', 11, 13, character => "vil_${k}_hint", dialogue => "vil_${k}_hint", dir => 'right');
  obj($m, 'コツ', 'npc', 14, 14, character => "vil_${k}_tip", dialogue => "vil_${k}_tip", dir => 'left', wander => 1);
  obj($m, '怖い噂1', 'npc', 9, 8, character => "vil_${k}_fear1", dialogue => "vil_${k}_fear1", dir => 'down', unless => "boss_$k");
  obj($m, '怖い噂1', 'npc', 9, 8, character => "vil_${k}_fear1", dialogue => "vil_${k}_fear1_after", dir => 'down', if => "boss_$k");
  obj($m, '怖い噂2', 'npc', 23, 8, character => "vil_${k}_fear2", dialogue => "vil_${k}_fear2", dir => 'down', unless => "boss_$k");
  obj($m, '怖い噂2', 'npc', 23, 8, character => "vil_${k}_fear2", dialogue => "vil_${k}_fear2_after", dir => 'down', if => "boss_$k");
  obj($m, '科学の村人', 'npc', 10, 16, character => 'science', dialogue => "vil_${k}_science", dir => 'down');
  obj($m, '光の結晶', 'savepoint', 11, 7);
  put($m, 'd', $_->[0], $_->[1], 53) for ([14, 7], [10, 12], [23, 15], [2, 8], [15, 16]);
  put($m, 'd', $_->[0], $_->[1], 56) for ([24, 8], [11, 2], [15, 1], [1, 17]);
  obj($m, '村の出口', 'exit', $_, 19, map => $v->{field}, x => $v->{back}[0], y => $v->{back}[1], dir => 'down') for (12, 13);
  obj($m, 'start', 'start', 12, 17, dir => 'up');
  obj($m, '着いた', 'auto', 0, 0, script => 'wind_join', unless => 'partner_joined') if $k eq 'wind';
  obj($m, '着いた', 'auto', 0, 0, script => 'fire_arrive', unless => 'fire_arrived') if $k eq 'fire';
  emit($m, "village_$k", $v->{name}, 'town', town => "village_$k"); }

# ---------- dungeons: mazes of 2-wide corridors. Floor 1 starts at the entrance; the last floor leads to the boss room ----------
my %DTH = (
  lake    => { floor => 299, face => 457, back => '#101820' },
  tower   => { floor => 292, face => 449, back => '#16161e' },
  volcano => { floor => 6,   face => 457, back => '#1c0e0a', tint => 'rgba(255,70,30,0.13)' },
  storm   => { floor => 292, face => 457, back => '#0c0c14', storm => 1 },
  demon   => { floor => 309, face => 457, back => '#0c0612', tint => 'rgba(40,0,70,0.22)' },
);
sub maze { my ($cw, $ch, $seed) = @_; srand($seed);
  my (%open, %seen); my @start = (int($cw / 2), $ch - 1); my @stack = ([@start]); $seen{"@start"} = 1;
  while (@stack) { my ($x, $y) = @{ $stack[-1] };
    my @n = grep { $_->[0] >= 0 && $_->[1] >= 0 && $_->[0] < $cw && $_->[1] < $ch && !$seen{"$_->[0] $_->[1]"} } ([$x + 1, $y], [$x - 1, $y], [$x, $y + 1], [$x, $y - 1]);
    if (!@n) { pop @stack; next; }
    my $nx = $n[int(rand(@n))]; $open{"$x $y $nx->[0] $nx->[1]"} = $open{"$nx->[0] $nx->[1] $x $y"} = 1; $seen{"$nx->[0] $nx->[1]"} = 1; push @stack, $nx; }
  # distance from the start
  my %dist = ("@start" => 0); my @q = ([@start]);
  while (@q) { my ($x, $y) = @{ shift @q }; for my $n ([$x + 1, $y], [$x - 1, $y], [$x, $y + 1], [$x, $y - 1]) { next unless $open{"$x $y $n->[0] $n->[1]"}; next if exists $dist{"@$n"}; $dist{"@$n"} = $dist{"$x $y"} + 1; push @q, $n; } }
  return (\%open, \%dist, \@start); }
sub cell_tile { my ($cx, $cy) = @_; return (3 * $cx + 1, 3 * $cy + 1); }
# id, floors, theme, area, music, name, the field outside [map, x, y], chest contents per floor (last floor gets the last ones)
sub dungeon { my (%o) = @_; my $th = $DTH{ $o{theme} }; my ($cw, $ch) = (9, 9);
  for my $f (1 .. $o{floors}) { my $m = newmap(3 * $cw + 1, 3 * $ch + 1);
    my ($open, $dist, $start) = maze($cw, $ch, $o{seed} * 10 + $f);
    my %floor;
    for my $cx (0 .. $cw - 1) { for my $cy (0 .. $ch - 1) { my ($tx, $ty) = cell_tile($cx, $cy);
      $floor{"$_ $ty"} = $floor{"$_ " . ($ty + 1)} = 1 for ($tx, $tx + 1);
      if ($open->{"$cx $cy " . ($cx + 1) . " $cy"}) { $floor{($tx + 2) . " $ty"} = $floor{($tx + 2) . " " . ($ty + 1)} = 1; }
      if ($open->{"$cx $cy $cx " . ($cy + 1)}) { $floor{"$tx " . ($ty + 2)} = $floor{($tx + 1) . " " . ($ty + 2)} = 1; } } }
    my ($sx, $sy) = cell_tile(@$start);
    if ($f == 1) { $floor{"$sx " . ($sy + 2)} = $floor{($sx + 1) . " " . ($sy + 2)} = 1; }   # the way out
    for my $y (0 .. $m->{h} - 1) { for my $x (0 .. $m->{w} - 1) {
      if ($floor{"$x $y"}) { put($m, 'g', $x, $y, $th->{floor}); next; }
      put($m, 'c', $x, $y, 1); put($m, 'g', $x, $y, $th->{face}) if $floor{"$x " . ($y + 1)}; } }
    # the end of this floor: the farthest cell
    my ($end) = sort { $dist->{$b} <=> $dist->{$a} || $a cmp $b } keys %$dist; my ($ex, $ey) = cell_tile(split / /, $end);
    my $id = "$o{id}_$f";
    if ($f == 1) {
      obj($m, '出口', 'exit', $_, $sy + 2, map => $o{out}[0], x => $o{out}[1], y => $o{out}[2], dir => 'down') for ($sx, $sx + 1);
      obj($m, '光の結晶', 'savepoint', $sx + 1, $sy);
      obj($m, 'start', 'start', $sx, $sy + 1, dir => 'up');
    } else {
      put($m, 'd', $sx + 1, $sy, E(14, 3)); obj($m, '上の階へ', 'exit', $sx + 1, $sy, map => "$o{id}_" . ($f - 1), x => 'end', y => 'end', dir => 'down');
      obj($m, 'start', 'start', $sx, $sy + 1, dir => 'up');
    }
    put($m, 'd', $ex + 1, $ey, E(14, 2));
    if ($f < $o{floors}) { obj($m, '下の階へ', 'exit', $ex + 1, $ey, map => "$o{id}_" . ($f + 1), x => 'start', y => 'start', dir => 'up'); }
    else { obj($m, 'ボス部屋へ', 'exit', $ex + 1, $ey, map => "$o{id}_boss", x => 6, y => 9, dir => 'up'); }
    obj($m, 'arrive_end', 'mark', $ex, $ey + 1);
    # chests in dead ends (far ones first; the strong equipment goes deepest on the last floor)
    my @dead = grep { my ($cx, $cy) = split / /; my $c = grep { $open->{"$cx $cy $_->[0] $_->[1]"} } ([$cx + 1, $cy], [$cx - 1, $cy], [$cx, $cy + 1], [$cx, $cy - 1]); $c == 1 && $_ ne "@$start" && $_ ne $end } keys %$dist;
    @dead = sort { $dist->{$b} <=> $dist->{$a} || $a cmp $b } @dead;
    my @chests = @{ $o{chests}[$f - 1] // [] };
    for my $i (0 .. $#chests) { last unless @dead; my ($tx, $ty) = cell_tile(split / /, shift @dead); obj($m, '宝箱', 'search', $tx, $ty, kind => 'chest', %{ $chests[$i] }); }
    obj($m, '着いた', 'auto', 0, 0, script => $o{autoFirst}, unless => $o{autoUnless}) if $o{autoFirst} && $f == 1;
    emit($m, $id, $o{name}, $o{bgm}, area => $o{area}, dungeon => 1, back => $th->{back}, ($th->{tint} ? (tint => $th->{tint}) : ()), ($th->{storm} ? (storm => 1) : ()));
  }
  # the boss room (no battles here): a save crystal by the entrance, the boss at the top
  my $m = newmap(13, 11);
  fill($m, 'g', 0, 0, 12, 10, $th->{floor}); fill($m, 'g', 0, 0, 12, 0, $th->{face}); fill($m, 'g', 0, 1, 12, 1, $th->{face});
  fill($m, 'c', 0, 0, 12, 1, 1); fill($m, 'c', 0, 0, 0, 10, 1); fill($m, 'c', 12, 0, 12, 10, 1); fill($m, 'c', 0, 10, 12, 10, 1); put($m, 'c', 6, 10, 0);
  fill($m, 'g', 0, 2, 0, 10, $th->{face}); fill($m, 'g', 12, 2, 12, 10, $th->{face}); fill($m, 'g', 1, 10, 11, 10, $th->{face}); put($m, 'g', 6, 10, $th->{floor});
  if ($o{throne}) { col2($m, 'd', 6, 1, 813, 821); col2($m, 'd', $_, 0, 829, 837) for (4, 8); }
  obj($m, '戻る', 'exit', 6, 10, map => "$o{id}_$o{floors}", x => 'end', y => 'end', dir => 'down');
  obj($m, '光の結晶', 'savepoint', 2, 8);
  obj($m, $o{bossName}, 'npc', 6, $o{throne} ? 2 : 3, enemy => $o{boss}, script => $o{script}, unless => $o{bossFlag});
  if ($o{keepsake}) {
    obj($m, '師匠の形見', 'sign', 6, 3, kind => 'keepsake', script => 'master_keepsake', if => $o{bossFlag}, unless => 'keepsake_got');
    obj($m, '形見に気づく', 'trigger', 6, 9, script => 'keepsake_block', if => 'keepsake_route', unless => 'keepsake_got');
  }
  obj($m, 'start', 'start', 6, 9, dir => 'up');
  emit($m, "$o{id}_boss", $o{name}, $o{bgm}, back => $th->{back}, ($th->{tint} ? (tint => $th->{tint}) : ()), ($th->{storm} ? (storm => 1) : ()));
}
dungeon(id => 'lake_cave', floors => 1, theme => 'lake', area => 'lake', bgm => 'dungeon_lake', name => '湖の洞窟', seed => 1, out => ['field_water', 14, 3],
  chests => [[{ item => 'potion_m' }, { gold => 300 }, { item => 'wake_pendant' }, { item => 'bluelake_sword', itemMage => 'bluelake_rod' }]],
  boss => 'boss_water', bossName => '水の四天王', script => 'boss_water', bossFlag => 'boss_water');
dungeon(id => 'wind_tower', floors => 2, theme => 'tower', area => 'tower', bgm => 'dungeon_tower', name => '風の塔', seed => 2, out => ['field_wind', 8, 9],
  chests => [[{ item => 'mana_potion' }, { gold => 600 }], [{ item => 'calm_charm' }, { item => 'tempest_rod' }]],
  boss => 'boss_wind', bossName => '風の四天王', script => 'boss_wind', bossFlag => 'boss_wind');
dungeon(id => 'volcano', floors => 2, theme => 'volcano', area => 'volcano', bgm => 'dungeon_volcano', name => '火山', seed => 3, out => ['field_fire', 18, 23],
  chests => [[{ item => 'revive_potion' }, { gold => 1000 }], [{ item => 'frost_ring' }, { item => 'flame_helm' }]],
  boss => 'boss_fire', bossName => '炎の四天王', script => 'boss_fire', bossFlag => 'boss_fire');
dungeon(id => 'storm_castle', floors => 3, theme => 'storm', area => 'storm', bgm => 'dungeon_storm', name => '嵐の城', seed => 4, out => ['field_thunder', 30, 14],
  chests => [[{ item => 'potion_l' }], [{ gold => 1500 }], [{ item => 'bolt_bangle' }, { item => 'lightning_edge' }]],
  boss => 'boss_thunder', bossName => '雷の四天王', script => 'boss_thunder', bossFlag => 'boss_thunder', keepsake => 1);
dungeon(id => 'demon_castle', floors => 3, theme => 'demon', area => 'demon', bgm => 'dungeon_demon', name => '魔王城', seed => 5, out => ['field_demon', 30, 14],
  chests => [[{ item => 'revive_potion' }], [{ gold => 2000 }], [{ item => 'saint_rod' }]],
  boss => 'demon1', bossName => '魔王', script => 'boss_demon', bossFlag => 'demon_defeated', throne => 1, autoFirst => 'demon_enter', autoUnless => 'before_demon_done');

# ---------- fields of each area (40x28, like an old-style world map) ----------
sub field_base { my ($m) = @_; fill($m, 'g', 0, 0, 39, 27, 1); }
sub mountains { my ($m, $x0, $y0, $x1, $y1, $snow) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { my $v = ($x * 7 + $y * 13) % 5; put($m, 'd', $x, $y, E(10, $snow && $v == 0 ? 2 : ($v % 2))); put($m, 'c', $x, $y, 1); } } }
sub groves { my ($m, $x0, $y0, $x1, $y1) = @_; for my $y ($y0 .. $y1) { for my $x ($x0 .. $x1) { put($m, 'd', $x, $y, E(11, (($x * 7 + $y * 13) % 3) == 0 ? 1 : 0)); } } }
sub border { my ($m, %gap) = @_;   # mountains all round except the listed gaps: n/s => [x0,x1], w/e => [y0,y1] (lists of ranges)
  for my $x (0 .. 39) { for my $y (0, 1) { next if grep { $x >= $_->[0] && $x <= $_->[1] } @{ $gap{n} // [] }; mountains($m, $x, $y, $x, $y, 1); }
                        for my $y (26, 27) { next if grep { $x >= $_->[0] && $x <= $_->[1] } @{ $gap{s} // [] }; mountains($m, $x, $y, $x, $y, 0); } }
  for my $y (2 .. 25) { for my $x (0, 1) { next if grep { $y >= $_->[0] && $y <= $_->[1] } @{ $gap{w} // [] }; mountains($m, $x, $y, $x, $y, 1); }
                        for my $x (38, 39) { next if grep { $y >= $_->[0] && $y <= $_->[1] } @{ $gap{e} // [] }; mountains($m, $x, $y, $x, $y, 0); } } }
sub icon2 { my ($m, $x, $y, $r, $c) = @_; for my $dy (0, 1) { for my $dx (0, 1) { put($m, 'd', $x + $dx, $y + $dy, E($r + $dy, $c + $dx)); } } fill($m, 'c', $x, $y, $x + 1, $y, 1); }
sub block { my ($m, $x, $y, $kind, $msg, $unless) = @_; obj($m, '道をふさぐもの', 'block', $x, $y, kind => $kind, msg => $msg, unless => $unless); }

# the water area: the village in the middle, the lake to the north with the cave on its north shore; the road north along the lake's east side is under water
{ my $m = newmap(40, 28); field_base($m);
  border($m, w => [[12, 15]], n => [[33, 35]]);
  water($m, [10, 4, 30, 10]);
  groves($m, @$_) for ([3, 17, 8, 22], [24, 18, 30, 23], [32, 12, 35, 16]);
  mountains($m, @$_) for ([12, 20, 16, 24, 0], [3, 3, 6, 5, 1]);
  put($m, 'd', $_->[0], $_->[1], E(11, 2)) for ([9, 13], [26, 14], [34, 22], [6, 10]);
  put($m, 'd', $_->[0], $_->[1], E(10, 3)) for ([22, 16], [13, 15], [35, 9]);
  put($m, 'd', 14, 2, E(12, 2)); put($m, 'c', 14, 2, 1);
  obj($m, '湖の洞窟', 'exit', 14, 2, map => 'lake_cave_1', x => 'start', y => 'start', dir => 'up');
  put($m, 'c', 14, 2, 0);
  icon2($m, 18, 14, 12, 0);
  obj($m, '水の村', 'exit', $_, 15, map => 'village_water', x => 12, y => 18, dir => 'up') for (18, 19);
  for my $y (1, 2) { block($m, $_, $y, 'water', 'block_water', 'boss_water') for 33 .. 35; }
  obj($m, '北の道', 'exit', $_, 0, map => 'field_wind', x => 32, y => 25, dir => 'up') for (33 .. 35);
  obj($m, '西の道', 'exit', 0, $_, map => 'field_town', x => 38, y => $_, dir => 'left') for (12 .. 15);
  obj($m, '宝箱', 'search', 4, 21, kind => 'chest', item => 'potion_m');
  obj($m, 'start', 'start', 1, 13, dir => 'right');
  emit($m, 'field_water', '水エリア', 'field', area => 'lake'); }

# the wind area: the village in the east, the tower on the hill to the west; the pass in the south-west is shut by a gust and a sign
{ my $m = newmap(40, 28); field_base($m);
  border($m, s => [[31, 33], [6, 8]]);
  mountains($m, @$_) for ([4, 4, 6, 6, 1], [12, 3, 16, 6, 1], [20, 14, 24, 18, 0], [3, 20, 5, 25, 0], [10, 20, 12, 25, 0]);
  groves($m, @$_) for ([26, 3, 33, 7], [14, 18, 19, 23], [33, 18, 36, 22]);
  put($m, 'd', $_->[0], $_->[1], E(10, 3)) for ([7, 10], [9, 9], [6, 9], [27, 12], [16, 12]);
  put($m, 'd', $_->[0], $_->[1], E(11, 2)) for ([29, 17], [22, 9], [12, 14]);
  col2($m, 'd', 8, 7, E(12, 3), E(13, 3)); put($m, 'c', 8, 7, 1);
  obj($m, '風の塔', 'exit', 8, 8, map => 'wind_tower_1', x => 'start', y => 'start', dir => 'up');
  icon2($m, 30, 11, 12, 0);
  obj($m, '風の村', 'exit', $_, 12, map => 'village_wind', x => 12, y => 18, dir => 'up') for (30, 31);
  block($m, $_, 25, 'gust', 'block_wind_gust', 'boss_wind') for (6 .. 8);
  block($m, 9, 25, 'sign', 'block_wind_sign', 'boss_wind');
  obj($m, '南の道', 'exit', $_, 27, map => 'field_water', x => 34, y => 2, dir => 'down') for (31 .. 33);
  obj($m, '南西の峠', 'exit', $_, 27, map => 'field_fire', x => 19, y => 1, dir => 'down') for (6 .. 8);
  obj($m, '宝箱', 'search', 35, 20, kind => 'chest', gold => 300);
  obj($m, 'start', 'start', 32, 25, dir => 'up');
  emit($m, 'field_wind', '風エリア', 'field', area => 'tower'); }

# the fire area: the village in the middle, red rocks and the volcano to the south; the way east is blocked by a burning statue
{ my $m = newmap(40, 28); field_base($m);
  border($m, n => [[18, 20]], e => [[21, 22]]);
  mountains($m, @$_) for ([4, 4, 9, 8, 0], [28, 3, 33, 6, 0], [30, 9, 37, 20, 0], [30, 23, 37, 25, 0], [4, 16, 9, 22, 0]);
  for my $r ([14, 19], [16, 20], [21, 19], [23, 20], [13, 22], [24, 22], [15, 24], [22, 24]) { put($m, 'd', $r->[0], $r->[1], 65); put($m, 'c', $r->[0], $r->[1], 1); }
  fill($m, 'g', 14, 18, 23, 25, 7);
  groves($m, @$_) for ([22, 4, 26, 7], [11, 9, 13, 12]);
  icon2($m, 17, 21, 12, 4);
  obj($m, '火山', 'exit', $_, 22, map => 'volcano_1', x => 'start', y => 'start', dir => 'up') for (17, 18);
  icon2($m, 18, 11, 12, 0);
  obj($m, '炎の村', 'exit', $_, 12, map => 'village_fire', x => 12, y => 18, dir => 'up') for (18, 19);
  block($m, 37, $_, 'statue', 'block_fire', 'boss_fire') for (21, 22);
  obj($m, '北の道', 'exit', $_, 0, map => 'field_wind', x => 7, y => 26, dir => 'up') for (18 .. 20);
  obj($m, '東の道', 'exit', 39, $_, map => 'field_thunder', x => 1, y => $_, dir => 'right') for (21, 22);
  obj($m, '宝箱', 'search', 7, 12, kind => 'chest', item => 'potion_m', count => 2);
  obj($m, 'start', 'start', 19, 1, dir => 'down');
  emit($m, 'field_fire', '炎エリア', 'field', area => 'volcano'); }

# the thunder area: the village in the west, the storm castle in the east; beyond it, a barrier of lightning
{ my $m = newmap(40, 28); field_base($m);
  border($m, w => [[21, 22]], e => [[12, 15]]);
  mountains($m, @$_) for ([14, 3, 20, 7, 1], [14, 18, 20, 24, 0], [26, 3, 29, 8, 1], [26, 18, 29, 24, 0], [34, 3, 37, 10, 1], [34, 17, 37, 24, 0]);
  groves($m, @$_) for ([3, 3, 9, 7], [3, 18, 9, 23]);
  put($m, 'd', $_->[0], $_->[1], E(11, 2)) for ([11, 10], [22, 13], [24, 16]);
  icon2($m, 30, 12, 12, 6);
  obj($m, '嵐の城', 'exit', $_, 13, map => 'storm_castle_1', x => 'start', y => 'start', dir => 'up') for (30, 31);
  icon2($m, 7, 11, 12, 0);
  obj($m, '雷の村', 'exit', $_, 12, map => 'village_thunder', x => 12, y => 18, dir => 'up') for (7, 8);
  block($m, 37, $_, 'barrier', 'block_thunder', 'boss_thunder') for (12 .. 15);
  obj($m, '西の道', 'exit', 0, $_, map => 'field_fire', x => 38, y => $_, dir => 'left') for (21, 22);
  obj($m, '東の道', 'exit', 39, $_, map => 'field_demon', x => 1, y => $_, dir => 'right') for (12 .. 15);
  obj($m, '宝箱', 'search', 4, 20, kind => 'chest', item => 'potion_l');
  obj($m, 'start', 'start', 1, 21, dir => 'right');
  emit($m, 'field_thunder', '雷エリア', 'field', area => 'storm', storm => 1); }

# before the demon castle: the castle at the back, dark sky
{ my $m = newmap(40, 28); field_base($m);
  border($m, w => [[12, 15]]);
  mountains($m, @$_) for ([10, 3, 24, 8, 1], [10, 19, 24, 24, 0], [32, 3, 37, 9, 1], [32, 17, 37, 24, 0]);
  icon2($m, 30, 12, 14, 0);
  obj($m, '魔王城', 'exit', $_, 13, map => 'demon_castle_1', x => 'start', y => 'start', dir => 'up') for (30, 31);
  obj($m, '西の道', 'exit', 0, $_, map => 'field_thunder', x => 38, y => $_, dir => 'left') for (12 .. 15);
  obj($m, 'start', 'start', 1, 13, dir => 'right');
  emit($m, 'field_demon', '魔王城前', 'field', area => 'demon', tint => 'rgba(30,0,50,0.25)'); }
1;
