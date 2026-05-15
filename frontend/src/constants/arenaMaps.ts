import type { Position } from '../utils/pathfinding';

/** Dark arena visual preset — distinct mood per map via hsl tweaks */
export type ArenaMapTheme = {
  floor: string;
  path: string;
  pathAccent: string;
  spawnRing: string;
  baseRing: string;
};

export type ArenaMapDefinition = {
  id: string;
  name: string;
  description: string;
  gridCols: number;
  gridRows: number;
  /** Pixel cell size for layout */
  cellSize: number;
  spawnPoint: Position;
  basePosition: Position;
  /** Ordered 4-connected grid cells from spawn → base (enemies follow this corridor). */
  route: Position[];
  theme: ArenaMapTheme;
};

/** Manhattan steps between two cells (axis-aligned). */
export function manhattanPath(from: Position, to: Position, horizontalFirst: boolean): Position[] {
  const out: Position[] = [{ ...from }];
  let x = from.x;
  let y = from.y;
  if (horizontalFirst) {
    while (x !== to.x) {
      x += x < to.x ? 1 : -1;
      out.push({ x, y });
    }
    while (y !== to.y) {
      y += y < to.y ? 1 : -1;
      out.push({ x, y });
    }
  } else {
    while (y !== to.y) {
      y += y < to.y ? 1 : -1;
      out.push({ x, y });
    }
    while (x !== to.x) {
      x += x < to.x ? 1 : -1;
      out.push({ x, y });
    }
  }
  return out;
}

/** Join waypoint list into one 4-connected route (dedupe shared corners). */
export function chainWaypoints(waypoints: Position[], horizontalFirst: boolean): Position[] {
  if (waypoints.length < 2) return waypoints.slice();
  const full: Position[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = manhattanPath(waypoints[i], waypoints[i + 1], horizontalFirst);
    if (full.length === 0) {
      full.push(...seg);
    } else {
      if (seg[0].x === full[full.length - 1].x && seg[0].y === full[full.length - 1].y) {
        full.push(...seg.slice(1));
      } else {
        full.push(...seg);
      }
    }
  }
  return full;
}

/** Subpath along fixed arena route from nearest progress to base. */
export function sliceRouteFromPosition(pos: Position, fullRoute: Position[]): Position[] {
  if (fullRoute.length < 2) return fullRoute.slice();
  const rx = Math.round(pos.x);
  const ry = Math.round(pos.y);
  let idx = fullRoute.findIndex((p) => p.x === rx && p.y === ry);
  if (idx < 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < fullRoute.length; i++) {
      const dx = fullRoute[i].x - pos.x;
      const dy = fullRoute[i].y - pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    idx = best;
  }
  return fullRoute.slice(idx);
}

export function isCellOnArenaRoute(cell: Position, route: Position[]): boolean {
  return route.some((p) => p.x === cell.x && p.y === cell.y);
}

const t = (
  floor: string,
  path: string,
  pathAccent: string,
  spawnRing: string,
  baseRing: string
): ArenaMapTheme => ({ floor, path, pathAccent, spawnRing, baseRing });

/** Legacy: dynamic A* — route empty; dimensions come from GAME_CONFIG + expansions at runtime. */
export const CLASSIC_MAP_ID = 'classic';

