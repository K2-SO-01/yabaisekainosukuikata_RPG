# Writes data/items.json from the tables in the plan (chapter 8). Numbers are provisional until stage 8 (balance).
# Run from the project root:  perl tools/gen_items.pl
use strict; use warnings; use utf8;
my @out;
sub add { my ($id, %h) = @_; push @out, [$id, \%h]; }
sub item { my ($id, $name, $price, $desc, $use, $target, %more) = @_; add($id, name => $name, kind => 'item', price => $price, desc => $desc, use => $use, target => $target, %more); }

item('potion_s', '回復ポーション小', 10, 'HPを30回復', { hp => 30 }, 'ally');
item('potion_m', '回復ポーション中', 50, 'HPを80回復', { hp => 80 }, 'ally');
item('potion_l', '回復ポーション大', 200, 'HPを200回復', { hp => 200 }, 'ally');
item('mana_potion', 'マナポーション', 60, 'MPを30回復', { mp => 30 }, 'ally');
item('cure_potion', 'キュアポーション', 20, '状態異常を全部治す（1人）', { cure => \1 }, 'ally');
item('revive_potion', 'リバイブポーション', 300, '戦闘不能から復活（最大HPの半分）', { revive => 0.5 }, 'ally_down');
item('warp_potion', 'ワープポーション', 20, '行ったことのある町や村に一瞬で戻れる。ダンジョンの中と戦闘中では使えない', { warp => \1 }, 'none', battle => \0);

# weapons: [id, name, desc] x (sword, staff) per village, price, element of the middle one
my @W = (
  [120, 'none', ['wood_sword', 'ウッドソード', '騎士見習いの練習用の剣'], ['wood_staff', 'ウッドスタッフ', '魔法使い見習いの杖'], 2, 2],
  [200, 'none', ['bronze_sword', 'ブロンズソード', '青銅でできた剣'], ['bronze_rod', 'ブロンズロッド', '青銅でできた杖'], 5, 4],
  [300, 'none', ['iron_sword', 'アイアンソード', '兵士が愛用する鉄の剣'], ['iron_rod', 'アイアンロッド', '旅人が愛用する鉄の杖'], 8, 6],
  [250, 'none', ['steel_sword', 'スチールソード', 'よく鍛えられた鋼の剣'], ['magic_staff', 'マジックスタッフ', '魔力を高める杖'], 10, 8],
  [400, 'thunder', ['thunder_blade', 'サンダーブレード', '雷の力を秘めた剣'], ['thunder_rod', 'サンダーロッド', '雷の力を秘めた杖'], 13, 11],
  [600, 'none', ['silver_sword', 'シルバーソード', '魔を退ける銀の剣'], ['silver_rod', 'シルバーロッド', '魔を退ける銀の杖'], 16, 14],
  [500, 'none', ['knight_sword', 'ナイトソード', '王国騎士に与えられる剣'], ['sage_staff', 'セージスタッフ', '賢者が使ったという杖'], 19, 17],
  [800, 'fire', ['flame_sword', 'フレイムソード', '炎をまとった剣'], ['flame_rod', 'フレイムロッド', '炎をまとった杖'], 23, 21],
  [1200, 'none', ['mithril_sword', 'ミスリルソード', '幻の金属で作られた剣'], ['mithril_rod', 'ミスリルロッド', '幻の金属で作られた杖'], 27, 25],
  [1000, 'none', ['platinum_sword', 'プラチナソード', '白金に輝く剣'], ['holy_staff', 'ホーリースタッフ', '聖なる祈りが込められた杖'], 30, 29],
  [1600, 'water', ['aqua_blade', 'アクアブレード', '水の力を宿した剣'], ['aqua_rod', 'アクアロッド', '水の力を宿した杖'], 35, 34],
  [2400, 'none', ['rune_blade', 'ルーンブレード', '古代文字が刻まれた剣'], ['rune_staff', 'ルーンスタッフ', '古代文字が刻まれた杖'], 40, 39],
  [1500, 'none', ['dragon_killer', 'ドラゴンキラー', '竜を討ったと伝わる剣'], ['dragon_staff', 'ドラゴンスタッフ', '竜の骨から作られた杖'], 44, 44],
  [2400, 'wind', ['wind_blade', 'ウィンドブレード', '風のように軽い剣'], ['wind_rod', 'ウィンドロッド', '風のように軽い杖'], 52, 51],
  [3600, 'none', ['orichalcum_sword', 'オリハルコンソード', '伝説の金属で作られた剣'], ['orichalcum_rod', 'オリハルコンロッド', '伝説の金属で作られた杖'], 60, 58],
);
for my $w (@W) { my ($price, $el, $s, $r, $atk, $mat) = @$w;
  add($s->[0], name => $s->[1], kind => 'weapon', price => $price, desc => $s->[2], equip => ['swordsman'], atk => $atk, ($el ne 'none' ? (element => $el) : ()));
  add($r->[0], name => $r->[1], kind => 'weapon', price => $price, desc => $r->[2], equip => ['mage', 'priest'], atk => int($atk / 2 + 0.5), mat => $mat, ($el ne 'none' ? (element => $el) : ())); }

