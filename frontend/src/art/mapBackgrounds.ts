import type { ImageSourcePropType } from 'react-native';

/**
 * Metro collects every jpg in assets/art/maps at bundle time.
 * A fixed-path map paints the whole board when `<mapId>.jpg` is present.
 * Free Play (`classic`) and any map without a file stay on the tile renderer.
 */
type MapContext = {
  keys(): string[];
  (id: string): ImageSourcePropType;
};

declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): MapContext;
};

const mapContext: MapContext = require.context('../../assets/art/maps', false, /\.jpg$/);

const byId = new Map<string, ImageSourcePropType>();
for (const key of mapContext.keys()) {
  const id = key.replace(/^\.\//, '').replace(/\.jpg$/i, '');
  if (id) byId.set(id, mapContext(key));
}

export function mapBackgroundFor(mapId: string): ImageSourcePropType | null {
  return byId.get(mapId) ?? null;
}
