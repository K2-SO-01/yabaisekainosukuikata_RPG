#!/usr/bin/env perl
# Writes version numbers (made from each file's contents) into index.html, so that a browser never mixes
# old and new files of the game. GitHub Pages lets browsers keep each file for 10 minutes; without this,
# a phone could load the new main.js with an old input.js and the buttons would misbehave.
#   - every JavaScript module under src/ gets "?v=<hash>" through an import map
#   - style.css gets "?v=<hash>"
#   perl tools/stamp.pl          update index.html
#   perl tools/stamp.pl --check  only check; exit 1 if index.html is out of date (the pre-push hook runs this)
use strict; use warnings;
use Digest::MD5 qw(md5_hex);
use File::Find;
my $check = (shift // '') eq '--check';
sub hash_of { my ($f) = @_; open my $h, '<:raw', $f or die "$f: $!"; local $/; return substr(md5_hex(<$h>), 0, 10); }
my @js;
find({ wanted => sub { push @js, $File::Find::name if /\.js$/ }, no_chdir => 1 }, 'src');
@js = sort @js;
my $map = join(",\n", map { my $p = "./$_"; qq(    "$p": "$p?v=) . hash_of($_) . '"' } @js);
my $block = "<!-- build: tools/stamp.pl が書く（ファイルの中身から作った番号。古いファイルと新しいファイルがまざらないように） -->\n"
  . qq(<script type="importmap">\n{\n  "imports": {\n$map\n  }\n}\n</script>\n)
  . qq(<script type="module">import './src/main.js';</script>\n<!-- /build -->);
open my $in, '<:raw', 'index.html' or die; local $/; my $html = <$in>; close $in;
my $new = $html;
$new =~ s{<!-- build:.*?<!-- /build -->}{$block}s or $new =~ s{<script type="module" src="src/main.js"></script>}{$block} or die "index.html: no place for the build block\n";
my $css = hash_of('style.css');
$new =~ s{href="style\.css(\?v=[0-9a-f]+)?"}{href="style.css?v=$css"} or die "index.html: no style.css link\n";
if ($check) {
  if ($new ne $html) { print "index.html is out of date: run  perl tools/stamp.pl  and commit\n"; exit 1; }
  print "index.html versions: up to date\n"; exit 0;
}
if ($new ne $html) { open my $o, '>:raw', 'index.html' or die; print $o $new; close $o; print "index.html: versions updated (" . scalar(@js) . " modules)\n"; }
else { print "index.html: versions already up to date\n"; }