const ARENAS: ArenaMapDefinition[] = [
  {
    id: 'ash_pass',
    name: 'Ash Pass',
    description: 'Long switchbacks through cinder fields — several tight bends.',
    gridCols: 16,
    gridRows: 20,
    cellSize: 30,
    spawnPoint: { x: 0, y: 10 },
    basePosition: { x: 15, y: 18 },
    route: chainWaypoints(
      [
        { x: 0, y: 10 },
        { x: 9, y: 10 },
        { x: 9, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: 15 },
        { x: 13, y: 15 },
        { x: 13, y: 8 },
        { x: 15, y: 8 },
        { x: 15, y: 18 },
      ],
      true
    ),
    theme: t('#0a0c10', '#1c2838', '#2d4055', '#c0392b44', '#f1c40f33'),
  },
  {
    id: 'sunken_mire',
    name: 'Sunken Mire',
    description: 'Vertical zigzags with a flooded choke at mid-map.',
    gridCols: 14,
    gridRows: 22,
    cellSize: 30,
    spawnPoint: { x: 7, y: 0 },
    basePosition: { x: 7, y: 21 },
    route: chainWaypoints(
      [
        { x: 7, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 8 },
        { x: 11, y: 8 },
        { x: 11, y: 14 },
        { x: 4, y: 14 },
        { x: 4, y: 19 },
        { x: 12, y: 19 },
        { x: 12, y: 21 },
        { x: 7, y: 21 },
      ],
      false
    ),
    theme: t('#070d12', '#143028', '#1e4d42', '#16a08544', '#27ae6044'),
  },
  {
    id: 'obsidian_spiral',
    name: 'Obsidian Spiral',
    description: 'Spirals inward, then cuts outward — a long path that rewards smart coverage.',
    gridCols: 18,
    gridRows: 18,
    cellSize: 28,
    spawnPoint: { x: 0, y: 0 },
    basePosition: { x: 17, y: 17 },
    route: chainWaypoints(
      [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 14 },
        { x: 2, y: 14 },
        { x: 2, y: 3 },
        { x: 11, y: 3 },
        { x: 11, y: 11 },
        { x: 5, y: 11 },
        { x: 5, y: 7 },
        { x: 8, y: 7 },
        { x: 8, y: 17 },
        { x: 17, y: 17 },
      ],
      true
    ),
    theme: t('#050508', '#1a1528', '#342a55', '#9b59b655', '#e67e2244'),
  },
  {
    id: 'grave_circuit',
    name: 'Grave Circuit',
    description: 'Perimeter run with a cruel inward hook toward the base.',
    gridCols: 17,
    gridRows: 19,
    cellSize: 29,
    spawnPoint: { x: 0, y: 9 },
    basePosition: { x: 16, y: 9 },
    route: chainWaypoints(
      [
        { x: 0, y: 9 },
        { x: 0, y: 2 },
        { x: 14, y: 2 },
        { x: 14, y: 16 },
        { x: 3, y: 16 },
        { x: 3, y: 6 },
        { x: 11, y: 6 },
        { x: 11, y: 12 },
        { x: 16, y: 12 },
        { x: 16, y: 9 },
      ],
      true
    ),
    theme: t('#0b0e12', '#252032', '#4a3558', '#8e44ad55', '#c9a22744'),
  },
  {
    id: 'raven_choke',
    name: 'Raven Choke',
    description: 'Narrow crevasse segment — extreme choke then opens near base.',
    gridCols: 15,
    gridRows: 21,
    cellSize: 31,
    spawnPoint: { x: 7, y: 0 },
    basePosition: { x: 7, y: 20 },
    route: chainWaypoints(
      [
        { x: 7, y: 0 },
        { x: 7, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 6 },
        { x: 7, y: 6 },
        { x: 7, y: 14 },
        { x: 1, y: 14 },
        { x: 1, y: 17 },
        { x: 13, y: 17 },
        { x: 13, y: 20 },
        { x: 7, y: 20 },
      ],
      false
    ),
    theme: t('#080a0d', '#1e252e', '#354050', '#c0392b66', '#2980b955'),
  },
  {
    id: 'crypt_serpent',
    name: 'Crypt Serpent',
    description: 'Snake pattern — horizontal sweeps with sharp reversals.',
    gridCols: 16,
    gridRows: 22,
    cellSize: 29,
    spawnPoint: { x: 0, y: 11 },
    basePosition: { x: 15, y: 11 },
    route: chainWaypoints(
      [
        { x: 0, y: 11 },
        { x: 12, y: 11 },
        { x: 12, y: 4 },
        { x: 2, y: 4 },
        { x: 2, y: 18 },
        { x: 14, y: 18 },
        { x: 14, y: 7 },
        { x: 6, y: 7 },
        { x: 6, y: 15 },
        { x: 15, y: 15 },
        { x: 15, y: 11 },
      ],
      true
    ),
    theme: t('#060809', '#182018', '#2a382c', '#7f8c8d55', '#16a08544'),
  },
  {
    id: 'shadow_fen',
    name: 'Shadow Fen',
    description: 'Wide outer arc then pinches into a marsh bottleneck.',
    gridCols: 17,
    gridRows: 20,
    cellSize: 30,
    spawnPoint: { x: 8, y: 0 },
    basePosition: { x: 8, y: 19 },
    route: chainWaypoints(
      [
        { x: 8, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 12 },
        { x: 15, y: 12 },
        { x: 15, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 16 },
        { x: 12, y: 16 },
        { x: 12, y: 8 },
        { x: 8, y: 8 },
        { x: 8, y: 19 },
      ],
      true
    ),
    theme: t('#070b0f', '#1a2228', '#353842', '#cf2f2f44', '#1abc9c44'),
  },
  {
    id: 'void_switchback',
    name: 'Void Switchback',
    description: 'Tight hairpin turns on a long route — choke points at every reversal.',
    gridCols: 15,
    gridRows: 23,
    cellSize: 29,
    spawnPoint: { x: 0, y: 0 },
    basePosition: { x: 14, y: 22 },
    route: chainWaypoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 18 },
        { x: 2, y: 18 },
        { x: 2, y: 5 },
        { x: 12, y: 5 },
        { x: 12, y: 14 },
        { x: 5, y: 14 },
        { x: 5, y: 22 },
        { x: 14, y: 22 },
      ],
      true
    ),
    theme: t('#020308', '#12182a', '#242e48', '#9b59b666', '#bb8fce44'),
  },
  {
    id: 'iron_widow',
    name: 'Iron Widow',
    description: 'Industrial trench — long straights broken by sudden corners.',
    gridCols: 18,
    gridRows: 19,
    cellSize: 28,
    spawnPoint: { x: 0, y: 9 },
    basePosition: { x: 17, y: 9 },
    route: chainWaypoints(
      [
        { x: 0, y: 9 },
        { x: 13, y: 9 },
        { x: 13, y: 3 },
        { x: 4, y: 3 },
        { x: 4, y: 15 },
        { x: 16, y: 15 },
        { x: 16, y: 1 },
        { x: 8, y: 1 },
        { x: 8, y: 17 },
        { x: 17, y: 17 },
        { x: 17, y: 9 },
      ],
      true
    ),
    theme: t('#0a0a0c', '#222228', '#3d3d48', '#95a5a666', '#e74c3c44'),
  },
  {
    id: 'dusk_causeway',
    name: 'Dusk Causeway',
    description: 'Long straight runs and sharp turns across a raised causeway.',
    gridCols: 16,
    gridRows: 21,
    cellSize: 30,
    spawnPoint: { x: 0, y: 5 },
    basePosition: { x: 15, y: 16 },
    route: chainWaypoints(
      [
        { x: 0, y: 5 },
        { x: 11, y: 5 },
        { x: 11, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 10 },
        { x: 6, y: 10 },
        { x: 6, y: 18 },
        { x: 13, y: 18 },
        { x: 13, y: 12 },
        { x: 1, y: 12 },
        { x: 1, y: 16 },
        { x: 15, y: 16 },
      ],
      true
    ),
    theme: t('#090c11', '#1c222c', '#383642', '#f39c1244', '#cf2f2f55'),
  },
];

