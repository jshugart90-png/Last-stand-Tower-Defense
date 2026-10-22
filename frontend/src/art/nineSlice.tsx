import { useState, type ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { uiArt } from './sprites';

/** Pixel size of frontend/assets/art/ui/panel.png */
const SOURCE_W = 768;
const SOURCE_H = 403;
/** Ornate frame, in source pixels. Corners stay fixed; the middle stretches. */
const SOURCE_CAP_X = 64;
const SOURCE_CAP_Y = 52;

type Slice = {
  clip: ViewStyle;
  img: { width: number; height: number; left: number; top: number };
};

function slicesFor(width: number, height: number, cap: number): Slice[] {
  const capX = Math.min(SOURCE_CAP_X, SOURCE_W / 2 - 1);
  const capY = Math.min(SOURCE_CAP_Y, SOURCE_H / 2 - 1);
  const midSrcW = SOURCE_W - capX * 2;
  const midSrcH = SOURCE_H - capY * 2;
  const midW = Math.max(0, width - cap * 2);
  const midH = Math.max(0, height - cap * 2);
  const scaleX = midSrcW > 0 ? midW / midSrcW : 1;
  const scaleY = midSrcH > 0 ? midH / midSrcH : 1;
  const cornerScaleX = cap / capX;
  const cornerScaleY = cap / capY;

  const corner = (sx: number, sy: number, left: number, top: number): Slice => ({
    clip: { position: 'absolute', left, top, width: cap, height: cap, overflow: 'hidden' },
    img: {
      width: SOURCE_W * cornerScaleX,
      height: SOURCE_H * cornerScaleY,
      left: -sx * cornerScaleX,
      top: -sy * cornerScaleY,
    },
  });

  const edgeX = (sy: number, top: number): Slice => ({
    clip: {
      position: 'absolute',
      left: cap,
      top,
      width: midW,
      height: cap,
      overflow: 'hidden',
    },
    img: {
      width: SOURCE_W * scaleX,
      height: SOURCE_H * cornerScaleY,
      left: -capX * scaleX,
      top: -sy * cornerScaleY,
    },
  });

  const edgeY = (sx: number, left: number): Slice => ({
    clip: {
      position: 'absolute',
      left,
      top: cap,
      width: cap,
      height: midH,
      overflow: 'hidden',
    },
    img: {
      width: SOURCE_W * cornerScaleX,
      height: SOURCE_H * scaleY,
      left: -sx * cornerScaleX,
      top: -capY * scaleY,
    },
  });

  return [
    corner(0, 0, 0, 0),
    edgeX(0, 0),
    corner(SOURCE_W - capX, 0, width - cap, 0),
    edgeY(0, 0),
    {
      clip: {
        position: 'absolute',
        left: cap,
        top: cap,
        width: midW,
        height: midH,
        overflow: 'hidden',
      },
      img: {
        width: SOURCE_W * scaleX,
        height: SOURCE_H * scaleY,
        left: -capX * scaleX,
        top: -capY * scaleY,
      },
    },
    edgeY(SOURCE_W - capX, width - cap),
    corner(0, SOURCE_H - capY, 0, height - cap),
    edgeX(SOURCE_H - capY, height - cap),
    corner(SOURCE_W - capX, SOURCE_H - capY, width - cap, height - cap),
  ];
}

function WoodFrame({ source, cap }: { source: ImageSourcePropType; cap: number }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const fitted = Math.max(0, Math.min(cap, Math.floor(Math.min(box.w, box.h) / 2)));
  const ready = box.w > 1 && box.h > 1 && fitted > 0;
  const slices = ready ? slicesFor(box.w, box.h, fitted) : [];

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {slices.map((slice, index) => (
        <View key={index} style={slice.clip}>
          <Image source={source} resizeMode="stretch" style={{ position: 'absolute', ...slice.img }} />
        </View>
      ))}
    </View>
  );
}

/** Wood panel that keeps its carved corners instead of stretching the whole texture. */
export function WoodPanel({
  children,
  style,
  cap = 16,
  source = uiArt.panel,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner size on screen, in pixels. Shrinks if the panel is smaller. */
  cap?: number;
  source?: ImageSourcePropType;
}) {
  return (
    <View style={[styles.panel, style]}>
      <WoodFrame source={source} cap={cap} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'relative',
    overflow: 'hidden',
  },
});
