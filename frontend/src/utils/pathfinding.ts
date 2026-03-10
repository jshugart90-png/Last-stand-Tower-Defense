// A* Pathfinding Algorithm for dynamic path calculation
export interface Position {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic (estimated cost to end)
  f: number; // Total cost (g + h)
  parent: Node | null;
}

// Manhattan distance heuristic
const heuristic = (a: Position, b: Position): number => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

// Get neighbors (4-directional movement)
const getNeighbors = (
  node: Node,
  gridCols: number,
  gridRows: number,
  blockedCells: Set<string>
): Position[] => {
  const neighbors: Position[] = [];
  const directions = [
    { x: 0, y: -1 }, // Up
    { x: 0, y: 1 },  // Down
    { x: -1, y: 0 }, // Left
    { x: 1, y: 0 },  // Right
  ];

  for (const dir of directions) {
    const newX = node.x + dir.x;
    const newY = node.y + dir.y;
    const key = `${newX},${newY}`;

    // Check bounds
    if (newX < 0 || newX >= gridCols || newY < 0 || newY >= gridRows) {
      continue;
    }

    // Check if blocked by tower
    if (blockedCells.has(key)) {
      continue;
    }

    neighbors.push({ x: newX, y: newY });
  }

  return neighbors;
};

// A* Algorithm
export const findPath = (
  start: Position,
  end: Position,
  gridCols: number,
  gridRows: number,
  blockedCells: Set<string>
): Position[] | null => {
  const openList: Node[] = [];
  const closedSet = new Set<string>();

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openList.push(startNode);

  while (openList.length > 0) {
    // Find node with lowest f cost
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    const currentKey = `${current.x},${current.y}`;

    // Check if we reached the end
    if (current.x === end.x && current.y === end.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(currentKey);

    // Check neighbors
    const neighbors = getNeighbors(current, gridCols, gridRows, blockedCells);
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;

      if (closedSet.has(neighborKey)) {
        continue;
      }

      const g = current.g + 1;
      const h = heuristic(neighbor, end);
      const f = g + h;

      // Check if neighbor is already in open list with better score
      const existingNode = openList.find(
        (n) => n.x === neighbor.x && n.y === neighbor.y
      );

      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      } else {
        openList.push({
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f,
          parent: current,
        });
      }
    }
  }

  // No path found
  return null;
};

// Check if placing a tower at position would block all paths
export const wouldBlockPath = (
  towerPosition: Position,
  spawnPoint: Position,
  basePosition: Position,
  gridCols: number,
  gridRows: number,
  existingTowers: Position[]
): boolean => {
  // Create blocked cells set including the new tower
  const blockedCells = new Set<string>();
  for (const tower of existingTowers) {
    blockedCells.add(`${tower.x},${tower.y}`);
  }
  blockedCells.add(`${towerPosition.x},${towerPosition.y}`);

  // Try to find a path
  const path = findPath(spawnPoint, basePosition, gridCols, gridRows, blockedCells);
  return path === null;
};
