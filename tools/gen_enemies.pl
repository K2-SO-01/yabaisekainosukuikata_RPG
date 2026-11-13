# Writes data/enemies.json: the areas (which enemies appear, battle background, where you go when the party falls),
# every enemy and boss, and their techniques. Numbers were tuned in stage 8 with the balance bot (tools/bot.html).
# steps: how many steps between battles in that area (default 30-40; the long castles use 45-60).
# Run from the project root:  perl tools/gen_enemies.pl
use strict; use warnings; use utf8;
my $M = 'assets/monsters/Pipoya RPG Monster Pack/shade';
my $X = 'assets/monsters/extra';
my $OST = 'assets/monsters/irasutoya/ostrich.png';
# defeat return: the first place whose town you have visited (the inn of the village before the area; the hero's home early on)
my $HOME_TOWN = { map => 'town', x => 4, y => 24, dir => 'down', town => 'town' };
my %INN = map { $_ => { map => "village_$_", x => 5, y => 8, dir => 'down', town => "village_$_" } } qw(water wind fire thunder);
my @areas = (
  field_town => { groups => [0.6, 0.3, 0.1], enemies => [qw(blue_slime green_slime red_slime nitaridake)], bg => ['#a9d8f2', '#e8f6d8'], home => [$HOME_TOWN] },
  lake => { enemies => [qw(merfish aqua_spirit doronuman)], bg => ['#6fa9d6', '#cfe8f3'], home => [$INN{water}, $HOME_TOWN] },
  tower => { enemies => [qw(wind_spirit mini_tornado dash_ostrich)], bg => ['#a7d8c9', '#eef7e6'], home => [$INN{wind}, $INN{water}, $HOME_TOWN] },
  volcano => { enemies => [qw(flame_spirit chibi_salamander homuran)], bg => ['#e08a5a', '#f6d9b8'], home => [$INN{fire}, $INN{wind}, $INN{water}, $HOME_TOWN] },
  storm => { steps => [45, 60], enemies => [qw(thunder_spirit lost_soldier utsuro)], bg => ['#5e6688', '#c9cde0'], home => [$INN{thunder}, $INN{fire}, $INN{wind}, $INN{water}, $HOME_TOWN] },
  demon => { steps => [45, 60], enemies => [qw(dark_knight arch_demon gargoyle)], bg => ['#3a2a4a', '#9a88a8'], home => [$INN{thunder}, $INN{fire}, $INN{wind}, $INN{water}, $HOME_TOWN] },
);
# name, image, hp, atk, def, spd, mat, element, exp, gold, drop, actions, extra
my @enemies = (
  [blue_slime => 'ブルースライム', "$M/pipo-enemy009.png", 15, 8, 14, 5, 3, 'none', 10, [20, 35], 'slime_goo', [qw(attack purupuru_guard)]],
  [green_slime => 'グリーンスライム', "$X/slime_green.png", 13, 8, 6, 13, 3, 'none', 10, [20, 35], 'slime_goo', [qw(attack pyonpyon_attack)]],
  [red_slime => 'レッドスライム', "$X/slime_red.png", 13, 6, 6, 8, 9, 'none', 10, [20, 35], 'slime_goo', [qw(small_fire hinoko_ame)]],
  [nitaridake => 'ニタリダケ', "$M/pipo-enemy008.png", 16, 8, 8, 7, 5, 'none', 10, [20, 35], 'nitari_cap', [qw(attack nemuri_houshi)]],
  [merfish => 'マーフィッシュ', "$M/pipo-enemy042.png", 21, 8, 11, 10, 8, 'water', 15, [50, 70], 'rainbow_scale', [qw(poison_bite mizushibuki)]],
  [aqua_spirit => 'アクアスピリット', "$M/pipo-enemy046a.png", 18, 6, 10, 11, 11, 'water', 15, [50, 70], 'drop_crystal', [qw(sleep_song shizuku_ya)]],
  [doronuman => 'ドロヌマン', "$M/pipo-enemy017.png", 24, 10, 14, 6, 4, 'water', 15, [50, 70], 'mud_ball', [qw(attack dorodango)]],
  [wind_spirit => 'ウィンドスピリット', "$M/pipo-enemy029a.png", 48, 12, 14, 24, 14, 'wind', 18, [80, 110], 'wind_crystal', [qw(wind_confuse tsumujikaze)]],
  [mini_tornado => 'ミニトルネード', "$M/pipo-enemy012a.png", 50, 14, 16, 20, 12, 'wind', 18, [80, 110], 'leaf', [qw(wind_confuse makikomi)]],
  [dash_ostrich => 'ダッシュダチョウ', $OST, 54, 15, 15, 30, 5, 'wind', 18, [80, 110], 'ostrich_feather', [qw(swift_kick kakenuke)]],
  [flame_spirit => 'フレイムスピリット', "$M/pipo-enemy013.png", 81, 12, 26, 24, 32, 'fire', 65, [120, 160], 'flame_crystal', [qw(fire_bolt hibashira)]],
  [chibi_salamander => 'ちびサラマンダー', "$M/pipo-enemy016b.png", 88, 32, 28, 22, 32, 'fire', 65, [120, 160], 'warm_tail', [qw(fire_burn tail_slap)]],
  [homuran => 'ホムラン', "$M/pipo-enemy012.png", 75, 32, 24, 23, 10, 'fire', 65, [120, 160], 'burnt_stone', [qw(fire_tackle bakuhatsu)]],
  [thunder_spirit => 'サンダースピリット', "$M/pipo-enemy029b.png", 95, 13, 32, 36, 42, 'thunder', 70, [120, 150], 'bolt_crystal', [qw(bolt_paralyze raimei_small)]],
  [lost_soldier => 'ロストソルジャー', "$M/pipo-enemy039.png", 118, 44, 40, 30, 7, 'thunder', 70, [120, 150], 'rusty_helm', [qw(sword_attack cover_others)]],
  [utsuro => 'ウツロ', "$M/pipo-enemy010.png", 41, 35, 30, 34, 32, 'thunder', 70, [120, 150], 'nameless_letter', [qw(attack search_name)], { physImmune => \1, immune => ['poison', 'burn'] }],
  [dark_knight => 'ダークナイト', "$M/pipo-enemy018b.png", 211, 63, 50, 40, 9, 'dark', 140, [150, 200], 'iron_shard', [qw(attack dark_sword)]],
  [arch_demon => 'アークデーモン', "$M/pipo-enemy024.png", 203, 54, 42, 42, 62, 'dark', 140, [150, 200], 'demon_horn', [qw(attack dark_flame)]],
  [gargoyle => 'ガーゴイル', "$M/pipo-enemy040b.png", 194, 60, 46, 46, 9, 'dark', 140, [150, 200], 'stone_wing', [qw(attack dive)]],
  # bosses
  [boss_water => '水の四天王', "$X/boss_water.png", 300, 15, 18, 12, 22, 'water', 100, [400, 400], undef, [qw(aqua_splash madoromi poison_scale)],
    { boss => \1, acts => 1, special => 'royal_tidal', chargeText => '水の四天王「おーっほっほっほ!」', immune => ['poison'], bgm => 'boss' }],
  [boss_wind => '風の四天王', "$X/boss_wind.png", 910, 23, 25, 40, 18, 'wind', 120, [800, 800], undef, [qw(dash_kick sonic_boom memai)],
    { boss => \1, acts => 1, first => \1, special => 'mach_rampage', chargeText => '風の四天王「計算中…」', bgm => 'boss' }],
  [boss_fire => '炎の四天王', "$X/boss_fire.png", 1070, 30, 45, 12, 9, 'fire', 300, [1500, 1500], undef, [qw(burning_knuckle muscle_tackle)],
    { boss => \1, acts => 2, special => 'inferno_blow', chargeText => '炎の四天王は 筋肉を 見せつけている！', immune => ['burn'], bgm => 'boss' }],
  [boss_thunder => '雷の四天王', "$M/pipo-enemy026.png", 1500, 31, 54, 30, 31, 'thunder', 350, [2500, 2500], undef, [qw(boss_lightning_slash boss_lightning_bolt)],
    { boss => \1, acts => 2, special => 'raimeizan', chargeText => '雷の四天王は 無言で 剣を構えた…', bgm => 'boss_storm', noJingle => \1 }],
  [demon1 => '魔王', "$M/pipo-enemy043.png", 2300, 22, 69, 35, 33, 'dark', 0, [0, 0], undef, [qw(dark_bolt nightmare)],
    { boss => \1, acts => 2, special => 'end_of_light', chargeText => '魔王「…絶望するがよい」', next => 'demon2', transformTalk => 'demon_transform', bgm => 'demon1', big => 1.25 }],
  [demon2 => '魔王', "$M/pipo-enemy044b.png", 1900, 32, 75, 30, 30, 'dark', 0, [0, 0], undef, [qw(dragon_claw tail_sweep dark_breath)],
    { boss => \1, acts => 3, special => 'abyss_flare', specialPlus => \1, chargeText => '魔王は 翼を 大きく広げた！', bgm => 'demon2', noJingle => \1, big => 1.25 }],
);
# 町に入りこむスライム：旅立ちの直前、町の門で1人で戦う。行動は作戦の表（data/brains/slime.json）を見て頭で決める
# 強さは、作戦の表を学習したあとで、プレイヤーの勝率が7割前後になるように合わせる（tools/bot.html の trainSlime / evalSlime）
push @enemies, [trick_slime => 'いたずらスライム', "$M/pipo-enemy009a.png", 69, 7, 10, 8, 4, 'none', 30, [50, 50], 'slime_goo', [qw(attack slime_press purupuru_guard slime_heal poison_drop)],
  { boss => \1, acts => 1, ai => 'slime', bgm => 'boss', big => 0.65 }];
