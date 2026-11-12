// 通常プレイボット（企画書14章）：本物のゲームの画面（タイトル・名前入力・フィールド・会話・戦闘・宿屋・エンディング）を、
// キー入力で最初から「おわり」まで遊ぶ。進めなくなったら止まって、どこで止まったかを出す
// 使い方：開発用モード（?dev=1）で、開発者ツールのコンソールから
//   const { playthrough } = await import('./tools/playbot.js'); await playthrough({ gender: 'male', job: 'swordsman' })
// 近道しているところ（画面の操作を省いて、直接ゲームの状態を変える）：
//   ・名前は入力せずにそのまま（初期の名前）
//   ・買い物と装備：村に着いたら、ボットの買い物（tools/bot.js）で買って装備する
//   ・戦闘の外での回復の呪文・薬：ボットの回復（tools/bot.js）で行う
import { Sim, STRATEGIES } from './bot.js';
import { canWalk, findStart } from '../src/core/map.js';
import { isActive } from '../src/core/events.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const FRAME = 16;

// ---- 物語の順番 ----
const CHAPTERS = [
  { flag: 'boss_water', village: 'village_water', shop: 'water', field: 'field_water', target: 6, boss: { map: 'lake_cave_boss', x: 6, y: 3 } },
  { flag: 'boss_wind', village: 'village_wind', shop: 'wind', field: 'field_wind', target: 10, boss: { map: 'wind_tower_boss', x: 6, y: 3 } },
  { flag: 'boss_fire', village: 'village_fire', shop: 'fire', field: 'field_fire', target: 15, boss: { map: 'volcano_boss', x: 6, y: 3 } },
  { flag: 'boss_thunder', village: 'village_thunder', shop: 'thunder', field: 'field_thunder', target: 20, boss: { map: 'storm_castle_boss', x: 6, y: 3 } },
  { flag: 'demon_defeated', village: 'village_thunder', shop: 'thunder', field: 'field_demon', target: 27, boss: { map: 'demon_castle_boss', x: 6, y: 2 } },
];
const INN = { village_water: [6, 3], village_wind: [6, 3], village_fire: [6, 3], village_thunder: [6, 3], town: [4, 19] };

