// 全体チェッカー（開発用）：ゲームのデータ・マップ・絵・文字・仕組み・RPGとしての作りを、まとめて調べる
// 使い方：開発用モード（?dev=1）の「全体チェック」ボタン、またはコンソールで
//   const { runChecks } = await import('./tools/checker.js'); await runChecks()
// 結果は新しい窓に一覧で出す（重大＝遊べなくなる・こわれる／注意＝不自然・遊びにくい／参考＝気づいたこと）
//
// 「RPGとしての作り」の決まりは、ネットの資料（ゲームデザインの失敗例・RPGツクールの作者の知見）から選んだもの：
//   町には宿屋・道具屋・武器屋・セーブがある／ボスの前にセーブと回復がある／難しさは急に上がらない／
//   新しい町の装備は前の町より強い／状態異常の敵が出る前に治す道具が買える／回復が安すぎない など
import { alive, createBattle, planEnemies, resolveTurn, rollEncounter } from '../src/core/battle.js';
import { canWalk, findStart, isInside, isWallTile } from '../src/core/map.js';
import { isActive } from '../src/core/events.js';
import { baseStats, createMember, learnedSkills, MAX_LEVEL, totalStats } from '../src/core/party.js';
import { createNewGame } from '../src/core/state.js';
import { migrate, readSlot, writeSlot } from '../src/core/save.js';
import { applyCheckpoint, CHECKPOINTS } from '../src/core/story.js';
import { describeSkill } from '../src/core/skilltext.js';

// 物語の順番（エリア・町・お店）
const AREAS = ['field_town', 'lake', 'tower', 'volcano', 'storm', 'demon'];
const TOWNS = ['town', 'village_water', 'village_wind', 'village_fire', 'village_thunder'];
const SHOP_ORDER = ['town', 'water', 'wind', 'fire', 'thunder'];
const AILMENT_NAME = { poison: '毒', burn: 'やけど', sleep: '眠り', confusion: '混乱', paralysis: 'まひ' };

export async function runChecks({ open = true, battles = true } = {}) {
  const g = window.game;
  if (!g?.maps) throw new Error('開発用モード（?dev=1）で、ゲームを開いてから動かしてください');
  const issues = [];
  const add = (level, cat, msg, where = '') => issues.push({ level, cat, msg, where });
  const errors = [];
  const onErr = (e) => errors.push(String(e.message ?? e.reason ?? e));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  const saved = g.state;
  const t0 = performance.now();
  try {
    checkData(g, add);
    await checkUnused(g, add);
    await checkMaps(g, add);
    checkText(g, add);
    checkRpg(g, add);
    checkStory(g, add);
    checkSave(g, add);
    await checkScenes(g, add);
    if (battles) checkBattles(g, add);
  } catch (e) {
    add('重大', 'チェッカー', `チェックの途中で止まった：${e.message}`, e.stack?.split('\n')[1] ?? '');
  } finally {
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
    g.state = saved;
  }
  for (const e of errors) add('重大', '仕組み', `チェック中にエラーが出た：${e}`);
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const html = report(issues, seconds);
  if (open) {
    const w = window.open('', 'checker');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  }
  window.checkIssues = issues;
  const count = (l) => issues.filter((i) => i.level === l).length;
  return `全体チェック：重大 ${count('重大')}・注意 ${count('注意')}・参考 ${count('参考')}（${seconds}秒）`;
}

// ---------------------------------------------------------------- データのつながり
function scriptCommands(list, out = []) {
  for (const c of list ?? []) {
    if (!c || typeof c !== 'object') continue;
    out.push(c);
    if (c.then) scriptCommands(c.then, out);
    if (c.else) scriptCommands(c.else, out);
    if (Array.isArray(c.do)) for (const d of c.do) scriptCommands(d, out);
    if (c.battle?.lose) scriptCommands(c.battle.lose, out);
  }
  return out;
}