# 裏ボス「影の勇者」：クリア後に戦える。主人公の見た目（4種）ごとに絵だけちがう。
# 強さは「理想の個体」として固定（レベルや勝率には合わせない）。行動は作戦の表（data/brains/shadow.json）を見て頭で決める
my @SHADOW_ACTS = qw(attack kage_slash kage_wide kage_bolt kage_flare kage_sleep kage_confuse kage_heal kage_power kage_break);
for my $look (qw(m_sword m_mage f_sword f_mage)) {
  push @enemies, ["shadow_$look" => '影の勇者', "$X/shadow_$look.png", 3200, 54, 70, 48, 54, 'dark', 0, [0, 0], undef, [@SHADOW_ACTS],
    { boss => \1, acts => 2, ai => 'shadow', immune => ['poison', 'burn'], bgm => 'shadow', noJingle => \1, big => 1.35 }];
}
# id => name, kind, element, power, target, text, extra
my @skills = (
  # 裏ボス「影の勇者」の技（攻撃・全体攻撃・攻撃魔法・状態異常・回復・補助・弱体。主人公たちの技の影）
  [kage_slash => '影の一太刀', 'physical', 'dark', 1.8, 'one', '{actor}の 影の一太刀！'],
  [kage_wide => '影のなぎ払い', 'physical', 'dark', 1.0, 'all', '{actor}の 影のなぎ払い！'],
  [kage_bolt => '影の雷', 'magic', 'thunder', 1.6, 'one', '{actor}は 影の雷を 落とした！', { inflict => 'paralysis', chance => 0.2 }],
  [kage_flare => '影の業火', 'magic', 'fire', 1.1, 'all', '{actor}は 影の業火を はなった！', { inflict => 'burn', chance => 0.25 }],
  [kage_sleep => '影の子守歌', 'status', undef, undef, 'one', '{actor}は 影の子守歌を うたった…', { inflict => 'sleep', chance => 0.4 }],
  [kage_confuse => '影のささやき', 'status', undef, undef, 'one', '{actor}は 影のささやきを 聞かせた…', { inflict => 'confusion', chance => 0.4 }],
  [kage_heal => '影の再生', 'heal', undef, 0.12, 'self', '{actor}の 影が 傷をふさいでいく…', { cure => \1 }],
  [kage_power => '影の力', 'buff', undef, undef, 'self', '{actor}は 影の力を まとった！', { buff => 'atkUp' }],
  [kage_break => '影ののろい', 'debuff', undef, undef, 'one', '{actor}は 影ののろいを かけた！', { debuff => 'defDown' }],
  [attack => '攻撃', 'physical', 'none', 1, 'one', '{actor}の 攻撃！'],
  # 町に入りこむスライムの技
  [slime_press => 'のしかかり', 'physical', 'none', 1.8, 'one', '{actor}は 大きく ふくらんで のしかかってきた！'],
  [slime_heal => 'ぷるぷる再生', 'heal', undef, 0.25, 'self', '{actor}は ぷるぷるふるえて 傷をふさいだ！', { uses => 2 }],
  [poison_drop => 'どくのしずく', 'status', undef, undef, 'one', '{actor}は どくのしずくを とばした！', { inflict => 'poison', chance => 0.7, uses => 2 }],
  [small_fire => '火の玉', 'magic', 'fire', 1, 'one', '{actor}は 小さな火を はなった！'],
  [purupuru_guard => 'ぷるぷるガード', 'guard', undef, undef, 'self', '{actor}は ぷるぷるガードで 身を守っている！', { uses => 3 }],
  [pyonpyon_attack => 'ぴょんぴょんアタック', 'physical', 'none', 1.3, 'one', '{actor}の ぴょんぴょんアタック！'],
  [hinoko_ame => 'ひのこのあめ', 'magic', 'fire', 0.7, 'all', '{actor}の ひのこのあめ！'],
  [nemuri_houshi => 'ねむりのほうし', 'status', undef, undef, 'one', '{actor}は ねむりのほうしを まきちらした！', { inflict => 'sleep' }],
  [poison_bite => 'かみつき', 'physical', 'water', 1, 'one', '{actor}は するどい牙で かみついた！', { inflict => 'poison' }],
  [mizushibuki => 'みずしぶき', 'magic', 'water', 1, 'one', '{actor}の みずしぶき！'],
  [sleep_song => 'ねむりの歌', 'status', undef, undef, 'one', '{actor}は ねむりの歌を うたった！', { inflict => 'sleep' }],
  [shizuku_ya => 'しずくの矢', 'magic', 'water', 1, 'one', '{actor}の しずくの矢！'],
  [dorodango => 'どろだんごなげ', 'physical', 'none', 0.7, 'all', '{actor}の どろだんごなげ！'],
  [wind_confuse => 'まどわしの風', 'magic', 'wind', 1, 'one', '{actor}は まどわしの風を ふかせた！', { inflict => 'confusion' }],
  [tsumujikaze => 'つむじかぜ', 'magic', 'wind', 0.7, 'all', '{actor}の つむじかぜ！'],
  [makikomi => 'まきこみ', 'physical', 'wind', 1.3, 'one', '{actor}の まきこみ！'],
  [swift_kick => 'すばやいキック', 'physical', 'none', 1, 'one', '{actor}の すばやいキック！'],
  [kakenuke => 'かけぬけ', 'physical', 'none', 0.7, 'all', '{actor}の かけぬけ！'],
  [fire_bolt => '火の魔法', 'magic', 'fire', 1, 'one', '{actor}は 炎を はなった！'],
  [hibashira => 'ひばしら', 'magic', 'fire', 0.7, 'all', '{actor}の ひばしら！'],
  [fire_burn => 'ほのおの息', 'magic', 'fire', 1, 'one', '{actor}は 炎を はいた！', { inflict => 'burn' }],
  [tail_slap => 'しっぽではたく', 'physical', 'none', 1, 'one', '{actor}は しっぽで はたいた！'],
  [fire_tackle => '体当たり', 'physical', 'fire', 1, 'one', '{actor}の 体当たり！', { inflict => 'burn' }],
  [bakuhatsu => 'ばくはつ', 'physical', 'fire', 1.6, 'all', '{actor}は ばくはつした！', { selfDestruct => \1 }],
  [bolt_paralyze => 'いなずま', 'magic', 'thunder', 1, 'one', '{actor}は いなずまを 落とした！', { inflict => 'paralysis' }],
  [raimei_small => 'らいめい', 'magic', 'thunder', 0.7, 'all', '{actor}の らいめい！'],
  [sword_attack => '剣の攻撃', 'physical', 'none', 1, 'one', '{actor}は 剣で 切りつけた！'],
  [cover_others => 'なかまをかばう', 'guard_others', undef, undef, 'self', '{actor}は なかまを かばっている！'],
  [search_name => 'なまえをさがす', 'status', undef, undef, 'one', 'ウツロは 自分の名前を さがしている…', { inflict => 'confusion' }],
  [dark_sword => 'やみのけん', 'physical', 'dark', 1.3, 'one', '{actor}の やみのけん！'],
  [dark_flame => 'やみのほのお', 'magic', 'dark', 0.7, 'all', '{actor}の やみのほのお！'],
  [dive => 'きゅうこうか', 'physical', 'none', 1.3, 'one', '{actor}の きゅうこうか！'],
  # bosses
  [aqua_splash => 'アクアスプラッシュ', 'magic', 'water', 1.5, 'one', '{actor}の アクアスプラッシュ！'],
  [madoromi => 'まどろみの歌', 'status', undef, undef, 'all', '{actor}は まどろみの歌を うたった！', { inflict => 'sleep' }],
  [poison_scale => 'ポイズンスケイル', 'status', undef, undef, 'one', '{actor}の ポイズンスケイル！', { inflict => 'poison' }],
  [royal_tidal => 'ロイヤルタイダル', 'magic', 'water', 2, 'all', '{actor}の ロイヤルタイダル！'],
  [dash_kick => 'ダッシュキック', 'physical', 'none', 1.5, 'one', '{actor}の ダッシュキック！'],
  [sonic_boom => 'ソニックブーム', 'physical', 'wind', 1, 'all', '{actor}の ソニックブーム！'],
  [memai => 'めまいの風', 'status', undef, undef, 'one', '{actor}は めまいの風を ふかせた！', { inflict => 'confusion' }],
  [mach_rampage => 'マッハランページ', 'physical', 'none', 3, 'one', '{actor}の マッハランページ！'],
  [burning_knuckle => 'バーニングナックル', 'physical', 'fire', 1.5, 'one', '{actor}の バーニングナックル！'],
  [muscle_tackle => 'マッスルタックル', 'physical', 'none', 1.5, 'one', '{actor}の マッスルタックル！'],
  [inferno_blow => 'インフェルノブロー', 'physical', 'fire', 3, 'one', '{actor}の インフェルノブロー！', { inflict => 'burn', chance => 1 }],
  [boss_lightning_slash => 'ライトニングスラッシュ', 'physical', 'thunder', 1.5, 'one', '{actor}の ライトニングスラッシュ！'],
  [boss_lightning_bolt => 'ライトニングボルト', 'magic', 'thunder', 1.5, 'one', '{actor}は ライトニングボルトを となえた！', { inflict => 'paralysis', chance => 0.3 }],
  [raimeizan => '雷鳴斬', 'physical', 'thunder', 2, 'all', '{actor}の 雷鳴斬！', { inflict => 'paralysis', chance => 0.3 }],
  [dark_bolt => 'ダークボルト', 'magic', 'dark', 1.5, 'one', '{actor}は ダークボルトを となえた！'],
  [nightmare => 'ナイトメア', 'magic', 'dark', 1, 'all', '{actor}は ナイトメアを となえた！'],
  [end_of_light => 'ジ・エンドオブライト', 'magic', 'dark', 2, 'all', '{actor}の ジ・エンドオブライト！'],
  [dragon_claw => 'ドラゴンクロー', 'physical', 'none', 1.5, 'one', '{actor}の ドラゴンクロー！'],
  [tail_sweep => 'テイルスイープ', 'physical', 'none', 1, 'all', '{actor}の テイルスイープ！'],
  [dark_breath => 'ダークブレス', 'physical', 'dark', 1, 'all', '{actor}は ダークブレスを はいた！'],
  [abyss_flare => 'アビスフレア', 'physical', 'dark', 2.5, 'all', '{actor}の アビスフレア！'],
);