export async function playthrough({ gender = 'male', job = 'swordsman', maxMinutes = 300, log = console.log } = {}) {
  const g = window.game;
  if (!g) throw new Error('開発用モード（?dev=1）で開いてください');
  // 音を消す
  try {
    g.audio.bgmOut && (g.audio.bgmOut.gain.value = 0);
    g.audio.seOut && (g.audio.seOut.gain.value = 0);
    g.audio.master && (g.audio.master.gain.value = 0);
  } catch {
    /* 何もしない */
  }
  // ふだんの画面の更新を止めて、ボットが自分で1コマずつ進める
  const realInput = g.input.update.bind(g.input);
  const realScenes = g.scenes.update.bind(g.scenes);
  let stepping = false;
  g.input.update = (dt) => stepping && realInput(dt);
  g.scenes.update = (dt) => stepping && realScenes(dt);

  const sim = new Sim({ gender, job }, STRATEGIES.efficient, 4242);
  Object.defineProperty(sim, 'st', { get: () => g.state, set: () => {}, configurable: true });
  g.autoBattle = (b, who) => sim.command(b, b.allies[who], who, b.boss);

  const report = { gender, job, frames: 0, battles: 0, wins: 0, defeats: 0, rests: 0, bosses: [], events: [], stuck: null };
  const say = (t) => {
    const line = `[${fmtTime(report.frames)}] ${t}`;
    report.events.push(line);
    log(line);
  };

  // ---- マップのつながり（出口と、町の門） ----
  const mapOf = (id) => g.maps.get(id);
  const edges = (id) => {
    const map = mapOf(id);
    const out = [];
    for (const o of map.objects) {
      if (!isActive(g.state, o)) continue;
      if (o.type === 'exit' && o.props.map) out.push({ x: o.x, y: o.y, to: o.props.map });
      if (o.type === 'trigger' && o.props.script === 'town_gate' && g.state.flags.home_event_done) out.push({ x: o.x, y: o.y, to: 'field_town' });
    }
    return out;
  };
  const mapRoute = (from, to) => {
    if (from === to) return [from];
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const m = q.shift();
      for (const e of edges(m)) {
        if (prev.has(e.to) || !g.maps.has(e.to)) continue;
        prev.set(e.to, m);
        if (e.to === to) {
          const r = [to];
          for (let c = m; c; c = prev.get(c)) r.unshift(c);
          return r;
        }
        q.push(e.to);
      }
    }
    return null;
  };

  // ---- 1つのマップの中の道（今の町の人の位置も見る） ----
  const pathTo = (field, goals) => {
    const map = field.map;
    const isOn = (o) => isActive(g.state, o);
    const W = map.width;
    const key = (x, y) => y * W + x;
    const goalSet = new Set(goals.map((p) => key(p.x, p.y)));
    const start = field.pos;
    const prev = new Map([[key(start.x, start.y), -1]]);
    const q = [key(start.x, start.y)];
    while (q.length) {
      const c = q.shift();
      if (goalSet.has(c)) {
        const path = [];
        for (let k = c; k !== -1; k = prev.get(k)) path.unshift({ x: k % W, y: Math.floor(k / W) });
        return path;
      }
      const x = c % W, y = Math.floor(c / W);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (prev.has(k) || !canWalk(map, nx, ny, isOn)) continue;
        // 出口やイベントのマスは、そこが目的地の時だけ通る（うっかり別のマップに行かない）
        if (!goalSet.has(k) && map.objects.some((o) => (o.type === 'exit' || o.type === 'trigger') && o.x === nx && o.y === ny && isOn(o))) continue;
        prev.set(k, c);
        q.push(k);
      }
    }
    return null;
  };

  // 話しかける場所（となり。お店の人などはカウンター越しも）と、その時に向く方向
  const talkSpots = (field, t) => {
    const out = [];
    const npc = field.map.objects.find((o) => o.x === t.x && o.y === t.y && o.type === 'npc' && isActive(g.state, o));
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      out.push({ x: t.x - dx, y: t.y - dy, face: d });
      if (npc?.props.counter) out.push({ x: t.x - 2 * dx, y: t.y - 2 * dy, face: d });
    }
    return out.filter((p) => canWalk(field.map, p.x, p.y, (o) => isActive(g.state, o)) || (p.x === field.pos.x && p.y === field.pos.y));
  };

  // ---- 今やること ----
  const chapter = () => CHAPTERS.find((c) => !g.state.flags[c.flag]);
  const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  const hpRatio = () => avg(g.state.party.map((m) => m.hp / sim.stats(m).hp));
  const healer = () => g.state.party.find((m) => m.id === 'luke');
  const mpRatio = () => {
    const h = healer();
    return h ? h.mp / sim.stats(h).mp : 1;
  };
  const visited = (id) => (g.state.visited ?? []).includes(id);
  const restPlace = () => {
    const c = chapter();
    if (c && visited(c.village)) return c.village;
    const v = [...CHAPTERS].reverse().find((x) => visited(x.village));
    return v?.village ?? 'town';
  };
  const extraLevel = {};
  let grindSpot = null;
  let restWanted = false;
  let shoppedAt = null;

  function decideGoal(field) {
    const st = g.state;
    const here = field.map.id;
    if (!st.flags.audience_done) return null;
    if (!st.flags.home_event_done) return { map: 'town', x: 4, y: 21, act: 'step', why: '家のイベント' };
    if (!st.flags.luke_joined) return { map: 'field_town', x: 18, y: 14, act: 'step', why: 'ルークの加入' };
    const c = chapter();
    if (!c) return null; // 魔王を倒したあと：エンディングの台本が進む
    if (!visited(c.village)) return { map: c.village, x: 12, y: 16, act: 'step', why: `${c.village}へ` };
    // 休む：弱っている時、または ボスの前に村の近くにいる時
    const low = hpRatio() < 0.5 || mpRatio() < 0.25 || st.party.some((m) => m.hp <= 0);
    const inDungeon = !!field.map.props.dungeon;
    const canPay = st.gold >= 50 || restPlace() === 'town';
    if (canPay && (low || restWanted || (!inDungeon && (hpRatio() < 0.85 || mpRatio() < 0.6) && here === c.village))) {
      const place = restPlace();
      const [x, y] = INN[place];
      return { map: place, x, y, act: 'talk', why: '宿屋で休む', rest: true };
    }
    // レベル上げ：負けたボスは、レベルを1つずつ上げてから挑む
    const need = c.target - 1 + (extraLevel[c.flag] ?? 0);
    if ((st.party[0].level < need || !canPay) && !inDungeon) {
      if (here !== c.field) return { map: c.field, x: null, y: null, act: 'any', why: 'レベル上げの場所へ' };
      if (!grindSpot || (field.pos.x === grindSpot.x && field.pos.y === grindSpot.y)) grindSpot = randomSpot(field);
      return { map: c.field, x: grindSpot.x, y: grindSpot.y, act: 'step', why: `レベル上げ（Lv${need}まで）` };
    }
    return { map: c.boss.map, x: c.boss.x, y: c.boss.y, act: 'talk', why: `${c.flag}に挑む` };
  }

  function randomSpot(field) {
    const map = field.map;
    for (let n = 0; n < 200; n++) {
      const x = Math.floor(Math.random() * map.width), y = Math.floor(Math.random() * map.height);
      if (Math.abs(x - field.pos.x) + Math.abs(y - field.pos.y) < 6) continue;
      if (canWalk(map, x, y, (o) => isActive(g.state, o)) && !map.objects.some((o) => (o.type === 'exit' || o.type === 'trigger') && Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) return { x, y };
    }
    return { x: field.pos.x, y: field.pos.y };
  }

  // ---- 画面ごとの操作 ----
  let lastPosKey = '';
  let samePos = 0;
  let lastScene = null;
  let lastMap = null;
  let lastFlags = '';
  let idleFrames = 0;
  let inBattle = null;
  let talked = 0;

  function control() {
    const st = g.state;
    const top = g.scenes.top;
    const name = top?.constructor?.name;
    const input = g.input;
    input.keys.clear();
    if (g.scenes.fade) return;

    if (name === 'TitleScene' && top.menu && top.menu.index !== 0) {
      if (report.frames % 2 === 0) input.press('up');
      return;
    }
    if (name === 'TapScene' || name === 'TitleScene' || name === 'PrologueScene' || name === 'MessageScene' || name === 'PickScene' || name === 'RestScene' || name === 'BlackTextScene' || name === 'TheEndScene') {
      if (report.frames % 2 === 0) input.press('ok');
      return;
    }
    if (name === 'EndRollScene') {
      input.keys.add('ok');
      return;
    }
    if (name === 'ChoiceScene') {
      if (top.menu.index !== 0) input.press('up');
      else input.press('ok');
      return;
    }
    if (name === 'NewGameScene') {
      if (top.step === 'name') return top.command(4);
      if (report.frames % 2) return;
      const want = top.step === 'gender' ? (gender === 'female' ? 1 : 0) : top.step === 'job' ? (job === 'mage' ? 1 : 0) : 0;
      if (top.menu.index !== want) input.press(top.menu.index < want ? 'down' : 'up');
      else input.press('ok');
      return;
    }
    if (name === 'BattleScene') {
      if (!inBattle) {
        inBattle = { boss: top.b.boss, ids: top.b.enemies.map((e) => e.id).join(','), turns: 0 };
      }
      inBattle.turns = top.b.turn;
      inBattle.result = top.b.result;
      return;
    }
    if (name !== 'FieldScene') {
      // メニューやお店が開いていたら閉じる
      if (report.frames % 3 === 0) input.press('cancel');
      return;
    }
    const field = top;
    // 戦闘が終わった直後
    if (inBattle) {
      report.battles++;
      if (inBattle.result === 'win') report.wins++;
      if (inBattle.result === 'lose') report.defeats++;
      if (inBattle.boss) {
        const c = chapter();
        report.bosses.push({ ids: inBattle.ids, result: inBattle.result, turns: inBattle.turns, level: st.party.map((m) => m.level).join('/') });
        say(`ボス戦 ${inBattle.ids}：${inBattle.result === 'win' ? '勝ち' : inBattle.result === 'lose' ? '負け' : inBattle.result}（${inBattle.turns}ターン、Lv ${st.party.map((m) => m.level).join('/')}）`);
        if (inBattle.result === 'lose' && c) extraLevel[c.flag] = (extraLevel[c.flag] ?? 0) + 1;
      } else if (inBattle.result === 'lose') say(`雑魚戦で全滅（${inBattle.ids}）。${st.location.map}に戻された`);
      inBattle = null;
      if (st.party.some((m) => m.hp > 0)) sim.fieldCare();
    }
    if (field.busy || field.moving || field.waitT > 0) return;

    // 村に着いたら買い物（近道）
    const here = field.map.id;
    if (here !== lastMap) {
      lastMap = here;
      say(`${field.map.props.name ?? here} に入った（Lv ${st.party.map((m) => m.level).join('/')}、${st.gold}G）`);
      if (here.startsWith('village_') && shoppedAt !== here + ':' + chapter()?.flag) {
        shoppedAt = here + ':' + chapter()?.flag;
        const before = st.gold;
        // 宿代は残しておく
        const keep = Math.min(st.gold, 200);
        st.gold -= keep;
        sim.shop(here.slice(8));
        st.gold += keep;
        if (before !== st.gold) say(`買い物（近道）：${before}G → ${st.gold}G`);
      }
    }

    const goal = decideGoal(field);
    if (!goal) return;
    // 別のマップへ：次のマップへの出口に向かう
    if (goal.map !== here) {
      const route = mapRoute(here, goal.map);
      if (!route) return stuck(`${here} から ${goal.map} への道が見つからない（${goal.why}）`);
      const next = route[1];
      const exits = edges(here).filter((e) => e.to === next);
      return walkTo(field, exits.map((e) => ({ x: e.x, y: e.y })), goal);
    }
    if (goal.act === 'any') return;
    if (goal.act === 'step') {
      if (field.pos.x === goal.x && field.pos.y === goal.y) {
        // 着いたのに何も起きない：少し待ってから1歩動く
        return;
      }
      return walkTo(field, [{ x: goal.x, y: goal.y }], goal);
    }
    // 話しかける
    const spots = talkSpots(field, goal);
    const at = spots.find((p) => p.x === field.pos.x && p.y === field.pos.y);
    if (at) {
      if (field.dir !== at.face) return input.press(at.face);
      if (talked > 0) {
        talked--;
        return;
      }
      talked = 30;
      if (goal.rest) {
        restWanted = false;
        report.rests++;
      }
      return input.press('ok');
    }
    return walkTo(field, spots, goal);
  }

  function walkTo(field, goals, goal) {
    const path = pathTo(field, goals);
    if (!path) {
      samePos += 1;
      if (samePos % 120 === 0) say(`道がふさがっている？（${goal.why}、${field.map.id} ${field.pos.x},${field.pos.y}）`);
      // 町の人がどくのを待つ。待っても無理なら、ちょっと動く
      if (samePos % 60 === 30) g.input.keys.add(['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]);
      return;
    }
    if (path.length < 2) return;
    const n = path[1];
    const d = Object.entries(DIRS).find(([, [dx, dy]]) => field.pos.x + dx === n.x && field.pos.y + dy === n.y)?.[0];
    if (d) {
      g.input.keys.add(d);
      g.input.dirOrder = [d];
      if (g.state.flags.dash !== false) g.input.keys.add('dash');
    }
  }

  function stuck(why) {
    if (!report.stuck) {
      report.stuck = why;
      say(`止まった：${why}`);
    }
  }

  // ---- 1コマずつ回す ----
  // タイトルから始める
  if (!['TapScene', 'TitleScene'].includes(g.scenes.top?.constructor?.name)) {
    const { TitleScene } = await import('../src/ui/scenes/title.js');
    g.scenes.replaceAll(new TitleScene());
  }
  say(`開始：${gender === 'female' ? '女' : '男'}・${job === 'mage' ? '魔法使い' : '剣士'}`);
  const maxFrames = (maxMinutes * 60 * 1000) / FRAME;
  let started = false;
  try {
    while (report.frames < maxFrames && !report.stuck) {
      for (let k = 0; k < 600 && !report.stuck; k++) {
        report.frames++;
        control();
        stepping = true;
        realInput(FRAME);
        realScenes(FRAME);
        stepping = false;
        const st = g.state;
        if (st && g.scenes.top?.constructor?.name === 'FieldScene') started = true;
        // 進んでいるか（場所・画面・フラグのどれかが変わっていれば進んでいる）
        const top = g.scenes.top;
        const posKey = `${st?.location?.map}:${st?.location?.x},${st?.location?.y}:${top?.b?.turn ?? ''}:${Math.round(top?.y ?? 0)}:${top?.who ?? ''}`;
        const flags = st ? Object.keys(st.flags).filter((f) => st.flags[f]).join(',') : '';
        if (posKey !== lastPosKey || top !== lastScene || flags !== lastFlags) {
          if (flags !== lastFlags && lastFlags) {
            const added = flags.split(',').filter((f) => !lastFlags.split(',').includes(f));
            if (added.length) say(`フラグ：${added.join(', ')}`);
          }
          lastPosKey = posKey;
          lastScene = top;
          lastFlags = flags;
          idleFrames = 0;
          samePos = 0;
        } else if (++idleFrames > 4000) {
          stuck(`約1分、何も変わらない（画面 ${top?.constructor?.name}、${posKey}、${g.scenes.stack.map((s) => s.constructor.name).join(' > ')}）`);
        }
        if (st?.flags?.cleared) report.sawCleared = true;
        if (report.sawCleared && g.scenes.top?.constructor?.name === 'TitleScene') {
          say('おわり → タイトルに戻った。クリア！');
          report.cleared = true;
          return finish();
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!report.stuck && !report.cleared) stuck(`${maxMinutes}分（ゲームの中の時間）でクリアできなかった`);
  } finally {
    g.input.update = realInput;
    g.scenes.update = realScenes;
    g.autoBattle = null;
  }
  return finish();

  function finish() {
    report.time = fmtTime(report.frames);
    report.party = g.state?.party.map((m) => `${m.id} Lv${m.level}`).join(' ');
    return report;
  }
}

function fmtTime(frames) {
  const s = Math.floor((frames * FRAME) / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
