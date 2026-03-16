import React, { memo } from 'react';
import { Polygon, G, Text as SvgText, Circle, Line, Rect, Image as SvgImage } from 'react-native-svg';
import { GameHex, Faction } from '@/lib/game/types';
import { getHexCorners, hexToPixel } from '@/lib/game/hexUtils';
import { HEX_SIZE, TERRITORY_COLORS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

const UNIT_SPRITES: Record<string, any> = {
  coalition_0: require('@/assets/sprites/coalition_1.png'),
  coalition_1: require('@/assets/sprites/coalition_2.png'),
  coalition_2: require('@/assets/sprites/coalition_3.png'),
  coalition_3: require('@/assets/sprites/coalition_4.png'),
  insurgents_0: require('@/assets/sprites/insurgent_1_new.png'),
  insurgents_1: require('@/assets/sprites/insurgent_2_new.png'),
  insurgents_2: require('@/assets/sprites/insurgent_3_new.png'),
  insurgents_3: require('@/assets/sprites/insurgent_4_new.png'),
};

const NOMAD_CAMP_SPRITE = require('@/assets/sprites/nomad_camp.png');

const TOWER_SPRITES: Record<string, any> = {
  coalition: require('@/assets/sprites/tower_army.png'),
  insurgents: require('@/assets/sprites/tower_insurgent.png'),
};

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
  const spriteSize = s * 1.3;

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
          x={x - spriteSize * 0.5}
          y={y - spriteSize * 0.55}
          width={spriteSize}
          height={spriteSize}
        />
      )}
      {hex.hasCastle && hex.unitTier === null && faction && (
        <SvgImage
          href={TOWER_SPRITES[faction]}
          x={x - spriteSize * 0.5}
          y={y - spriteSize * 0.55}
          width={spriteSize}
          height={spriteSize}
        />
      )}
      {hex.hasCapital && hex.unitTier === null && !hex.hasCastle && (
        <G>
          <Rect
            x={x - s * 0.25}
            y={y - s * 0.05}
            width={s * 0.5}
            height={s * 0.35}
            fill="#B8860B"
            rx={1}
          />
          <Polygon
            points={`${x - s * 0.3},${y - s * 0.05} ${x},${y - s * 0.3} ${x + s * 0.3},${y - s * 0.05}`}
            fill="#D4A020"
          />
          <Rect
            x={x - s * 0.06}
            y={y + s * 0.05}
            width={s * 0.12}
            height={s * 0.22}
            fill="#7A5A0A"
          />
        </G>
      )}
      {hex.unitTier !== null && faction && (
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
              r={spriteSize * 0.4}
              fill="rgba(0,0,0,0.35)"
            />
          )}
          <SvgImage
            href={UNIT_SPRITES[`${faction}_${hex.unitTier}`]}
            x={x - spriteSize * 0.5}
            y={y - spriteSize * 0.55}
            width={spriteSize}
            height={spriteSize}
            opacity={hex.unitMoved ? 0.5 : 1}
          />
        </G>
      )}
    </G>
  );
}

export default memo(HexTileComponent);