function validateMap(m: ArenaMapDefinition): void {
  if (m.route.length < 2) return;
  const a = m.route[0];
  const b = m.route[m.route.length - 1];
  if (a.x !== m.spawnPoint.x || a.y !== m.spawnPoint.y) {
    throw new Error(`Arena ${m.id}: route start !== spawn`);
  }
  if (b.x !== m.basePosition.x || b.y !== m.basePosition.y) {
    throw new Error(`Arena ${m.id}: route end !== base`);
  }
  for (let i = 1; i < m.route.length; i++) {
    const p = m.route[i - 1];
    const q = m.route[i];
    const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    if (d !== 1) {
      throw new Error(`Arena ${m.id}: non-adjacent step at ${i}`);
    }
    if (q.x < 0 || q.x >= m.gridCols || q.y < 0 || q.y >= m.gridRows) {
      throw new Error(`Arena ${m.id}: out of bounds at ${i}`);
    }
  }
}

for (const m of ARENAS) {
  validateMap(m);
}

const ARENA_BY_ID: Record<string, ArenaMapDefinition> = {};
for (const m of ARENAS) {
  ARENA_BY_ID[m.id] = m;
}

export const ARENA_MAP_LIST = ARENAS;

export const DEFAULT_ARENA_ID = ARENAS[0].id;

export function getArenaMap(id: string | null | undefined): ArenaMapDefinition | undefined {
  if (!id) return undefined;
  return ARENA_BY_ID[id];
}
