// 頭で考える敵（裏ボス「影の勇者」と、町に入りこむスライム）の作戦。画面には依存しない
// ・行動とねらう相手の組み合わせごとに「特徴」（どれだけ削れるか、回復役か、自分のHPは少ないか など）を数にして、
//   作戦の表（重み。data/brains/shadow.json）とかけ合わせた点がいちばん高いものを選ぶ
// ・重みは、ボットと何万回も戦わせて学習したもの（tools/bot.html の「影の勇者を鍛える」）
// ・プレイヤーの戦い方の癖（state.stats.habits。本編の戦闘で記録）も特徴に入れて、こちらの手を読む
import { alive, elementRate, stat } from './battle.js';
import { totalStats } from './party.js';

export const FEATURES = [
  'damage', // 相手の今のHPに対して、どれだけ削れるか（0〜1）
  'kill', // 倒しきれるか
  'healer', // 回復役（回復の技を持つ人）をねらうか
  'lowTarget', // HPの少ない相手をねらうか
  'spread', // 全体攻撃で、全員を合わせてどれだけ削れるか
  'selfLow', // 自分のHPが少ない時の回復
  'healWaste', // 自分のHPが多い時の回復（むだ）
  'buffNew', // まだ強くなっていない時の「影の力」
  'buffAgain', // もう強くなっている時の「影の力」（むだ）
  'debuffNew', // まだ弱っていない相手への「のろい」
  'statusNew', // まだ状態異常でない相手への状態異常
  'statusHealer', // 回復役を眠らせる・混乱させる
  'repeat', // 前と同じ行動
  'bigIntoGuard', // 大技を、よく身を守るプレイヤーにぶつける（癖）
  'beforeHeal', // 倒しきれず、プレイヤーがいつも回復するHPまで減らすだけ（癖）
  'vsItems', // 道具をよく使うプレイヤーに、状態異常（癖）
  'guardLow', // 自分のHPが少ない時に、身を守る（町のスライム）。あとから足した特徴なので、影の勇者の表では 0 のまま
];

// プレイヤーの癖のまとめ（記録がなければ、ふつうの人の値）
export function habitSummary(h) {
  const r = (a, b, d) => (b > 0 ? a / b : d);
  const c = h?.cmds ?? {};
  const acts = (c.attack ?? 0) + (c.physical ?? 0) + (c.magic ?? 0) + (c.heal ?? 0) + (c.support ?? 0) + (c.status ?? 0) + (c.item ?? 0) + (c.guard ?? 0);
  return {
    guardRate: r(h?.guardVsBig?.[1] ?? 0, h?.guardVsBig?.[0] ?? 0, 0.25),
    healAt: r(h?.healAt?.[0] ?? 0, h?.healAt?.[1] ?? 0, 0.45),
    itemRate: r(c.item ?? 0, acts, 0.08),
  };
}

const isHealer = (u) => u.m.job === 'priest' || u.m.job === 'mage';

// 行動 sid を、相手 t（全体・自分の時は null）に使った時の特徴
function features(b, e, sid, t, habits, last, plannedDamage) {
  const sk = b.enemyData.skills[sid];
  const f = new Array(FEATURES.length).fill(0);
  const set = (k, v) => (f[FEATURES.indexOf(k)] = v);
  const hpRatio = (u) => u.m.hp / totalStats(u.m, b.items).hp;
  const est = (u) => {
    if (!(sk.kind === 'physical' || sk.kind === 'magic')) return 0;
    const a = stat(b, e, sk.kind === 'magic' ? 'mat' : 'atk');
    let d = ((a * 100) / (100 + stat(b, u, 'def'))) * (sk.power ?? 1);
    if (u.guard) d *= 0.5;
    return d;
  };
  const hpLeft = (u) => Math.max(1, u.m.hp - (plannedDamage.get(u) ?? 0));
  if (sk.kind === 'physical' || sk.kind === 'magic') {
    if (sk.target === 'all') {
      const living = b.allies.filter(alive);
      let sum = 0;
      for (const u of living) sum += Math.min(1, est(u) / hpLeft(u));
      set('spread', sum / Math.max(1, living.length));
      set('kill', living.filter((u) => est(u) >= hpLeft(u)).length);
    } else if (t) {
      const d = est(t);
      set('damage', Math.min(1, d / hpLeft(t)));
      set('kill', d >= hpLeft(t) ? 1 : 0);
      set('healer', isHealer(t) ? 1 : 0);
      set('lowTarget', 1 - hpRatio(t));
      const after = (hpLeft(t) - d) / totalStats(t.m, b.items).hp;
      set('beforeHeal', d < hpLeft(t) && after < habits.healAt ? 1 : 0);
    }
    if ((sk.power ?? 1) >= 1.6 || sk.target === 'all') set('bigIntoGuard', habits.guardRate);
  } else if (sk.kind === 'heal') {
    const r = e.hp / e.maxHp;
    set('selfLow', 1 - r);
    set('healWaste', r);
  } else if (sk.kind === 'guard') {
    set('guardLow', 1 - e.hp / e.maxHp);
  } else if (sk.kind === 'buff') {
    if (e.buffs[sk.buff]) set('buffAgain', 1);
    else set('buffNew', 1);
  } else if (sk.kind === 'debuff' && t) {
    set('debuffNew', t.buffs[sk.debuff] ? 0 : 1);
    set('healer', isHealer(t) ? 1 : 0);
  } else if (sk.kind === 'status' && t) {
    const has = t.m.ailments.length > 0;
    set('statusNew', has ? 0 : 1);
    set('statusHealer', !has && isHealer(t) ? 1 : 0);
    set('vsItems', has ? 0 : habits.itemRate);
  }
  if (sid === last) set('repeat', 1);
  return f;
}

