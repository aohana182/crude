import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Faction } from '@/lib/game/types';

interface UnitIconProps {
  tier: number;
  faction: Faction;
  size?: number;
  color?: string;
}

const US_ICONS: { name: string; set: 'mci' | 'fa5' | 'ion' }[] = [
  { name: 'account', set: 'mci' },
  { name: 'shield-account', set: 'mci' },
  { name: 'medal', set: 'fa5' },
  { name: 'star', set: 'fa5' },
];

const INSURGENTS_ICONS: { name: string; set: 'mci' | 'fa5' | 'ion' }[] = [
  { name: 'sword', set: 'mci' },
  { name: 'sword-cross', set: 'mci' },
  { name: 'shield-sword', set: 'mci' },
  { name: 'crown', set: 'mci' },
];

export default function UnitIcon({ tier, faction, size = 16, color = '#fff' }: UnitIconProps) {
  const icons = faction === 'coalition' ? US_ICONS : INSURGENTS_ICONS;
  const icon = icons[tier] || icons[0];

  if (icon.set === 'mci') {
    return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  }
  if (icon.set === 'fa5') {
    return <FontAwesome5 name={icon.name as any} size={size * 0.85} color={color} />;
  }
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}
