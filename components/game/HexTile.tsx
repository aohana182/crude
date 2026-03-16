import React, { memo } from 'react';
import { Polygon, G, Circle, Line } from 'react-native-svg';
import { GameHex } from '@/lib/game/types';
import { getHexCorners, hexToPixel } from '@/lib/game/hexUtils';
import { HEX_SIZE, TERRITORY_COLORS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

interface HexTileProps {
  hex: GameHex;
  isSelected: boolean;
  isPurchaseTarget: boolean;
  targetType: 'move' | 'merge' | 'attack' | null;
}

function HexTileComponent({ hex, isSelected, isPurchaseTarget, targetType }: HexTileProps) {
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
    </G>
  );
}

export default memo(HexTileComponent);
