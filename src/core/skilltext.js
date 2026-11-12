// 技・魔法の短い説明（戦闘の一覧などで、選んでいる技の下に出す）。画面には依存しない
// 攻撃の技は、ダメージの大きさを「大・中・小」の3段階で書く（技の倍率から決める）
const ELEMENT_NAME = { fire: '炎', water: '水', wind: '風', thunder: '雷', light: '光', dark: '闇' };
const AILMENT_NAME = { poison: '毒', burn: 'やけど', sleep: '眠り', confusion: '混乱', paralysis: 'まひ' };
const BUFF_TEXT = { atkUp: '味方全員の 攻撃力を上げる', defUp: '味方全員の 防御力を上げる', focus: '味方全員の 会心を出やすくする' };

// ダメージの段階：倍率 2 以上が「大」、1.4 以上が「中」、それより下が「小」
export function damageTier(power = 1) {
  return power >= 2 ? '大' : power >= 1.4 ? '中' : '小';
}

export function describeSkill(sk) {
  if (!sk) return '';
  const who = sk.target === 'enemies' ? '敵全員' : sk.target === 'allies' ? '味方全員' : sk.target === 'ally_down' ? '倒れた仲間' : sk.target === 'ally' ? '味方1人' : sk.target === 'self' ? '自分' : '敵1体';
  if (sk.kind === 'physical' || sk.kind === 'magic') {
    const el = ELEMENT_NAME[sk.element] ? `${ELEMENT_NAME[sk.element]}の ` : '';
    const add = sk.inflict ? `（${AILMENT_NAME[sk.inflict] ?? ''}にすることも）` : '';
    return `${who}に ${el}${damageTier(sk.power)}ダメージ${add}`;
  }
  if (sk.kind === 'heal') {
    if (sk.revive) return `${who}を 生き返らせる`;
    if (sk.cure) return `${who}の 状態異常を治す`;
    const k = sk.heal?.[0] ?? 1;
    return `${who}の HPを回復（${k >= 3 ? '大' : k >= 1.5 ? '中' : '小'}）`;
  }
  if (sk.kind === 'status') return `${who}を ${AILMENT_NAME[sk.inflict] ?? '状態異常'}にする`;
  if (sk.kind === 'support') {
    if (sk.effect === 'cover') return 'このターン、仲間をかばう';
    if (sk.buff) return BUFF_TEXT[sk.buff] ?? '';
    if (sk.debuff) return `${who}の 防御力を下げる`;
  }
  return '';
}
