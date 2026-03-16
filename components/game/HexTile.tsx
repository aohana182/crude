import React, { memo } from 'react';
import { Polygon, G, Text as SvgText, Circle, Line, Rect, Image as SvgImage, Defs, ClipPath } from 'react-native-svg';
import { GameHex, Faction } from '@/lib/game/types';
import { getHexCorners, hexToPixel } from '@/lib/game/hexUtils';
import { HEX_SIZE, TERRITORY_COLORS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

// Single sprite sheet: 4 columns (tiers 1-4) × 2 rows (coalition top, insurgents bottom)
const UNITS_SPRITE = require('@/assets/sprites/units.png');

// [col, row] coordinates within the 4×2 grid
const UNIT_GRID: Record<string, [number, number]> = {
  coalition_0:  [0, 0],
  coalition_1:  [1, 0],
  coalition_2:  [2, 0],
  coalition_3:  [3, 0],
  insurgents_0: [0, 1],
  insurgents_1: [1, 1],
  insurgents_2: [2, 1],
  insurgents_3: [3, 1],
};

const NOMAD_CAMP_SPRITE = require('@/assets/sprites/nomad_camp.png');

const CAPITAL_SPRITES: Record<string, any> = {
  coalition: require('@/assets/sprites/coalition_capital.png'),
  insurgents: require('@/assets/sprites/insurgent_capital.png'),
};

const TOWER_SPRITES: Record<string, any> = {
  coalition: require('@/assets/sprites/tower_army.png'),
  insurgents: require('@/assets/sprites/tower_insurgent.png'),
};

const NEUTRAL_CASTLE_SPRITE = require('@/assets/sprites/neutral castle.png');

interface HexTileProps {
  hex: GameHex;
  isSelected: boolean;
  isPurchaseTarget: boolean;
  targetType: 'move' | 'merge' | 'attack' | null;
  factions: Faction[];
  currentPlayer: number;
}

function HexTileComponent({ hex, isSelected, isPurchaseTarget, targetType, factions, currentPlayer }: HexTileProps) {
  const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
  const points = getHexCorners(x, y, HEX_SIZE - 1);

  let fillColor = hex.owner === null ? '#8B7355' : Colors.hex.water;
  let strokeColor = hex.owner === null ? '#6B5335' : Colors.hex.waterBorder;
  let strokeWidth = 0.5;

  if (hex.owner !== null) {
    const colorSet = TERRITORY_COLORS[hex.owner % TERRITORY_COLORS.length];
    fillColor = colorSet[1];
    strokeColor = colorSet[0];
    strokeWidth = 1;
  }

  if (targetType === 'move') {
    fillColor = hex.owner !== null ? TERRITORY_COLORS[hex.owner % TERRITORY_COLORS.length][2] : fillColor;
    strokeColor = '#4CAF50';
    strokeWidth = 1.5;
  } else if (targetType === 'merge') {
    fillColor = hex.owner !== null ? TERRITORY_COLORS[hex.owner % TERRITORY_COLORS.length][2] : fillColor;
    strokeColor = '#D4A020';
    strokeWidth = 2;
  } else if (targetType === 'attack') {
    strokeColor = '#FF4444';
    strokeWidth = 2;
  }

  if (isSelected) {
    strokeColor = '#D4A020';
    strokeWidth = 3;
  }

  if (isPurchaseTarget) {
    fillColor = hex.owner !== null ? TERRITORY_COLORS[hex.owner % TERRITORY_COLORS.length][2] : fillColor;
    strokeColor = '#D4A020';
    strokeWidth = 1.5;
  }

  const s = HEX_SIZE;
  const faction = hex.owner !== null ? factions[hex.owner] : null;

  // Buildings fill their PNG edge-to-edge — keep within hex inradius (s * √3/2 ≈ s * 0.866)
  const buildingSize = s * 1.65;
  // Unit cells have internal padding — actual character is ~70% of cell, so slightly larger is fine
  const unitSize = s * 1.55;

  // Shared vertical centering offset (slightly above hex center looks natural)
  const vOffset = 0.45;

  return (
    <G>
      <Polygon
        points={points}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
      {targetType === 'merge' && (
        <Circle
          cx={x}
          cy={y}
          r={HEX_SIZE * 0.15}
          fill="#D4A020"
          opacity={0.6}
        />
      )}
      {targetType === 'attack' && (
        <Circle
          cx={x}
          cy={y}
          r={HEX_SIZE * 0.12}
          fill="#FF4444"
          opacity={0.5}
        />
      )}
      {hex.hasGrave && hex.unitTier === null && (
        <G>
          <Line
            x1={x}
            y1={y + s * 0.2}
            x2={x}
            y2={y - s * 0.15}
            stroke="#888"
            strokeWidth={2}
          />
          <Line
            x1={x - s * 0.15}
            y1={y - s * 0.02}
            x2={x + s * 0.15}
            y2={y - s * 0.02}
            stroke="#888"
            strokeWidth={2}
          />
        </G>
      )}
      {hex.hasNomad && hex.unitTier === null && !hex.hasGrave && (
        <SvgImage
          href={NOMAD_CAMP_SPRITE}
          x={x - buildingSize * 0.5}
          y={y - buildingSize * vOffset}
          width={buildingSize}
          height={buildingSize}
        />
      )}
      {hex.hasCastle && hex.unitTier === null && (
        <SvgImage
          href={faction ? TOWER_SPRITES[faction] : NEUTRAL_CASTLE_SPRITE}
          x={x - buildingSize * 0.5}
          y={y - buildingSize * vOffset}
          width={buildingSize}
          height={buildingSize}
        />
      )}
      {hex.hasCapital && hex.unitTier === null && !hex.hasCastle && faction && (
        <SvgImage
          href={CAPITAL_SPRITES[faction]}
          x={x - buildingSize * 0.5}
          y={y - buildingSize * vOffset}
          width={buildingSize}
          height={buildingSize}
        />
      )}
      {hex.unitTier !== null && faction && (() => {
        const spriteKey = `${faction}_${hex.unitTier}`;
        const [col, row] = UNIT_GRID[spriteKey] ?? [0, 0];
        const clipId = `uc_${hex.q}_${hex.r}`;
        const imgX = x - unitSize * 0.5;
        const imgY = y - unitSize * vOffset;
        return (
          <G>
            {isSelected && (
              <Circle
                cx={x}
                cy={y}
                r={HEX_SIZE * 0.52}
                fill="none"
                stroke="#D4A020"
                strokeWidth={2}
                opacity={0.8}
              />
            )}
            {hex.unitMoved && (
              <Circle
                cx={x}
                cy={y}
                r={unitSize * 0.4}
                fill="rgba(0,0,0,0.35)"
              />
            )}
            <Defs>
              <ClipPath id={clipId}>
                <Rect x={imgX} y={imgY} width={unitSize} height={unitSize} />
              </ClipPath>
            </Defs>
            <SvgImage
              href={UNITS_SPRITE}
              x={imgX - col * unitSize}
              y={imgY - row * unitSize}
              width={unitSize * 4}
              height={unitSize * 2}
              clipPath={`url(#${clipId})`}
              opacity={hex.unitMoved ? 0.5 : 1}
            />
          </G>
        );
      })()}
    </G>
  );
}

export default memo(HexTileComponent);
