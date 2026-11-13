// 隠し名前：名前入力で特定の名前を入れると、特別なモードになる。画面には依存しない
// ソースを読んだだけでは名前がわからないように、名前そのものではなく、名前から作った番号（FNV-1a）でくらべる
//   dev：開発者モード（このあと本当の名前を入れなおす）
//   rich：お金持ちスタート（最初から300ゴールド多い）
//   retro：レトロ画面（緑の4色。設定で戻せる）
//   gourmet：回復の道具が食べ物の名前になる（効き目・値段は同じ）
const CODES = { 2928658271: 'dev', 2143121996: 'rich', 3211073116: 'retro', 436196362: 'gourmet' };

export const MODE_LABELS = { dev: '開発者モード', rich: 'かねもち', retro: 'レトロ画面', gourmet: 'はらぺこ' };

export function hashName(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// 名前が隠し名前なら、そのモードの名前（dev など）を返す。ちがえば null
export function secretOf(name) {
  return CODES[hashName(String(name ?? ''))] ?? null;
}

// はらぺこモードの、道具の名前（id → 名前）
// （下書き。ユーザーの確認待ち）
export const GOURMET_NAMES = {
  potion_s: '焼きたてパン',
  potion_m: 'ほかほかシチュー',
  potion_l: '特上ステーキ',
  mana_potion: 'ひんやりプリン',
  cure_potion: 'しょうが湯',
  revive_potion: '伝説のパフェ',
  warp_potion: 'おうちのおにぎり',
};

// 今の冒険のモードに合わせて、道具の名前を入れかえる（ほかの冒険を読みこんだ時は元にもどす）
export function applyItemNames(items, state) {
  for (const [id, name] of Object.entries(GOURMET_NAMES)) {
    const it = items[id];
    if (!it) continue;
    it.baseName ??= it.name;
    it.name = state?.modes?.gourmet ? name : it.baseName;
  }
}
