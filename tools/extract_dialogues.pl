# Pulls the story lines for stages 5-7 out of the plan document (chapter 11) into data/dialogues/story2.json,
# word for word. Run from the project root:  perl tools/extract_dialogues.pl "ヤバい世界の救い方_企画書.md"
# - a speech that spans several lines (王様「... until 」) becomes one entry with \n between the lines (page breaks)
# - 【レオ・剣士版】 etc. split a block into variants: leo_sword / leo_mage / lina_sword / lina_mage, or leo / lina
# - lines starting with ※ are notes and are skipped; (narration) lines are kept as text
use strict; use warnings; use utf8;
binmode STDOUT, ':utf8';
my $src = shift or die "usage: perl tools/extract_dialogues.pl <plan.md>\n";
open my $fh, '<:encoding(UTF-8)', $src or die "$src: $!"; my @lines = <$fh>; close $fh; chomp @lines;

# heading -> list of lines (only inside ``` blocks), plus the raw text after the heading
my (%blocks, %raw, $head, $inblock);
for my $l (@lines) {
  if ($l =~ /^###\s+(.*)$/) { $head = $1; $inblock = 0; next; }
  next unless defined $head;
  push @{ $raw{$head} }, $l;
  if ($l =~ /^```/) { $inblock = !$inblock; push @{ $blocks{$head} }, '---' unless $inblock; next; }
  push @{ $blocks{$head} }, $l if $inblock;
}
sub heading { my ($re) = @_; my @h = grep { /$re/ } keys %blocks; die "no heading /$re/\n" unless @h == 1; return $blocks{ $h[0] }; }

my %VKEY = ('レオ・剣士版' => 'leo_sword', 'レオ・魔法使い版' => 'leo_mage', 'リナ・剣士版' => 'lina_sword', 'リナ・魔法使い版' => 'lina_mage', 'レオ版' => 'leo', 'リナ版' => 'lina');
# turn raw lines into entries (joining multi-line speeches)
sub entries { my @in = @_; my @out; my $cur;
  for my $l (@in) {
    next if $l eq '' || $l eq '---' || $l =~ /^※/;
    $l =~ s/\s+$//;
    if (defined $cur) { $cur .= "\n" . $l; if ($l =~ /」$/) { push @out, $cur; undef $cur; } next; }
    if ($l =~ /^[^「」]+「/ && $l !~ /」/) { $cur = $l; next; }
    push @out, $l;
  }
  push @out, $cur if defined $cur;
  return \@out; }
# split a block by 【variant】 headers
sub variants { my ($lines) = @_; my (%v, $k);
  for my $l (@$lines) { if ($l =~ /^【([^】]+)】/) { $k = $VKEY{$1} // die "unknown variant $1\n"; next; } push @{ $v{$k} }, $l if defined $k; }
  return { map { $_ => entries(@{ $v{$_} }) } keys %v }; }

my %out;
$out{partner_join} = variants(heading(qr/^レオ／リナ加入/));
$out{inn_water} = entries(@{ heading(qr/^宿屋イベント① /) });
$out{inn_wind} = variants(heading(qr/^宿屋イベント② /));
$out{fire_arrive} = entries(@{ heading(qr/^炎の村に着いた時/) });
$out{inn_fire} = variants(heading(qr/^宿屋イベント③ /));
$out{inn_thunder} = variants(heading(qr/^宿屋イベント④ /));
$out{farewell} = variants(heading(qr/^雷の四天王を倒した後/));
$out{before_demon} = variants(heading(qr/^魔王城に入る前/));
$out{ending_king} = entries(@{ heading(qr/^エンディング（王様）/) });

# boss lines: one paragraph per boss
my %BOSS = ('水の四天王' => 'water', '風の四天王' => 'wind', '炎の四天王' => 'fire', '雷の四天王' => 'thunder', '魔王' => 'demon');
for my $l (@{ heading(qr/^ボス戦前/) }) {
  next if $l eq '' || $l eq '---';
  if ($l =~ /^魔王\(第二形態への変身\)「(.*)$/) { $out{demon_transform} = ["魔王「$1"]; next; }
  if ($l =~ /^(.+?)「/ && $BOSS{$1}) { push @{ $out{"boss_pre_$BOSS{$1}"} }, $l; next; }
  if ($l =~ /^レオ「(.*?)」\s*（リナ版：リナ「(.*?)」）/) { $out{boss_pre_thunder_partner} = { leo => ["レオ「$1」"], lina => ["リナ「$2」"] }; next; }
  die "boss line? $l\n";
}
for my $l (@{ heading(qr/^ボスを倒した時/) }) {
  next if $l eq '' || $l eq '---';
  if ($l =~ /^(.+?)「/ && $BOSS{$1}) { push @{ $out{"boss_down_$BOSS{$1}"} }, $l; next; }
  push @{ $out{boss_down_demon} }, $l;     # the narration after the demon's last words
}
# after the four kings: three sub-blocks (water: one, wind/fire: leo/lina)
{ my @b = @{ heading(qr/^四天王を倒した後の会話/) }; my @parts; my @cur;
  for my $l (@b) { if ($l eq '---') { push @parts, [@cur]; @cur = (); next; } push @cur, $l; }
  $out{after_water} = entries(@{ $parts[0] });
  $out{after_wind} = variants($parts[1]);
  $out{after_fire} = variants($parts[2]); }

# the epilogue after the king: oji/oba lines, then the lines on a black screen
{ my $b = heading(qr/^エンディング（王様のあと）/); my @parts; my @cur;
  for my $l (@$b) { if ($l eq '---') { push @parts, [@cur]; @cur = (); next; } push @cur, $l; }
  $out{ending_family} = entries(@{ $parts[0] });
  my $epi = entries(@{ $parts[1] });
  my ($h) = grep { /^エンディング（王様のあと）/ } keys %raw;
  my %pl; for my $l (@{ $raw{$h} }) { if ($l =~ /^- (レオ・剣士版|レオ・魔法使い版|リナ・剣士版|リナ・魔法使い版)：「(.*)」$/) { $pl{ $VKEY{$1} } = $2; } }
  die "partner lines\n" unless keys %pl == 4;
  $out{epilogue} = [ $epi->[0], { map { $_ => [ $pl{$_} ] } keys %pl }, $epi->[2] ]; }

# villagers of the four villages
{ my $b = heading(qr/^町と村の人/); my $v;
  my %VIL = ('水の村' => 'water', '風の村' => 'wind', '炎の村' => 'fire', '雷の村' => 'thunder');
  my %ROLE = ('ヒント' => 'hint', 'コツ' => 'tip', '怖い噂1' => 'fear1', '怖い噂2' => 'fear2', '科学の村人' => 'science');
  for my $l (@$b) {
    if ($l =~ /^【(.+)】$/) { $v = $VIL{$1}; next; }
    next unless $v && $l =~ /^(ヒント|コツ|怖い噂1|怖い噂2|科学の村人)(「.*」)$/;
    $out{"vil_${v}_$ROLE{$1}"} = [ $2 ];
  } }
# villagers after the area's king is beaten (table)
{ my ($h) = grep { /^四天王を倒したあとの村人/ } keys %raw; my %VIL = ('水の村' => 'water', '風の村' => 'wind', '炎の村' => 'fire', '雷の村' => 'thunder');
  for my $l (@{ $raw{$h} }) { next unless $l =~ /^\| (水の村|風の村|炎の村|雷の村) \| 怖い噂(\d) \| (「.*」) \|$/; $out{"vil_$VIL{$1}_fear$2_after"} = [ $3 ]; } }
# things blocking the way (table)
{ my ($h) = grep { /^道をふさぐもの/ } keys %raw; my %K = ('湖に沈んだ道' => 'water', '突風と看板' => 'wind', '炎の銅像' => 'fire', '雷の結界' => 'thunder');
  for my $l (@{ $raw{$h} }) {
    next unless $l =~ /^\| (湖に沈んだ道|突風と看板|炎の銅像|雷の結界) \| (.*) \| (「.*」) \|$/;
    my ($k, $look, $open) = ($K{$1}, $2, $3); $open =~ s/^「(.*)」$/$1/; $out{"open_$k"} = [ $open ];
    if ($k eq 'wind') { my ($sign) = $look =~ /看板：「(.*?)」<br>/; my ($gust) = $look =~ /突風：「(.*?)」$/; $out{block_wind_sign} = [ $sign ]; $out{block_wind_gust} = [ $gust ]; }
    else { $look =~ s/^「(.*)」$/$1/; $out{"block_$k"} = [ $look ]; } } }
# inn keeper lines
{ my $b = heading(qr/^宿屋$/); my @e = grep { /^宿の人「/ } @$b;
  $out{inn_hello} = [ $e[0] ]; $out{inn_morning} = [ $e[1] ]; $out{inn_no} = [ $e[2] ]; $out{inn_no_money} = [ $e[3] ]; }

# write JSON (keys sorted; strings escaped)
sub js { my ($v, $ind) = @_; $ind //= '  ';
  if (ref $v eq 'ARRAY') { return '[' . join(', ', map { js($_, $ind . '  ') } @$v) . ']'; }
  if (ref $v eq 'HASH') { return "{\n" . join(",\n", map { "$ind  \"$_\": " . js($v->{$_}, $ind . '  ') } sort keys %$v) . "\n$ind}"; }
  my $s = $v; $s =~ s/\\/\\\\/g; $s =~ s/"/\\"/g; $s =~ s/\n/\\n/g; return "\"$s\""; }
open my $o, '>:encoding(UTF-8)', 'data/dialogues/story2.json' or die;
print $o "{\n" . join(",\n", map { "  \"$_\": " . js($out{$_}, '  ') } sort keys %out) . "\n}\n";
close $o;
printf "wrote data/dialogues/story2.json (%d entries)\n", scalar keys %out;
