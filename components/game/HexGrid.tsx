import React, { useMemo, useCallback, useState, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GameState, hexKey, Faction } from '@/lib/game/types';
import { pixelToHex, getNeighbors } from '@/lib/game/hexUtils';
import { HEX_SIZE, UNIT_STRENGTH, getTierForCombinedStrength, PEASANT_COST, CASTLE_COST } from '@/lib/game/constants';
import { getHexDefenseStrength, buildHexTerritoryMap } from '@/lib/game/territoryManager';
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
    const { minX, maxX, minY, maxY } = gameState.mapBounds;
    const padding = HEX_SIZE * 1.5;
    const rawW = (maxX - minX) + HEX_SIZE * 2 + padding * 2;
    const rawH = (maxY - minY) + HEX_SIZE * 2 + padding * 2;
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
  }, [gameState.mapBounds, vpAspect]);

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

  const hexTerritoryMap = useMemo(
    () => buildHexTerritoryMap(gameState.territories),
    [gameState.territories],
  );

  const validTargetKeys = useMemo(() => {
    const targets = new Map<string, 'move' | 'merge' | 'attack'>();
    if (!gameState.selectedHex) return targets;

    const selKey2 = hexKey(gameState.selectedHex.q, gameState.selectedHex.r);
    const selHex = gameState.hexes.get(selKey2);
    if (!selHex || selHex.unitTier === null || selHex.owner !== gameState.currentPlayer) return targets;
    if (selHex.unitMoved) return targets;

    const selTerritoryId = hexTerritoryMap.get(selKey2);
    const unitStrength = UNIT_STRENGTH[selHex.unitTier];

    // Free jump: any hex in the same connected territory is a valid move/merge target
    for (const [key, hex] of gameState.hexes) {
      if (key === selKey2) continue;
      if (hex.owner !== gameState.currentPlayer) continue;
      if (hexTerritoryMap.get(key) !== selTerritoryId) continue;

      if (hex.unitTier !== null && gameState.combineMode) {
        const newTier = getTierForCombinedStrength(selHex.unitTier, hex.unitTier);
        if (newTier !== -1 && newTier <= 3) targets.set(key, 'merge');
      } else if (hex.unitTier === null && !hex.hasCastle) {
        targets.set(key, 'move');
      }
    }

    // Attacks and neutral captures: adjacent neighbors only
    for (const n of getNeighbors(gameState.selectedHex.q, gameState.selectedHex.r)) {
      const key = hexKey(n.q, n.r);
      const hex = gameState.hexes.get(key);
      if (!hex || hex.owner === gameState.currentPlayer) continue;

      if (hex.owner === null) {
        targets.set(key, 'attack');
      } else {
        const defense = getHexDefenseStrength(hex.q, hex.r, gameState.hexes, hexTerritoryMap);
        // strict < so equal strength resolves to attacker win (classic Slay)
        if (unitStrength >= defense) targets.set(key, 'attack');
      }
    }

    return targets;
  }, [gameState.selectedHex, gameState.hexes, gameState.currentPlayer, hexTerritoryMap, gameState.combineMode]);

  const purchaseTargetKeys = useMemo(() => {
    if (gameState.purchaseType === null) return new Set<string>();
    const cost = gameState.purchaseType === 'peasant' ? PEASANT_COST : CASTLE_COST;
    // Only highlight hexes in territories that can actually afford the purchase.
    // Without this filter, tapping a hex in a broke territory silently cancels.
    const affordableHexKeys = new Set<string>(
      gameState.territories
        .filter(t => t.owner === gameState.currentPlayer && t.treasury >= cost)
        .flatMap(t => t.hexes.map(h => hexKey(h.q, h.r)))
    );
    const targets = new Set<string>();
    for (const hex of gameState.hexes.values()) {
      if (hex.owner === gameState.currentPlayer && hex.unitTier === null && !hex.hasCapital && !hex.hasCastle) {
        const k = hexKey(hex.q, hex.r);
        if (affordableHexKeys.has(k)) targets.add(k);
      }
    }
    return targets;
  }, [gameState.purchaseType, gameState.hexes, gameState.currentPlayer, gameState.territories]);

  const webWheelProps: any = IS_WEB ? { onWheel: handleWebWheel } : {};

  return (
    <View style={[styles.container, { width: svgWidth, height: svgHeight }]} {...webWheelProps}>
      <GestureDetector gesture={composed}>
        <View style={StyleSheet.absoluteFillObject} collapsable={false}>
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
        </View>
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