sub js { my ($v) = @_;
  return 'null' unless defined $v;
  if (ref $v eq 'ARRAY') { return '[' . join(', ', map { js($_) } @$v) . ']'; }
  if (ref $v eq 'HASH') { return '{ ' . join(', ', map { "\"$_\": " . js($v->{$_}) } sort keys %$v) . ' }'; }
  if (ref $v eq 'SCALAR') { return $$v ? 'true' : 'false'; }
  return $v =~ /^-?\d+(\.\d+)?$/ ? $v : '"' . $v . '"'; }
my @a; for (my $i = 0; $i < @areas; $i += 2) { push @a, "    \"$areas[$i]\": " . js($areas[$i + 1]); }
my @e; for my $r (@enemies) { my ($id, $name, $img, $hp, $atk, $def, $spd, $mat, $el, $exp, $gold, $drop, $act, $extra) = @$r;
  my %h = (name => $name, image => $img, hp => $hp, atk => $atk, def => $def, spd => $spd, mat => $mat, element => $el, exp => $exp, gold => $gold, actions => $act, %{ $extra // {} });
  $h{drop} = $drop if $drop; push @e, "    \"$id\": " . js(\%h); }
my @s; for my $r (@skills) { my ($id, $name, $kind, $el, $pow, $tgt, $text, $extra) = @$r;
  my %h = (name => $name, kind => $kind, target => $tgt, text => $text, %{ $extra // {} }); $h{element} = $el if defined $el; $h{power} = $pow if defined $pow;
  push @s, "    \"$id\": " . js(\%h); }
open my $o, '>:encoding(UTF-8)', 'data/enemies.json' or die;
print $o "{\n  \"_note\": \"Generated by tools/gen_enemies.pl. Numbers are provisional until stage 8. home: where the party wakes up after falling (the first one whose town has been visited).\",\n";
print $o "  \"areas\": {\n" . join(",\n", @a) . "\n  },\n  \"enemies\": {\n" . join(",\n", @e) . "\n  },\n  \"skills\": {\n" . join(",\n", @s) . "\n  }\n}\n";
close $o; printf "wrote data/enemies.json (%d enemies, %d techniques)\n", scalar @enemies, scalar @skills;