const used = {};
function checkData(g, add) {
  const dlg = g.dialogues;
  const hasDialogue = (k) => typeof k !== 'string' || k in dlg || /[「」！。…]/.test(k) || k.includes(' ');
  const usedDialogues = new Set();
  const usedScripts = new Set();
  const flagsRead = new Map();
  const flagsWritten = new Set(['cleared', 'shadow_defeated', 'dash']);
  const readFlag = (f, where) => {
    for (const x of [].concat(f ?? [])) {
      const name = String(x).replace(/^!/, '');
      if (!flagsRead.has(name)) flagsRead.set(name, where);
    }
  };
  // イベント
  for (const [name, list] of Object.entries(g.scripts)) {
    for (const c of scriptCommands(list)) {
      const where = `イベント ${name}`;
      for (const k of ['say', 'ask', 'notice']) {
        const v = c[k];
        if (typeof v === 'string') {
          usedDialogues.add(v);
          if (k !== 'notice' && !hasDialogue(v)) add('重大', 'データ', `セリフ「${v}」がない`, where);
        }
      }
      if (c.fanfare && typeof c.fanfare.text === 'string') usedDialogues.add(c.fanfare.text);
      if (c.rest?.pick) for (const p of c.rest.pick) usedDialogues.add(p);
      if (c.rest?.pickIf) for (const p of Object.values(c.rest.pickIf)) usedDialogues.add(p);
      if (c.run) {
        usedScripts.add(c.run);
        if (!g.scripts[c.run]) add('重大', 'データ', `呼び出すイベント「${c.run}」がない`, where);
      }
      for (const t of c.battle?.tips ?? []) {
        usedDialogues.add(t.say);
        if (!hasDialogue(t.say)) add('重大', 'データ', `戦闘の説明「${t.say}」のセリフがない`, where);
      }
      if (c.battle) for (const id of c.battle.enemies ?? []) if (!g.enemies.enemies[id]) add('重大', 'データ', `戦う敵「${id}」がいない`, where);
      if (c.transfer) checkDest(g, add, c.transfer, where);
      if (c.shop && !g.shops[c.shop]) add('重大', 'データ', `お店「${c.shop}」がない`, where);
      if (c.keyItem && !g.items[c.keyItem]) add('重大', 'データ', `大事なもの「${c.keyItem}」がない`, where);
      if (c.flag) flagsWritten.add(c.flag);
      if (c.if) readFlag(c.if, where);
      if (c.inn?.flag) flagsWritten.add(c.inn.flag);
      if (c.stay?.flag) flagsWritten.add(c.stay.flag);
      if (c.inn?.unless) readFlag(c.inn.unless, where);
      if (c.stay?.unless) readFlag(c.stay.unless, where);
      if (c.inn?.event) usedDialogues.add(c.inn.event);
      if (c.stay?.event) usedDialogues.add(c.stay.event);
    }
  }
  // マップに置いた物
  for (const [id, map] of g.maps) {
    for (const o of map.objects) {
      const where = `${mapName(map)}（${id}）の ${o.name || o.type} (${o.x},${o.y})`;
      const p = o.props;
      if (p.script) {
        usedScripts.add(p.script);
        if (!g.scripts[p.script]) add('重大', 'データ', `イベント「${p.script}」がない`, where);
      }
      if (p.dialogue) {
        usedDialogues.add(p.dialogue);
        if (!hasDialogue(p.dialogue)) add('重大', 'データ', `セリフ「${p.dialogue}」がない`, where);
      }
      if (p.msg) {
        usedDialogues.add(p.msg);
        if (!hasDialogue(p.msg)) add('重大', 'データ', `セリフ「${p.msg}」がない`, where);
      }
      if (p.character && !g.characters[p.character]) add('重大', 'データ', `人「${p.character}」が characters.json にいない`, where);
      if (p.enemy && !g.enemies.enemies[p.enemy]) add('重大', 'データ', `敵「${p.enemy}」がいない`, where);
      if (p.item && !g.items[p.item]) add('重大', 'データ', `道具「${p.item}」がない`, where);
      if (o.type === 'exit') checkDest(g, add, p, where);
      if (p.if) readFlag(p.if, where);
      if (p.unless) readFlag(p.unless, where);
    }
  }
  // 立てるのに読まないフラグ・読むのに立てないフラグ
  for (const [f, where] of flagsRead) {
    if (!flagsWritten.has(f) && !f.startsWith('got_')) add('注意', 'データ', `フラグ「${f}」を見ているのに、どこでも立てていない（その物はずっと出ない／消えない）`, where);
  }
  used.dialogues = usedDialogues;
  used.scripts = usedScripts;
  // 敵
  for (const [id, e] of Object.entries(g.enemies.enemies)) {
    for (const s of e.actions ?? []) if (!g.enemies.skills[s]) add('重大', 'データ', `敵「${e.name}」の技「${s}」がない`, id);
    if (e.special && !g.enemies.skills[e.special]) add('重大', 'データ', `ボス「${e.name}」の必殺技「${e.special}」がない`, id);
    if (e.drop && !g.items[e.drop]) add('重大', 'データ', `敵「${e.name}」が落とす「${e.drop}」がない`, id);
    if (!g.assets.image(`enemy:${id}`)) add('重大', '絵', `敵「${e.name}」の絵が読めない：${e.image}`, id);
    if (e.ai && !g.enemies.brains?.[e.ai]) add('重大', 'データ', `敵「${e.name}」の作戦の表「${e.ai}」がない`, id);
  }
  for (const [aid, a] of Object.entries(g.enemies.areas)) for (const id of a.enemies ?? []) if (!g.enemies.enemies[id]) add('重大', 'データ', `エリア「${aid}」の敵「${id}」がいない`);
  // お店
  for (const [sid, s] of Object.entries(g.shops)) for (const it of s.stock ?? []) if (!g.items[it]) add('重大', 'データ', `お店「${sid}」の品物「${it}」がない`);
  // 道具・技
  const noPrice = [];
  for (const [id, it] of Object.entries(g.items)) {
    if (!it.name) add('重大', 'データ', `道具「${id}」に名前がない`);
    if (!it.desc) add('注意', '文字', `道具「${it.name}」に説明がない`);
    if (it.kind !== 'key' && !(it.price > 0)) noPrice.push(it.name);
  }
  if (noPrice.length) add('参考', 'RPG', `値段のない道具 ${noPrice.length}件（お店で売れない）。敵が落とす物を売ってお金にできると、RPGらしい：${noPrice.slice(0, 12).join('、')}${noPrice.length > 12 ? ' …' : ''}`);
  for (const [id, sk] of Object.entries(g.skills)) {
    if (!describeSkill(sk)) add('注意', '文字', `技「${sk.name}」の短い説明が作れない（戦闘の一覧で説明が出ない）`, id);
  }
  // 人の絵・顔
  for (const [id, c] of Object.entries(g.characters)) {
    if (!g.assets.image(`char:${id}`)) add('重大', '絵', `人「${id}」の歩く絵が読めない：${c.sprite}`);
    if (!g.faces.get(id)) add('注意', '絵', `人「${id}」の顔がない`);
  }
}

