// マップのデータとルール（歩けるか、目の前に何があるか）。画面には依存しない
// マップは Tiled（無料のマップエディタ）の JSON 形式で作る

export const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

function propsOf(list) {
  const p = {};
  for (const item of list ?? []) p[item.name] = item.value;
  return p;
}

export function parseTiledMap(json, id = '') {
  const layers = {};
  const layerOrder = [];
  const objects = [];
  for (const layer of json.layers ?? []) {
    if (layer.type === 'tilelayer') {
      layers[layer.name] = { name: layer.name, data: layer.data, visible: layer.visible !== false };
      layerOrder.push(layer.name);
    } else if (layer.type === 'objectgroup') {
      for (const o of layer.objects ?? []) {
        objects.push({
          id: o.id,
          name: o.name ?? '',
          type: o.type || o.class || '',
          x: Math.floor(o.x / json.tilewidth),
          y: Math.floor(o.y / json.tileheight),
          props: propsOf(o.properties),
        });
      }
    }
  }
  return {
    id,
    width: json.width,
    height: json.height,
    tileW: json.tilewidth,
    tileH: json.tileheight,
    tilesets: json.tilesets ?? [],
    layers,
    layerOrder,
    objects,
    props: propsOf(json.properties),
  };
}

export function isInside(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isWallTile(map, x, y) {
  const c = map.layers.collision;
  return !!c && c.data[y * map.width + x] !== 0;
}

export function entityAt(map, x, y) {
  return map.objects.find((o) => o.x === x && o.y === y && o.type !== 'start') ?? null;
}

export function canWalk(map, x, y) {
  if (!isInside(map, x, y) || isWallTile(map, x, y)) return false;
  const e = entityAt(map, x, y);
  return !e || e.props.walkable === true;
}

export function stepTarget(pos, dir) {
  const [dx, dy] = DIRS[dir];
  return { x: pos.x + dx, y: pos.y + dy };
}

export function tryMove(map, pos, dir) {
  const t = stepTarget(pos, dir);
  return canWalk(map, t.x, t.y) ? t : null;
}

export function findStart(map) {
  return map.objects.find((o) => o.type === 'start') ?? { x: 1, y: 1, props: {} };
}
