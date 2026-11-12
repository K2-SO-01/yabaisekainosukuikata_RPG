// 会話・質問・一覧の選択を「待てる」形にした道具（async の流れで、お店やメニューを書くため）
import { HEIGHT, WIDTH } from '../config.js';
import { totalStats, memberName, isDown } from '../core/party.js';
import { COLORS } from './draw.js';
import { PickScene } from './list.js';
import { ChoiceScene } from './menu.js';
import { MessageScene } from './message.js';

// セリフを出して、読み終わるまで待つ。lines は文字列か、セリフの名前（data/dialogues）か、その配列
export function say(g, lines, { face = null } = {}) {
  const list = resolveLines(g, lines);
  return new Promise((done) => g.scenes.push(new MessageScene(list, { defaultFaceKey: face, onDone: done })));
}

// セリフを出したまま選択肢を出し、選んだ番号を返す（キャンセルは最後の選択肢）
export function ask(g, lines, choices, { face = null, cancelIndex = choices.length - 1, width = 130 } = {}) {
  const list = resolveLines(g, lines);
  return new Promise((done) => {
    const msg = new MessageScene(list, {
      defaultFaceKey: face,
      keepOpen: true,
      onDone: () => {
        const finish = (i) => {
          g.scenes.pop(msg);
          done(i);
        };
        g.scenes.push(
          new ChoiceScene({
            items: choices.map((label, i) => ({ label, value: i })),
            x: WIDTH - width - 20,
            y: HEIGHT - 124 - choices.length * 26 - 22,
            width,
            onSelect: (item) => finish(item.value),
            onCancel: () => finish(cancelIndex),
          }),
        );
      },
    });
    g.scenes.push(msg);
  });
}

// 一覧から選ぶ。選んだ value を返す（キャンセルは null）
export function pick(g, opts) {
  return new Promise((done) => g.scenes.push(new PickScene({ ...opts, onDone: (v) => done(v) })));
}

// 仲間を1人選ぶ。filter に合わない人は選べない（灰色）
export function pickMember(g, { filter = () => true, x = 24, y = 24, index = 0 } = {}) {
  const st = g.state;
  const items = st.party.map((m, i) => {
    const s = totalStats(m, g.items);
    return {
      label: memberName(st, m),
      right: `HP ${m.hp}/${s.hp}  MP ${m.mp}/${s.mp}`,
      value: i,
      disabled: !filter(m),
      color: isDown(m) ? '#c0392b' : undefined,
    };
  });
  return pick(g, { items, x, y, w: 300, rows: items.length, index });
}

function resolveLines(g, lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr.flatMap((l) => g.pick?.(g.dialogues?.[l]) ?? [l]);
}

export const SYS_COLOR = COLORS.text;

// セリフを出したまま、次の操作（一覧など）へ進む。全部出し終わったら、その会話の場面を返す。閉じるのは呼ぶ側（g.scenes.pop）
export function holdSay(g, lines, { face = null } = {}) {
  const list = resolveLines(g, lines);
  return new Promise((done) => {
    const msg = new MessageScene(list, { defaultFaceKey: face, keepOpen: true, onDone: () => done(msg) });
    g.scenes.push(msg);
  });
}