# armour per village: [prices armour/shield/helm], sword armour, priest robe, mage robe, shield, helm (id, name, desc), sword-armour defence, robe magic
my @A = (
  [[160, 150, 100], ['leather_armor', 'レザーアーマー', 'なめし革の鎧'], ['travel_clothes', '旅人の服', '旅人が着る丈夫な服'], ['cotton_robe', 'コットンローブ', '見習い魔法使いのローブ'], ['wood_shield', 'ウッドシールド', '木の盾'], ['leather_cap', 'レザーキャップ', '革の帽子'], 6, 2],
  [[320, 300, 200], ['chain_mail', 'チェインメイル', '鎖を編んだ鎧'], ['bronze_robe', '青銅の法衣', '僧侶が着る法衣'], ['silk_robe', 'シルクローブ', '絹で織ったローブ'], ['bronze_shield', 'ブロンズシールド', '青銅の盾'], ['bronze_helm', 'ブロンズヘルム', '青銅の兜'], 11, 4],
  [[640, 600, 400], ['iron_armor', 'アイアンアーマー', '鉄の鎧'], ['wind_robe', '風の法衣', '風のように軽い法衣'], ['magic_robe', 'マジックローブ', '魔力を高めるローブ'], ['iron_shield', 'アイアンシールド', '鉄の盾'], ['iron_helm', 'アイアンヘルム', '鉄の兜'], 17, 6],
  [[1300, 1200, 800], ['knight_armor', 'ナイトアーマー', '王国騎士の鎧'], ['holy_robe', '聖なる法衣', '聖なる祈りの法衣'], ['flame_robe', 'フレイムローブ', '炎を防ぐローブ'], ['knight_shield', 'ナイトシールド', '王国騎士の盾'], ['knight_helm', 'ナイトヘルム', '王国騎士の兜'], 24, 8],
  [[1900, 1800, 1200], ['mithril_armor', 'ミスリルアーマー', '幻の金属の鎧'], ['light_robe', '光の法衣', '光をまとう法衣'], ['sage_robe', '賢者のローブ', '賢者が着たというローブ'], ['mithril_shield', 'ミスリルシールド', '幻の金属の盾'], ['mithril_helm', 'ミスリルヘルム', '幻の金属の兜'], 32, 11],
);
for my $a (@A) { my ($p, $sa, $pr, $mr, $sh, $hm, $def, $mat) = @$a;
  add($sa->[0], name => $sa->[1], kind => 'armor', price => $p->[0], desc => $sa->[2], equip => ['swordsman'], def => $def);
  add($pr->[0], name => $pr->[1], kind => 'armor', price => $p->[0], desc => $pr->[2], equip => ['priest'], def => int($def * 0.8 + 0.5), mat => int($mat / 2 + 0.5));
  add($mr->[0], name => $mr->[1], kind => 'armor', price => $p->[0], desc => $mr->[2], equip => ['mage'], def => int($def * 0.6 + 0.5), mat => $mat);
  add($sh->[0], name => $sh->[1], kind => 'shield', price => $p->[1], desc => $sh->[2], equip => ['swordsman', 'priest'], def => int($def / 2 + 0.5));
  add($hm->[0], name => $hm->[1], kind => 'helm', price => $p->[2], desc => $hm->[2], equip => ['swordsman', 'mage', 'priest'], def => int($def / 4 + 0.5)); }

