import React, { useMemo, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import Svg from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GameState, hexKey, Faction } from '@/lib/game/types';
import { hexToPixel, pixelToHex, getNeighbors } from '@/lib/game/hexUtils';
import { HEX_SIZE, UNIT_STRENGTH } from '@/lib/game/constants';
import { getHexDefenseStrength, isInSameTerritory } from '@/lib/game/territoryManager';
import HexTile from './HexTile';
import Colors from '@/constants/colors';

interface HexGridProps {
  gameState: GameState;
  onHexPress: (q: number, r: number) => void;
}

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 3.0;
const IS_WEB = Platform.OS === 'web';

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function HexGrid({ gameState, onHexPress }: HexGridProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const svgWidth = screenWidth - 8;
  const svgHeight = Math.max(screenHeight * 0.55, 400);
  const vpAspect = svgWidth / svgHeight;

  const baseViewBox = useMemo(() => {
    const allHexes = Array.from(gameState.hexes.values());
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const hex of allHexes) {
      const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
      minX = Math.min(minX, x - HEX_SIZE);
      maxX = Math.max(maxX, x + HEX_SIZE);
      minY = Math.min(minY, y - HEX_SIZE);
      maxY = Math.max(maxY, y + HEX_SIZE);
    }

    const padding = HEX_SIZE * 1.5;
    const rawW = maxX - minX + padding * 2;
    const rawH = maxY - minY + padding * 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let w = rawW;
    let h = rawH;
    if (w / h > vpAspect) {
      h = w / vpAspect;
    } else {
      w = h * vpAspect;
    }

    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [gameState.hexes, vpAspect]);

  const hexArray = useMemo(() => Array.from(gameState.hexes.values()), [gameState.hexes]);
  const factions = useMemo(() => gameState.players.map(p => p.faction) as Faction[], [gameState.players]);

  const [vb, setVb] = useState<ViewBox>(baseViewBox);
  const vbRef = useRef<ViewBox>(vb);
  vbRef.current = vb;

  const hexesRef = useRef(gameState.hexes);
  hexesRef.current = gameState.hexes;
  const onHexPressRef = useRef(onHexPress);
  onHexPressRef.current = onHexPress;

  const clampVb = useCallback((newVb: ViewBox): ViewBox => {
    if (isNaN(newVb.x) || isNaN(newVb.y) || isNaN(newVb.w) || isNaN(newVb.h) ||
        !isFinite(newVb.x) || !isFinite(newVb.y) || !isFinite(newVb.w) || !isFinite(newVb.h)) {
      return vbRef.current;
    }
    const minW = baseViewBox.w / ZOOM_MAX;
    const maxW = baseViewBox.w / ZOOM_MIN;
    const w = Math.min(Math.max(newVb.w, minW), maxW);
    const h = w / vpAspect;

    const maxPanX = Math.max(0, (baseViewBox.w - w) / 2);
    const maxPanY = Math.max(0, (baseViewBox.h - h) / 2);
    const cx = newVb.x + newVb.w / 2;
    const cy = newVb.y + newVb.h / 2;
    const baseCx = baseViewBox.x + baseViewBox.w / 2;
    const baseCy = baseViewBox.y + baseViewBox.h / 2;

    const clampedCx = Math.min(Math.max(cx, baseCx - maxPanX), baseCx + maxPanX);
    const clampedCy = Math.min(Math.max(cy, baseCy - maxPanY), baseCy + maxPanY);

    return { x: clampedCx - w / 2, y: clampedCy - h / 2, w, h };
  }, [baseViewBox, vpAspect]);

  const clampVbRef = useRef(clampVb);
  clampVbRef.current = clampVb;

  const viewportToSvg = useCallback((localX: number, localY: number) => {
    const curVb = vbRef.current;
    const scale = Math.min(svgWidth / curVb.w, svgHeight / curVb.h);
    const offsetX = (svgWidth - curVb.w * scale) / 2;
    const offsetY = (svgHeight - curVb.h * scale) / 2;
    return {
      x: curVb.x + (localX - offsetX) / scale,
      y: curVb.y + (localY - offsetY) / scale,
    };
  }, [svgWidth, svgHeight]);

  const viewportToSvgRef = useRef(viewportToSvg);
  viewportToSvgRef.current = viewportToSvg;

  const savedVb = useRef<ViewBox>(vb);
  const pinchFocusSvg = useRef({ x: 0, y: 0 });

  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDuration(300)
      .maxDistance(15)
      .runOnJS(true)
      .onEnd((e) => {
        const svgCoord = viewportToSvgRef.current(e.x, e.y);
        const hex = pixelToHex(svgCoord.x, svgCoord.y);
        const key = hexKey(hex.q, hex.r);
        console.log(`[HEX TAP] local=(${e.x.toFixed(1)},${e.y.toFixed(1)}) svg=(${svgCoord.x.toFixed(1)},${svgCoord.y.toFixed(1)}) hex=(${hex.q},${hex.r}) exists=${hexesRef.current.has(key)}`);
        if (hexesRef.current.has(key)) {
          onHexPressRef.current(hex.q, hex.r);
        }
      }),
    []
  );

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .minDistance(10)
      .maxPointers(1)
      .runOnJS(true)
      .onStart(() => {
        savedVb.current = { ...vbRef.current };
      })
      .onUpdate((e) => {
        const cur = savedVb.current;
        const scale = Math.min(svgWidth / cur.w, svgHeight / cur.h);
        if (scale <= 0) return;
        const newX = cur.x - e.translationX / scale;
        const newY = cur.y - e.translationY / scale;
        setVb(clampVbRef.current({ x: newX, y: newY, w: cur.w, h: cur.h }));
      }),
    [svgWidth, svgHeight]
  );

  const pinchGesture = useMemo(() =>
    Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        savedVb.current = { ...vbRef.current };
        const fx = typeof e.focalX === 'number' && isFinite(e.focalX) ? e.focalX : svgWidth / 2;
        const fy = typeof e.focalY === 'number' && isFinite(e.focalY) ? e.focalY : svgHeight / 2;
        pinchFocusSvg.current = viewportToSvgRef.current(fx, fy);
      })
      .onUpdate((e) => {
        if (!e.scale || e.scale <= 0 || !isFinite(e.scale)) return;
        const cur = savedVb.current;
        const zoomRatio = 1 / e.scale;
        const newW = cur.w * zoomRatio;
        const newH = newW / vpAspect;

        const fx = pinchFocusSvg.current.x;
        const fy = pinchFocusSvg.current.y;
        if (cur.w <= 0 || cur.h <= 0) return;
        const fracX = (fx - cur.x) / cur.w;
        const fracY = (fy - cur.y) / cur.h;
        const newX = fx - fracX * newW;
        const newY = fy - fracY * newH;

        setVb(clampVbRef.current({ x: newX, y: newY, w: newW, h: newH }));
      }),
    [vpAspect, svgWidth, svgHeight]
  );

  const composed = useMemo(() =>
    Gesture.Simultaneous(
      pinchGesture,
      Gesture.Race(tapGesture, panGesture)
    ),
    [tapGesture, panGesture, pinchGesture]
  );

  const handleWebWheel = useCallback((e: any) => {
    e.preventDefault?.();
    const delta = e.nativeEvent?.deltaY ?? e.deltaY ?? 0;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const curVb = vbRef.current;

    const ne = e.nativeEvent || e;
    const localX = ne.offsetX ?? ne.locationX ?? svgWidth / 2;
    const localY = ne.offsetY ?? ne.locationY ?? svgHeight / 2;
    const focus = viewportToSvgRef.current(localX, localY);

    const newW = curVb.w * zoomFactor;
    const newH = newW / vpAspect;
    const fracX = (focus.x - curVb.x) / curVb.w;
    const fracY = (focus.y - curVb.y) / curVb.h;
    const newX = focus.x - fracX * newW;
    const newY = focus.y - fracY * newH;

    setVb(clampVbRef.current({ x: newX, y: newY, w: newW, h: newH }));
  }, [vpAspect, svgWidth, svgHeight]);

  const resetView = useCallback(() => {
    setVb(baseViewBox);
  }, [baseViewBox]);

  const viewBoxStr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  const selectedKey = gameState.selectedHex
    ? hexKey(gameState.selectedHex.q, gameState.selectedHex.r)
    : null;

  const validTargetKeys = useMemo(() => {
    const targets = new Map<string, 'move' | 'merge' | 'attack'>();
    if (!gameState.selectedHex) return targets;

    const selHex = gameState.hexes.get(hexKey(gameState.selectedHex.q, gameState.selectedHex.r));
    if (!selHex || selHex.unitTier === null || selHex.owner !== gameState.currentPlayer) return targets;

    const unitStrength = UNIT_STRENGTH[selHex.unitTier];
    const canAct = !selHex.unitMoved;

    for (const [key, hex] of gameState.hexes) {
      if (key === selectedKey) continue;

      if (hex.owner === gameState.currentPlayer) {
        const sameTerritory = isInSameTerritory(
          gameState.selectedHex.q, gameState.selectedHex.r,
          hex.q, hex.r, gameState.territories,
        );
        if (!sameTerritory) continue;

        if (hex.unitTier !== null && gameState.combineMode) {
          const combinedStrength = UNIT_STRENGTH[selHex.unitTier] + UNIT_STRENGTH[hex.unitTier];
          let newTier = -1;
          for (let i = 0; i < UNIT_STRENGTH.length; i++) {
            if (UNIT_STRENGTH[i] === combinedStrength) {
              newTier = i;
              break;
            }
          }
          if (newTier !== -1 && newTier <= 3) {
            targets.set(key, 'merge');
          }
        } else if (hex.unitTier === null && !hex.hasCastle) {
          targets.set(key, 'move');
        }
      } else if (canAct) {
        const isNeighbor = getNeighbors(gameState.selectedHex.q, gameState.selectedHex.r)
          .some(n => n.q === hex.q && n.r === hex.r);
        if (!isNeighbor) continue;

        if (hex.owner === null) {
          targets.set(key, 'attack');
        } else {
          const defense = getHexDefenseStrength(hex.q, hex.r, gameState.hexes);
          if (unitStrength > defense) {
            targets.set(key, 'attack');
          }
        }
      }
    }

    return targets;
  }, [gameState.selectedHex, gameState.hexes, gameState.currentPlayer, gameState.territories, selectedKey, gameState.combineMode]);

  const purchaseTargetKeys = useMemo(() => {
    if (gameState.purchaseType === null) return new Set<string>();
    const targets = new Set<string>();
    for (const hex of gameState.hexes.values()) {
      if (hex.owner === gameState.currentPlayer && hex.unitTier === null && !hex.hasCapital && !hex.hasCastle) {
        targets.add(hexKey(hex.q, hex.r));
      }
    }
    return targets;
  }, [gameState.purchaseType, gameState.hexes, gameState.currentPlayer]);

  const webWheelProps: any = IS_WEB ? { onWheel: handleWebWheel } : {};

  return (
    <View style={[styles.container, { width: svgWidth, height: svgHeight }]} {...webWheelProps}>
      <GestureDetector gesture={composed}>
        <Animated.View style={StyleSheet.absoluteFillObject} collapsable={false}>
          <Svg
            width={svgWidth}
            height={svgHeight}
            viewBox={viewBoxStr}
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
          >
            {hexArray.map((hex) => {
              const key = hexKey(hex.q, hex.r);
              const targetType = validTargetKeys.get(key) || null;
              return (
                <HexTile
                  key={key}
                  hex={hex}
                  isSelected={key === selectedKey}
                  isPurchaseTarget={purchaseTargetKeys.has(key)}
                  targetType={targetType}
                  factions={factions}
                  currentPlayer={gameState.currentPlayer}
                />
              );
            })}
          </Svg>
        </Animated.View>
      </GestureDetector>

      <Pressable
        style={({ pressed }) => [styles.resetButton, pressed && { opacity: 0.7 }]}
        onPress={resetView}
      >
        <MaterialCommunityIcons name="crosshairs-gps" size={18} color={Colors.text.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.hex.water,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resetButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184,134,11,0.3)',
    zIndex: 10,
  },
});