// どこからも使われていないセリフ・イベント：データとゲームのソース（import map にある全部のファイル）をさがす
async function checkUnused(g, add) {
  const map = JSON.parse(document.querySelector('script[type=importmap]')?.textContent ?? '{"imports":{}}');
  const texts = await Promise.all(Object.values(map.imports).map((u) => fetch(u).then((r) => r.text()).catch(() => '')));
  const src = texts.join('\n');
  // お店のセリフのように「種類_hello」を line('hello') で組み立てて使う物もあるので、うしろの部分でもさがす
  const inSrc = (k) => src.includes(`'${k}'`) || src.includes(`"${k}"`) || src.includes(`\`${k}`) || src.includes(`${k}_`) || src.includes(`('${k.split('_').slice(1).join('_')}'`);
  const unusedD = Object.keys(g.dialogues).filter((k) => !k.startsWith('_') && !used.dialogues.has(k) && !inSrc(k));
  if (unusedD.length) add('参考', 'データ', `どこからも使われていないセリフ ${unusedD.length}件（消し忘れか、出し忘れ）：${unusedD.slice(0, 15).join('、')}${unusedD.length > 15 ? ' …' : ''}`);
  const unusedS = Object.keys(g.scripts).filter((k) => !used.scripts.has(k) && !inSrc(k));
  if (unusedS.length) add('参考', 'データ', `マップからもほかのイベントからも呼ばれていないイベント：${unusedS.join('、')}`);
}

function checkDest(g, add, d, where) {
  const map = g.maps.get(d.map);
  if (!map) return add('重大', 'データ', `行き先のマップ「${d.map}」がない`, where);
  if (d.x === 'start' || d.x === 'end' || d.x == null) return;
  const x = Number(d.x);
  const y = Number(d.y);
  if (!isInside(map, x, y)) return add('重大', 'マップ', `行き先 ${d.map} (${x},${y}) がマップの外`, where);
  // 物語で消える物・場面だけの人（条件つき）は、いないものとする
  if (!canWalk(map, x, y, (o) => !o.props.if && !o.props.unless)) add('重大', 'マップ', `行き先 ${d.map} (${x},${y}) が壁や物の上（着いたら動けないかも）`, where);
}

const mapName = (m) => m.props?.name ?? m.id;

