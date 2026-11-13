// セリフの文字の扱い（画面には依存しない）

// 〇〇 をプレイヤーが付けた名前に変える
export function fillName(text, name) {
  return String(text).replaceAll('〇〇', name);
}

// 「名前「セリフ」」の形を、話す人と本文に分ける
export function parseLine(line) {
  const m = /^([^「」\s]+?)「([\s\S]*)」$/.exec(String(line));
  if (m) return { speaker: m[1], body: `「${m[2]}」` };
  return { speaker: null, body: String(line) };
}

// 行の頭に来てはいけない文字・行の終わりに来てはいけない文字（かんたんな禁則処理）
export const NO_LINE_START = '、。，．・：；？！?!」』）］｝〉》】〕ー…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';
export const NO_LINE_END = '「『（［｛〈《【〔';
const KANA = /[ァ-ヶー]/;

// measure(文字列) で幅を測りながら、maxWidth に収まるように行を分ける
export function wrapText(text, maxWidth, measure) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    const chars = Array.from(paragraph);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const candidate = line + ch;
      if (line && measure(candidate) > maxWidth && !NO_LINE_START.includes(ch)) {
        // 行の終わりに来てはいけない文字は、次の行へ送る
        let carry = '';
        while (line.length > 1 && NO_LINE_END.includes(line.at(-1))) {
          carry = line.at(-1) + carry;
          line = line.slice(0, -1);
        }
        // カタカナの言葉（8文字まで）は、行の途中で分けずに次の行へ送る（例：「レ｜オ」にしない）
        if (!carry && KANA.test(ch) && KANA.test(line.at(-1))) {
          let k = line.length;
          while (k > 0 && KANA.test(line[k - 1])) k--;
          if (k > 0 && line.length - k <= 8) {
            carry = line.slice(k);
            line = line.slice(0, k);
          }
        }
        lines.push(line);
        line = carry + ch;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}