# accessories sold in shops
my $ALL = ['swordsman', 'mage', 'priest'];
add('power_ring', name => 'ちからのゆびわ', kind => 'accessory', price => 300, desc => 'はめると力がわいてくる指輪', equip => $ALL, atk => 5);
add('guard_pendant', name => 'まもりのペンダント', kind => 'accessory', price => 600, desc => '身を守る力が宿ったペンダント', equip => $ALL, def => 8);
add('swift_anklet', name => 'はやてのアンクレット', kind => 'accessory', price => 1000, desc => '足が軽くなる足輪', equip => $ALL, spd => 10);
add('magic_earring', name => 'まりょくのイヤリング', kind => 'accessory', price => 1800, desc => '魔力を高めてくれる耳飾り', equip => $ALL, mat => 12);
add('life_charm', name => 'いのちのおまもり', kind => 'accessory', price => 2500, desc => '命の力を分けてくれるお守り', equip => $ALL, hp => 40);
# status-ward accessories (from chests; can't be sold)
add('wake_pendant', name => 'めざめのペンダント', kind => 'accessory', desc => '眠りと毒から、身を守ってくれるペンダント', equip => $ALL, resist => ['sleep', 'poison'], nosell => \1, rare => \1);
add('calm_charm', name => 'しずめのお守り', kind => 'accessory', desc => '心を落ち着かせて、混乱を防ぐお守り', equip => $ALL, resist => ['confusion'], nosell => \1, rare => \1);
add('frost_ring', name => 'ひょうけつのリング', kind => 'accessory', desc => 'ひんやり冷たく、やけどを防ぐ指輪', equip => $ALL, resist => ['burn'], nosell => \1, rare => \1);
add('bolt_bangle', name => 'いなずまよけの腕輪', kind => 'accessory', desc => '雷の力をそらして、麻痺を防ぐ腕輪', equip => $ALL, resist => ['paralysis'], nosell => \1, rare => \1);
# strong equipment from chests (no element, can't be sold)
add('bluelake_sword', name => 'ブルーレイクソード', kind => 'weapon', desc => '湖の底で眠っていた、青く澄んだ剣', equip => ['swordsman'], atk => 23, nosell => \1, rare => \1);
add('bluelake_rod', name => 'ブルーレイクロッド', kind => 'weapon', desc => '湖の底で眠っていた、青く澄んだ杖', equip => ['mage', 'priest'], atk => 12, mat => 21, nosell => \1, rare => \1);
add('tempest_rod', name => 'テンペストロッド', kind => 'weapon', desc => '嵐の力を閉じこめた杖', equip => ['mage', 'priest'], atk => 18, mat => 34, nosell => \1, rare => \1);
add('flame_helm', name => 'フレイムヘルム', kind => 'helm', desc => '火山の熱にも負けない、炎の兜', equip => $ALL, def => 11, nosell => \1, rare => \1);
add('lightning_edge', name => 'ライトニングエッジ', kind => 'weapon', desc => '雷さえ切り裂く、いちばん鋭い剣', equip => ['swordsman'], atk => 68, nosell => \1, rare => \1);
add('saint_rod', name => 'セイントロッド', kind => 'weapon', desc => '女神の光が宿るという、聖なる杖', equip => ['mage', 'priest'], atk => 34, mat => 66, nosell => \1, rare => \1);

add('shunsoku', name => 'シュンソク', kind => 'key', desc => '旅立ちの時におばさんからもらった靴。ダッシュができる');

# drop materials (sell only, about the gold an enemy of that area gives)
my @D = ([35, ['slime_goo', 'べちょべちょ', 'スライムのかけら。べちょべちょしている'], ['nitari_cap', 'ニタリのかさ', 'ニタリダケのかさ。まだ少しニタっとしている']],
  [120, ['rainbow_scale', 'にじいろのウロコ', '光にかざすと、虹色に光るウロコ'], ['drop_crystal', 'しずくの結晶', '水の精霊が残した、しずくの形の結晶'], ['mud_ball', 'どろだんご', 'よくこねられた泥のだんご。食べられない']],
  [250, ['wind_crystal', 'かぜの結晶', '中で小さな風がうずをまいている結晶'], ['leaf', '葉っぱ', 'ただの葉っぱ。竜巻に巻きこまれていたらしい'], ['ostrich_feather', 'ダチョウの羽根', 'ふわふわの大きな羽根']],
  [350, ['flame_crystal', 'ほのおの結晶', 'ほんのりあたたかい、赤い結晶'], ['warm_tail', 'あったかいしっぽ', 'ちびサラマンダーのしっぽ。まだあったかい'], ['burnt_stone', '焦げた石', '真っ黒に焦げた石']],
  [350, ['bolt_crystal', 'いかずちの結晶', 'さわるとピリッとする結晶'], ['rusty_helm', 'さびた兜', '王国の紋章が刻まれた、さびた兜'], ['nameless_letter', '名前の消えた手紙', '宛名がかすれて読めない、古い手紙']],
  [350, ['iron_shard', 'くろがねの欠片', '黒くて重たい金属のかけら'], ['demon_horn', 'あくまのツノ', 'ねじれた、黒いツノ'], ['stone_wing', '石のつばさ', '石でできた、重たいつばさ']]);
for my $g (@D) { my ($sell, @list) = @$g; add($_->[0], name => $_->[1], kind => 'material', sell => $sell, desc => $_->[2]) for @list; }

sub js { my ($v) = @_;
  if (ref $v eq 'ARRAY') { return '[' . join(', ', map { js($_) } @$v) . ']'; }
  if (ref $v eq 'HASH') { return '{ ' . join(', ', map { "\"$_\": " . js($v->{$_}) } sort keys %$v) . ' }'; }
  if (ref $v eq 'SCALAR') { return $$v ? 'true' : 'false'; }
  return $v =~ /^-?\d+(\.\d+)?$/ ? $v : '"' . $v . '"'; }
open my $o, '>:encoding(UTF-8)', 'data/items.json' or die;
print $o "{\n  \"_note\": \"Generated by tools/gen_items.pl from the plan (chapter 8). Equipment numbers are provisional until stage 8.\",\n";
print $o join(",\n", map { "  \"$_->[0]\": " . js($_->[1]) } @out), "\n}\n";
close $o; printf "wrote data/items.json (%d items)\n", scalar @out;
