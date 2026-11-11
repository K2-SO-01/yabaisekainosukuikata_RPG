// イベントの台本（data/events/*.json）を、上から順に実行する。画面には依存しない
// 画面でやること（セリフを出す、待つ、場所を移るなど）は、渡された ui に頼む
//
// 台本は命令のならび。1つの命令は、次のどれか：
//   { "say": "セリフの名前" }           セリフ（data/dialogues）を出す。["…", "…"] と直接書いてもよい
//   { "notice": "文" }                  お知らせの文を出す
//   { "gold": 500 }                     お金を増やす（マイナスなら減らす）
//   { "flag": "名前" }                  目印（フラグ）を立てる。"value": false で下ろす
//   { "se": "名前" } / { "bgm": "名前" } / { "bgmStop": ミリ秒 }
//   { "wait": ミリ秒 }
//   { "if": "フラグ", "then": [...], "else": [...] }   "!フラグ" と書くと「立っていない時」
//   { "transfer": { "map": "…", "x": 0, "y": 0, "dir": "down" } }   別のマップへ移る
//   { "run": "台本の名前" }             別の台本を呼ぶ
import { addGold } from './state.js';

export function checkCond(state, cond) {
  if (Array.isArray(cond)) return cond.every((c) => checkCond(state, c));
  const name = String(cond);
  if (name.startsWith('!')) return !state.flags[name.slice(1)];
  return !!state.flags[name];
}

// マップに置いた物（人・出口・自動イベントなど）が、今あるかどうか
// 物の設定 if（このフラグが立っている時だけある）／ unless（立っている時はない）で決まる
export function isActive(state, obj) {
  const p = obj.props ?? {};
  if (p.if && !checkCond(state, p.if)) return false;
  if (p.unless && checkCond(state, p.unless)) return false;
  return true;
}

export async function runScript(commands, ctx) {
  const { state, ui, scripts } = ctx;
  for (const cmd of commands ?? []) {
    if ('say' in cmd) await ui.say(cmd.say);
    else if ('notice' in cmd) await ui.notice(cmd.notice);
    else if ('gold' in cmd) addGold(state, cmd.gold);
    else if ('flag' in cmd) state.flags[cmd.flag] = cmd.value ?? true;
    else if ('se' in cmd) ui.se(cmd.se);
    else if ('bgm' in cmd) ui.bgm(cmd.bgm);
    else if ('bgmStop' in cmd) ui.bgmStop(cmd.bgmStop);
    else if ('wait' in cmd) await ui.wait(cmd.wait);
    else if ('if' in cmd) await runScript(checkCond(state, cmd.if) ? cmd.then : cmd.else, ctx);
    else if ('transfer' in cmd) await ui.transfer(cmd.transfer);
    else if ('run' in cmd) await runScript(scripts?.[cmd.run], ctx);
  }
}