// 1回の行動の候補（行動 × ねらう相手）
// 決まり：「攻撃」以外の技は、同じターンに2回使えず、前のターンに使った技も使えない（いろいろな技を順に使う。同じことのくり返しで、むりやり勝たないように）
function candidates(b, e, plan) {
  const out = [];
  const prevTurn = e.history.slice(-(e.d.acts ?? 1));
  for (const sid of e.d.actions) {
    const sk = b.enemyData.skills[sid];
    if (sid !== 'attack' && (plan.some((p) => p.sid === sid) || prevTurn.includes(sid))) continue;
    // 1回の戦闘で使える回数が決まっている技（町のスライムの回復・守り。回復と守りをくり返して、いつまでも終わらないことがないように）
    if (sk.uses && e.history.filter((h) => h === sid).length >= sk.uses) continue;
    if (sk.target === 'one') for (const t of b.allies.filter(alive)) out.push({ sid, t });
    else out.push({ sid, t: null });
  }
  return out;
}

// brain：{ weights: [特徴の重み], bias: { 行動: 足す点 }, temp: 迷いの大きさ }
export function think(b, e, allies, brain) {
  if (!brain) return null;
  const habits = habitSummary(b.state?.stats?.habits);
  const plan = [];
  const planned = new Map();
  let last = e.history[e.history.length - 1];
  const n = e.d.acts ?? 1;
  for (let k = 0; k < n; k++) {
    let best = null;
    for (const c of candidates(b, e, plan)) {
      const f = features(b, e, c.sid, c.t, habits, last, planned);
      let s = brain.bias?.[c.sid] ?? 0;
      // いろいろな技を見せる：しばらく使っていない技に、決まった点を足す（学習の外の決まり）
      if (!e.history.slice(-8).includes(c.sid) && !plan.some((p) => p.sid === c.sid)) s += brain.variety ?? 0;
      for (let i = 0; i < f.length; i++) s += f[i] * (brain.weights[i] ?? 0);
      s += (b.rng() - 0.5) * (brain.temp ?? 0.1); // 少しだけ迷う（毎回まったく同じにならないように）
      if (!best || s > best.s) best = { ...c, s };
    }
    if (!best) break;
    plan.push({ sid: best.sid, target: best.t ? best.t.index : undefined });
    // 2回目の行動は、1回目で減るHPを考えて選ぶ
    const sk = b.enemyData.skills[best.sid];
    if (best.t && (sk.kind === 'physical' || sk.kind === 'magic')) {
      const a = stat(b, e, sk.kind === 'magic' ? 'mat' : 'atk');
      planned.set(best.t, (planned.get(best.t) ?? 0) + ((a * 100) / (100 + stat(b, best.t, 'def'))) * (sk.power ?? 1));
    }
    last = best.sid;
  }
  return plan;
}

// ---- プレイヤーの癖を記録する（本編のすべての戦闘で。ボットの戦闘でも記録される） ----
export function recordHabits(b, commands) {
  const st = b.state;
  if (!st) return;
  st.stats ??= {};
  const h = (st.stats.habits ??= { cmds: {}, guardVsBig: [0, 0], healAt: [0, 0] });
  const big = b.intents.some((l) => l?.some((it) => it.special || it.charge || (it.sk?.power ?? 0) >= 1.5 || it.targets === 'all'));
  b.allies.forEach((u, i) => {
    const c = commands[i];
    if (!alive(u) || !c || c.type === 'none') return;
    let key = c.type;
    if (c.type === 'skill') {
      const sk = b.skills[c.skill];
      key = sk?.kind === 'heal' ? 'heal' : sk?.kind === 'support' ? 'support' : sk?.kind ?? 'skill';
    }
    h.cmds[key] = (h.cmds[key] ?? 0) + 1;
    if (big) {
      h.guardVsBig[0]++;
      if (c.type === 'guard') h.guardVsBig[1]++;
    }
    const healing = (c.type === 'skill' && b.skills[c.skill]?.kind === 'heal' && b.skills[c.skill]?.heal) || (c.type === 'item' && b.items[c.item]?.use?.hp);
    if (healing) {
      const t = b.allies[c.target];
      if (t && alive(t)) {
        h.healAt[0] += t.m.hp / totalStats(t.m, b.items).hp;
        h.healAt[1]++;
      }
    }
  });
  // 数が大きくなりすぎないように、古い記録を少しずつ薄める
  if (h.guardVsBig[0] > 400) {
    h.guardVsBig = h.guardVsBig.map((x) => x / 2);
    h.healAt = h.healAt.map((x) => x / 2);
    for (const k of Object.keys(h.cmds)) h.cmds[k] /= 2;
  }
}