// ---------------------------------------------------------------- マップ（通れるか・ふさいでいないか・絵が切れていないか）
function checkMaps(g, add) {
  for (const [id, map] of g.maps) {
    if (id === 'testroom') continue;
    const W = map.width;
    const H = map.height;
    const name = `${mapName(map)}（${id}）`;
    // 物を置いてはいけない所（壁の中）
    for (const o of map.objects) {
      if (!['npc', 'sign', 'search', 'savepoint', 'trigger', 'exit'].includes(o.type)) continue;
      if (!isInside(map, o.x, o.y)) add('重大', 'マップ', `${o.name || o.type} がマップの外にある`, `${name} (${o.x},${o.y})`);
    }
    // 同じマスに2つ（条件がちがう物は除く）
    const seen = new Map();
    for (const o of map.objects) {
      if (!['npc', 'sign', 'search', 'savepoint'].includes(o.type)) continue;
      const k = `${o.x},${o.y}`;
      const prev = seen.get(k);
      if (prev && !prev.props.if && !prev.props.unless && !o.props.if && !o.props.unless) add('注意', 'マップ', `「${prev.name}」と「${o.name}」が同じマスにいる`, `${name} (${k})`);
      seen.set(k, o);
    }
    // 歩ける所の地図：壁と、いつもある物（看板・宝箱・光の結晶）だけを通れない所にする。
    // 町の人は、いないものとして（ふさぐかどうかは下で1人ずつ調べる）。物語で消える物（石像など）は通れるものとする
    const solid = new Set();
    for (const o of map.objects) if (['sign', 'search', 'savepoint'].includes(o.type) && !o.props.if && !o.props.unless) solid.add(o.y * W + o.x);
    const free = (x, y) => isInside(map, x, y) && !isWallTile(map, x, y) && !solid.has(y * W + x);
    const blockOf = () => false;
    const start = map.objects.find((o) => o.type === 'start') ?? null;
    // 行きたい所：出口・イベントのマス、話す・調べる物のとなり
    const targets = [];
    for (const o of map.objects) {
      if (o.type === 'exit' || o.type === 'trigger') targets.push({ o, cells: [[o.x, o.y]] });
      else if (['npc', 'sign', 'search', 'savepoint'].includes(o.type) && !o.props.counter) targets.push({ o, cells: [[o.x + 1, o.y], [o.x - 1, o.y], [o.x, o.y + 1], [o.x, o.y - 1]] });
      else if (o.props.counter) targets.push({ o, cells: [[o.x, o.y + 2], [o.x, o.y - 2]] });
    }
    const flood = (sx, sy, blocked = null) => {
      const seenT = new Uint8Array(W * H);
      if (!free(sx, sy) || (blocked && blocked.has(sy * W + sx))) return seenT;
      const q = [[sx, sy]];
      seenT[sy * W + sx] = 1;
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!isInside(map, nx, ny) || seenT[ny * W + nx]) continue;
          if (blocked && blocked.has(ny * W + nx)) continue;
          if (!free(nx, ny) || blockOf(nx, ny)) continue;
          seenT[ny * W + nx] = 1;
          q.push([nx, ny]);
        }
      }
      return seenT;
    };
    // 始まりの場所：start の物、なければ出口の近く
    let sx = start?.x;
    let sy = start?.y;
    if (sx == null) {
      const ex = map.objects.find((o) => o.type === 'exit');
      if (ex) [sx, sy] = [ex.x, ex.y];
    }
    if (sx == null) continue;
    const base = flood(sx, sy);
    const reach = (seenT, t) => t.cells.some(([x, y]) => isInside(map, x, y) && seenT[y * W + x]);
    for (const t of targets) {
      if (!reach(base, t) && !t.o.props.if && !t.o.props.unless) add('注意', 'マップ', `「${t.o.name || t.o.type}」まで歩いて行けない`, `${name} (${t.o.x},${t.o.y})`);
    }
    // 道をふさぐ町の人：その人のマス（歩き回る人は動ける範囲）をふさぐと、行けなくなる所がある
    for (const o of map.objects) {
      // 物語の場面だけに出る人（条件つき）は調べない
      if (o.type !== 'npc' || o.props.enemy || o.props.if || o.props.unless) continue;
      const cells = [];
      const r = o.props.wander ? 2 : 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && free(o.x + dx, o.y + dy)) cells.push([o.x + dx, o.y + dy]);
      if (!cells.length) cells.push([o.x, o.y]);
      for (const [cx, cy] of cells) {
        const blocked = new Set([cy * W + cx]);
        const after = flood(sx === cx && sy === cy ? sx + 1 : sx, sy, blocked);
        const lost = targets.filter((t) => t.o !== o && reach(base, t) && !reach(after, t));
        if (lost.length) {
          // 出口・人へ行けなくなるのは「注意」、看板や扉を調べられないだけなら「参考」
          const big = lost.some((t) => ['exit', 'trigger', 'npc'].includes(t.o.type));
          add(big ? '注意' : '参考', 'マップ',`「${o.name}」が${o.props.wander ? '歩き回って' : '立っていて'}道をふさぐ（${cx},${cy} にいると「${lost[0].o.name || lost[0].o.type}」などへ行けない）`, `${name} (${o.x},${o.y})`);
          break;
        }
      }
    }
  }
  // 絵が途中で切れている所（tools/check_tiles.js と同じ）
  return import('./check_tiles.js')
    .then(({ checkTiles }) => {
      // 「壁に接している？」は、壁の上の飾りなど、まちがいのことが多いので出さない。マップの上のはしも出さない
      for (const r of checkTiles()) if (!r.problem.includes('？') && !(r.problem.includes('上') && r.y === 0)) add('注意', '絵', `タイルの絵が切れている（${r.problem}）`, `${r.map} (${r.x},${r.y})`);
    })
    .catch(() => {});
}

