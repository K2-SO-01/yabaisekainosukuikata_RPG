// 絵が途中で切れている所を探すボット（開発用）
// 物の絵（deco・roof の層）が、マスの上のふち（または下のふち）までかかっているのに、
// となりのマスに続きの絵がない所を「半分しか描かれていない」として出す
// 使い方：開発用モード（?dev=1）のコンソールで
//   const { checkTiles } = await import('./tools/check_tiles.js'); console.table(checkTiles())
const EDGE_CACHE = new Map();

// タイル1枚の、上のふち・下のふちの、色がついている列
function edges(map, gid) {
  const ts = [...(map.tilesetImages ?? [])].reverse().find((t) => gid >= t.firstgid);
  if (!ts || ts.frames > 1) return null; // 水（動くタイル）は調べない
  const key = `${ts.img.src}:${gid - ts.firstgid}`;
  if (EDGE_CACHE.has(key)) return EDGE_CACHE.get(key);
  const i = gid - ts.firstgid;
  const sx = (i % ts.columns) * 32;
  const sy = Math.floor(i / ts.columns) * 32;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(ts.img, sx, sy, 32, 32, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  const row = (y) => Array.from({ length: 32 }, (_, k) => d[(y * 32 + k) * 4 + 3] > 40);
  const top = row(0);
  const bottom = row(31);
  const full = d.filter((_, k) => k % 4 === 3 && d[k] > 40).length > 32 * 32 * 0.9; // ほとんど埋まっている＝地面のようなタイル
  const r = { top, bottom, full, topN: top.filter(Boolean).length, bottomN: bottom.filter(Boolean).length };
  EDGE_CACHE.set(key, r);
  return r;
}

export function checkTiles({ maps = null, minEdge = 5 } = {}) {
  const g = window.game;
  const out = [];
  for (const [id, map] of g.maps) {
    if (maps && !maps.includes(id)) continue;
    const W = map.width;
    const layers = map.layerOrder.filter((n) => n !== 'collision').map((n) => map.layers[n]);
    const cell = (x, y) => (x < 0 || y < 0 || x >= W || y >= map.height ? [] : layers.map((l) => l.data[y * W + x]).filter((v) => v > 0));
    for (const name of ['deco', 'roof']) {
      const layer = map.layers[name];
      if (!layer) continue;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < W; x++) {
          const gid = layer.data[y * W + x];
          if (!gid) continue;
          const e = edges(map, gid);
          if (!e || e.full) continue;
          // 上のふちにかかっている → 上のマスに、下のふちが同じ列でつながる絵があるか
          if (e.topN >= minEdge) {
            // 続きの絵（地面や壁のような、ほとんど埋まったタイルは続きとみなさない）
            const above = cell(x, y - 1).map((g2) => edges(map, g2)).filter(Boolean);
            const ok = above.some((e2) => !e2.full && e2.bottom.some((v, k) => v && e.top[k]));
            const onWall = above.some((e2) => e2.full);
            if (!ok) out.push({ map: id, x, y, gid, layer: name, problem: onWall ? '上が切れている？（壁に接している）' : '上が切れている' });
          }
          if (e.bottomN >= minEdge && y < map.height - 1) {
            const below = cell(x, y + 1);
            // 下が水（動くタイル）なら、岸や橋の絵が水に続いているので、切れていない
            const ok = below.some((g2) => {
              const e2 = edges(map, g2);
              return !e2 || e2.full || e2.top.some((v, k) => v && e.bottom[k]);
            });
            if (!ok) out.push({ map: id, x, y, gid, layer: name, problem: '下が切れている' });
          }
        }
      }
    }
  }
  return out;
}