// ---------------------------------------------------------------- 文字
function checkText(g, add) {
  const font = g.font;
  const lines = [];
  const walk = (v, key) => {
    if (typeof v === 'string') lines.push({ key, text: v });
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${key}.${k}`);
  };
  for (const [k, v] of Object.entries(g.dialogues)) if (!k.startsWith('_')) walk(v, k);
  const speakers = new Set();
  const halfMarks = [];
  for (const { key, text } of lines) {
    // 日本語の文に半角の ! ? がまじっている（ほかは全角なので、そろえる）
    if (/[ぁ-んァ-ヶ一-龠…][!?]|[!?][ぁ-んァ-ヶ一-龠」]/.test(text)) halfMarks.push(key);
    const m = /^([^「」\s]+?)「/.exec(text);
    if (m) speakers.add(m[1]);
    // カタカナの言葉が、折り返しで2行に分かれる（例：スラ／イム）
    const body = text.replace(/^[^「」\s]+?(?=「)/, '');
    const face = m && !['主人公'].includes(m[1]) ? 1 : 0;
    const maxW = face ? 600 - 22 - 64 - 14 - 30 : 600 - 22 - 30;
    let w = 0;
    let prev = '';
    for (const ch of Array.from(body)) {
      const cw = font.width(ch);
      if (w + cw > maxW) {
        if (/[ァ-ヶー]/.test(prev) && /[ァ-ヶー]/.test(ch)) add('参考', '文字', `カタカナの言葉が行の終わりで分かれるかも（${prev}｜${ch}）：${short(text)}`, key);
        w = 0;
      }
      w += cw;
      prev = ch;
    }
  }
  if (halfMarks.length) {
    const keys = [...new Set(halfMarks.map((k) => k.split('.')[0]))];
    add('参考', '文字', `半角の「!」「?」と全角の「！」「？」がまざっている（半角は ${halfMarks.length}行・${keys.length}か所）。そろえるなら、どちらかに決める：${keys.slice(0, 12).join('、')}${keys.length > 12 ? ' …' : ''}`);
  }
  // 話す人の顔・名前
  for (const s of speakers) {
    const info = g.speakerInfo?.(s);
    if (!info?.faceKey && !['主人公', 'レオ', 'リナ', '???', '？？？'].includes(s)) add('参考', '文字', `「${s}」のセリフに顔が出ない`, s);
  }
  // 名前の長さ：一覧や敵の名前の札からはみ出さないか
  // 戦闘の一覧（幅300）で、右に「MP 12」「×99」を出しても入る長さ
  for (const it of Object.values(g.items)) if (font.width(it.name) > 200) add('注意', '文字', `道具の名前が長く、一覧からはみ出すかも：${it.name}`);
  for (const sk of Object.values(g.skills)) if (font.width(sk.name) > 192) add('注意', '文字', `技の名前が長く、一覧からはみ出すかも：${sk.name}`);
  for (const [aid, a] of Object.entries(g.enemies.areas)) {
    const names = (a.enemies ?? []).map((id) => g.enemies.enemies[id]?.name ?? id);
    const total = names.reduce((n, s) => n + font.width(s) + 16, 0);
    if (total > 600) add('注意', '文字', `エリア「${aid}」の敵が3体並ぶと、名前の札が重なるかも（${names.join('・')}）`);
  }
  // 下書きのまま（確認待ち）のセリフ
  const sys = g.dialogues;
  const drafts = Object.keys(sys).filter((k) => /^(luke_panic|keepsake_|tip_|slime_)/.test(k));
  if (drafts.length) add('参考', '文字', `下書き（あなたの確認待ち）のセリフ：${drafts.join('、')}`);
}

const short = (s) => (s.length > 34 ? `${s.slice(0, 34)}…` : s);

// ---------------------------------------------------------------- RPGとしての作り
function checkRpg(g, add) {
  // 町：宿屋・道具屋・武器屋・セーブ（光の結晶）
  for (const tid of TOWNS) {
    const map = g.maps.get(tid);
    if (!map) {
      add('重大', 'RPG', `町「${tid}」のマップがない`);
      continue;
    }
    const kinds = new Set();
    for (const o of map.objects) {
      if (o.type === 'savepoint') kinds.add('セーブ');
      const list = scriptCommands(g.scripts[o.props.script] ?? []);
      for (const c of list) {
        if (c.shop) kinds.add(g.shops[c.shop]?.type === 'weapon' ? '武器屋' : '道具屋');
        if (c.inn || c.stay || c.rest) kinds.add('宿屋');
      }
    }
    for (const need of ['宿屋', '道具屋', '武器屋', 'セーブ']) if (!kinds.has(need)) add('注意', 'RPG', `「${mapName(map)}」に${need}がない`);
  }
  // ダンジョン：ボスの部屋の手前にセーブ（光の結晶）
  const dungeons = { lake_cave: 'lake_cave_boss', wind_tower: 'wind_tower_boss', volcano: 'volcano_boss', storm_castle: 'storm_castle_boss', demon_castle: 'demon_castle_boss' };
  for (const [pre, boss] of Object.entries(dungeons)) {
    const floors = [...g.maps.keys()].filter((k) => k.startsWith(pre) && k !== boss);
    const has = floors.some((k) => g.maps.get(k).objects.some((o) => o.type === 'savepoint'));
    if (!has) add('注意', 'RPG', `「${mapName(g.maps.get(boss) ?? { id: boss })}」の手前のダンジョンに、セーブと回復ができる所がない`);
  }
  // 装備：新しい町のお店ほど強い（同じ種類の中で、いちばん強い物が前の町より強い）
  const best = {};
  for (const town of SHOP_ORDER) {
    const shop = g.shops[`${town}_weapon`];
    if (!shop) continue;
    for (const id of shop.stock) {
      const it = g.items[id];
      if (!it || it.kind === 'accessory') continue; // アクセサリーは強さの種類がちがうので、くらべない
      const power = (it.atk ?? 0) + (it.mat ?? 0) + (it.def ?? 0) + (it.mdef ?? 0);
      for (const job of it.equip ?? []) {
        const k = `${it.kind}:${job}`;
        const prev = best[k];
        if (prev && power < prev.power && prev.town !== town) add('参考', 'RPG', `${townName(town)}の「${it.name}」は、前の町の「${prev.name}」より弱い（${job}）`);
        if (!prev || power > prev.power) best[k] = { power, name: it.name, town };
      }
    }
    // 同じお店で、高いのに弱い物
    const list = shop.stock.map((id) => g.items[id]).filter(Boolean);
    for (const a of list) {
      for (const b of list) {
        if (a === b || a.kind !== b.kind || JSON.stringify(a.equip) !== JSON.stringify(b.equip)) continue;
        const pa = (a.atk ?? 0) + (a.mat ?? 0) + (a.def ?? 0) + (a.mdef ?? 0);
        const pb = (b.atk ?? 0) + (b.mat ?? 0) + (b.def ?? 0) + (b.mdef ?? 0);
        if (a.price > b.price && pa < pb && !a.element && !a.effect) add('参考', 'RPG', `${townName(town)}の「${a.name}」は「${b.name}」より高いのに弱い`);
      }
    }
  }
  // 状態異常：その敵が出るエリアより前に、治す道具が買える
  const cureTown = SHOP_ORDER.findIndex((t) => (g.shops[`${t}_item`]?.stock ?? []).includes('cure_potion'));
  AREAS.forEach((aid, i) => {
    for (const eid of g.enemies.areas[aid]?.enemies ?? []) {
      for (const s of g.enemies.enemies[eid]?.actions ?? []) {
        const inf = g.enemies.skills[s]?.inflict;
        if (inf && (cureTown < 0 || cureTown > i)) add('注意', 'RPG', `「${g.enemies.enemies[eid].name}」が${AILMENT_NAME[inf] ?? inf}にしてくるが、その時点で治す道具が買えない`);
      }
    }
  });
  // 敵の強さ：エリアが進むほど、HP・経験値・お金が上がる
  let prev = null;
  for (const aid of AREAS) {
    const es = (g.enemies.areas[aid]?.enemies ?? []).map((id) => g.enemies.enemies[id]).filter(Boolean);
    if (!es.length) continue;
    const avg = (f) => es.reduce((n, e) => n + f(e), 0) / es.length;
    const cur = { aid, hp: avg((e) => e.hp), exp: avg((e) => e.exp ?? 0), gold: avg((e) => (e.gold?.[0] ?? 0)) };
    if (prev) {
      if (cur.hp < prev.hp) add('注意', 'RPG', `「${aid}」の敵のHP（平均${Math.round(cur.hp)}）が、前のエリアより低い`);
      if (cur.exp < prev.exp) add('注意', 'RPG', `「${aid}」の敵の経験値が、前のエリアより少ない`);
      if (cur.gold < prev.gold) add('参考', 'RPG', `「${aid}」の敵のお金が、前のエリアより少ない`);
      if (cur.hp > prev.hp * 3.2) add('参考', 'RPG', `「${aid}」で敵のHPが急に上がる（${Math.round(prev.hp)}→${Math.round(cur.hp)}）。難しさが急に上がっていないか、バランス確認ボットで見る`);
    }
    prev = cur;
  }
  // 技：覚えるレベルでMPが足りるか・覚えない技がないか・覚えるまで間があきすぎないか
  for (const job of ['swordsman', 'mage', 'priest']) {
    const list = Object.entries(g.skills).filter(([, s]) => s.job === job && s.learn).sort((a, b) => a[1].learn - b[1].learn);
    let last = 1;
    for (const [, s] of list) {
      if (s.learn > MAX_LEVEL) add('注意', 'RPG', `技「${s.name}」は Lv${s.learn} で、最高レベル（${MAX_LEVEL}）より上なので覚えられない`);
      const mp = baseStats(job, s.learn)?.mp ?? 0;
      if (s.mp > mp) add('注意', 'RPG', `技「${s.name}」（MP${s.mp}）を覚える Lv${s.learn} では、MPが${mp}しかなく使えない`);
      if (s.learn - last > 8) add('参考', 'RPG', `${job} は Lv${last}〜Lv${s.learn} の間、新しい技を覚えない`);
      last = s.learn;
    }
  }
  // 回復の道具の値段：1回の戦闘でもらえるお金とくらべて安すぎないか（最初のエリア）
  const potion = g.items.potion_s;
  const firstGold = (g.enemies.areas.field_town?.enemies ?? []).map((id) => g.enemies.enemies[id]?.gold?.[0] ?? 0);
  if (potion && firstGold.length && potion.price < Math.min(...firstGold) / 3) add('参考', 'RPG', `回復ポーション小（${potion.price}G）が、最初の敵1体のお金（${Math.min(...firstGold)}G〜）にくらべてかなり安い。回復に困らず、道具の使いどころがなくなるかも`);
}

const townName = (t) => ({ town: '城下町', water: '水の村', wind: '風の村', fire: '炎の村', thunder: '雷の村' })[t] ?? t;

// ---------------------------------------------------------------- 物語の位置（開発者モードの16か所に、正しく立てるか）
function checkStory(g, add) {
  CHECKPOINTS.forEach((c, i) => {
    const st = createNewGame({ job: 'swordsman' }, g.items);
    const at = applyCheckpoint(st, g.items, i);
    const map = g.maps.get(at.map);
    if (!map) return add('重大', '物語', `物語の位置「${c.label}」の場所 ${at.map} がない`);
    if (at.x != null && !canWalk(map, at.x, at.y, (o) => isActive(st, o))) add('注意', '物語', `物語の位置「${c.label}」の立つ場所 ${at.map} (${at.x},${at.y}) が、壁や人の上`);
  });
}

// ---------------------------------------------------------------- セーブ
function checkSave(g, add) {
  const mem = new Map();
  const store = { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), remove: (k) => mem.delete(k) };
  const st = createNewGame({ name: 'テスト', job: 'mage', gender: 'female' }, g.items);
  applyCheckpoint(st, g.items, 8);
  st.gold = 1234;
  st.bag = { potion_s: 3 };
  writeSlot(store, 1, st);
  const back = readSlot(store, 1);
  if (!back) return add('重大', 'セーブ', 'セーブしたものが読みこめない');
  const a = JSON.stringify(st);
  const b = JSON.stringify(back.state);
  if (a !== b) add('重大', 'セーブ', 'セーブして読みこむと、中身が変わる');
  if (!migrate(JSON.parse(store.get([...mem.keys()][0])))) add('重大', 'セーブ', '古いセーブの読み直し（migrate）で失敗する');
}

// ---------------------------------------------------------------- 画面を1つずつ開いて、こわれないか（エラーが出ないか）
let testState = null;
async function checkScenes(g, add) {
  const ctx = document.createElement('canvas').getContext('2d');
  const tryDraw = async (label, make) => {
    const stack = g.scenes.stack.slice();
    g.state = testState;
    try {
      const scene = await make();
      if (scene) {
        g.scenes.push(scene);
        for (let i = 0; i < 6; i++) g.scenes.update(16);
        g.scenes.draw(ctx);
      }
    } catch (e) {
      add('重大', '仕組み', `「${label}」の画面でエラー：${e.message}`, e.stack?.split('\n')[1]?.trim() ?? '');
    } finally {
      g.scenes.stack.length = 0;
      g.scenes.stack.push(...stack);
    }
  };
  const { FieldScene } = await import('../src/ui/scenes/field.js');
  const { TitleScene } = await import('../src/ui/scenes/title.js');
  const { NewGameScene } = await import('../src/ui/scenes/newgame.js');
  const { StatusScene } = await import('../src/ui/scenes/menus.js');
  const { SettingsScene } = await import('../src/ui/scenes/settings.js');
  const { SaveLoadScene } = await import('../src/ui/scenes/saveload.js');
  const { FieldMenuScene } = await import('../src/ui/scenes/fieldmenu.js');
  const { BattleScene } = await import('../src/ui/scenes/battle.js');
  const st = createNewGame({ job: 'swordsman' }, g.items);
  applyCheckpoint(st, g.items, 13);
  for (const m of st.party) {
    m.level = 30;
    const s = totalStats(m, g.items);
    m.hp = s.hp;
    m.mp = s.mp;
  }
  testState = st;
  g.state = st;
  await tryDraw('タイトル', () => new TitleScene());
  await tryDraw('はじめから（名前入力）', () => new NewGameScene());
  await tryDraw('つよさ', () => new StatusScene());
  await tryDraw('せってい', () => new SettingsScene({ inGame: true }));
  await tryDraw('セーブ', () => new SaveLoadScene({ mode: 'save' }));
  for (const [id, map] of g.maps) {
    if (id === 'testroom') continue;
    const start = findStart(map) ?? map.objects.find((o) => o.type === 'exit') ?? { x: 1, y: 1 };
    st.location = { map: id, x: start.x, y: start.y, dir: 'down', placeName: '' };
    await tryDraw(`マップ ${mapName(map)}`, () => new FieldScene());
  }
  st.location = { map: 'town', x: 19, y: 20, dir: 'down', placeName: '' };
  await tryDraw('フィールドのメニュー', () => new FieldMenuScene({}));
  for (const aid of AREAS) {
    const ids = g.enemies.areas[aid]?.enemies ?? [];
    await tryDraw(`戦闘 ${aid}`, () => new BattleScene({ enemyIds: ids, area: aid, onEnd: () => {} }));
  }
  for (const [id, e] of Object.entries(g.enemies.enemies)) {
    if (!e.boss) continue;
    await tryDraw(`ボス戦 ${e.name}`, () => new BattleScene({ enemyIds: [id], area: 'demon', boss: true, onEnd: () => {} }));
  }
}

// ---------------------------------------------------------------- 戦闘（全部の敵と、何ターンか戦ってこわれないか）
function checkBattles(g, add) {
  let n = 0;
  for (const [id, e] of Object.entries(g.enemies.enemies)) {
    const st = createNewGame({ job: 'mage' }, g.items);
    applyCheckpoint(st, g.items, 13);
    for (const m of st.party) m.level = e.boss ? 35 : 25;
    for (const m of st.party) {
      const s = totalStats(m, g.items);
      m.hp = s.hp;
      m.mp = s.mp;
    }
    try {
      const b = createBattle({ state: st, items: g.items, skills: g.skills, enemyData: g.enemies, area: 'demon', enemyIds: [id], boss: !!e.boss });
      for (let t = 0; t < 40 && !b.result; t++) {
        planEnemies(b);
        const cmds = b.allies.map((u, i) => {
          if (!alive(u)) return { type: 'none' };
          const sk = learnedSkills(u.m, g.skills).find((s) => g.skills[s].kind === 'magic' && g.skills[s].mp <= u.m.mp);
          return sk && t % 2 ? { type: 'skill', skill: sk, target: 0 } : { type: 'attack', target: 0 };
        });
        resolveTurn(b, cmds);
      }
      n++;
    } catch (err) {
      add('重大', '仕組み', `「${e.name}」との戦いでエラー：${err.message}`, err.stack?.split('\n')[1]?.trim() ?? '');
    }
  }
  // 雑魚の組み合わせ（エリアごとに何回か）
  for (const aid of AREAS) {
    const area = g.enemies.areas[aid];
    if (!area) continue;
    for (let k = 0; k < 5; k++) {
      const ids = rollEncounter(area);
      if (!ids.length) add('重大', 'データ', `エリア「${aid}」で、敵が1体も出ない組み合わせになった`);
    }
  }
  add('参考', '仕組み', `${n}種類の敵と、40ターンまで戦ってみた（エラーなし）`);
}

// ---------------------------------------------------------------- 結果の一覧
function report(issues, seconds) {
  const order = { 重大: 0, 注意: 1, 参考: 2 };
  const color = { 重大: '#e0484f', 注意: '#e6a23c', 参考: '#6b8bd6' };
  const sorted = issues.slice().sort((a, b) => order[a.level] - order[b.level] || a.cat.localeCompare(b.cat));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const counts = Object.keys(order).map((l) => `<span class="pill" style="background:${color[l]}">${l} ${issues.filter((i) => i.level === l).length}</span>`).join(' ');
  const cats = [...new Set(sorted.map((i) => i.cat))];
  const rows = cats
    .map((c) => {
      const list = sorted.filter((i) => i.cat === c);
      return `<h2>${esc(c)}（${list.length}）</h2><table>${list.map((i) => `<tr><td><span class="pill" style="background:${color[i.level]}">${i.level}</span></td><td>${esc(i.msg)}</td><td class="w">${esc(i.where)}</td></tr>`).join('')}</table>`;
    })
    .join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>全体チェックの結果</title>
<style>body{font-family:sans-serif;background:#16142a;color:#eee;margin:16px;line-height:1.5}h1{font-size:20px}h2{font-size:16px;margin-top:22px;border-bottom:1px solid #444}
table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #2c2a44;vertical-align:top}.w{color:#9a98b8;font-size:12px}
.pill{display:inline-block;padding:1px 8px;border-radius:9px;color:#fff;font-size:12px;white-space:nowrap}</style></head>
<body><h1>全体チェックの結果</h1><p>${counts}　（${seconds}秒・${new Date().toLocaleString('ja-JP')}）</p>
<p class="w">重大：遊べなくなる・こわれる　注意：不自然・遊びにくい　参考：気づいたこと（直すかは決め方しだい）</p>${rows}</body></html>`;
}
