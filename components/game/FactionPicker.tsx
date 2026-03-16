import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Faction } from '@/lib/game/types';
import { FACTIONS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

interface FactionPickerProps {
  onSelect: (faction: Faction) => void;
}

export default function FactionPicker({ onSelect }: FactionPickerProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          styles.usCard,
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
        onPress={() => onSelect('coalition')}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="shield-star" size={48} color="#4A90D9" />
        </View>
        <Text style={[styles.factionName, { color: '#4A90D9' }]}>COALITION</Text>
        <View style={styles.unitList}>
          {FACTIONS.coalition.unitNames.map((name, i) => (
            <View key={i} style={styles.unitRow}>
              <Text style={styles.tierBadge}>T{i + 1}</Text>
              <Text style={styles.unitName} numberOfLines={1}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={styles.selectRow}>
          <Ionicons name="chevron-forward" size={16} color="#4A90D9" />
          <Text style={[styles.selectText, { color: '#4A90D9' }]}>Select</Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.card,
          styles.insurgentsCard,
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
        onPress={() => onSelect('insurgents')}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="sword-cross" size={48} color="#B8860B" />
        </View>
        <Text style={[styles.factionName, { color: '#B8860B' }]}>INSURGENTS</Text>
        <View style={styles.unitList}>
          {FACTIONS.insurgents.unitNames.map((name, i) => (
            <View key={i} style={styles.unitRow}>
              <Text style={styles.tierBadge}>T{i + 1}</Text>
              <Text style={styles.unitName} numberOfLines={1}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={styles.selectRow}>
          <Ionicons name="chevron-forward" size={16} color="#B8860B" />
          <Text style={[styles.selectText, { color: '#B8860B' }]}>Select</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    gap: 8,
    justifyContent: 'space-between',
  },
  usCard: {
    backgroundColor: 'rgba(46,94,142,0.12)',
    borderColor: 'rgba(74,144,217,0.3)',
  },
  insurgentsCard: {
    backgroundColor: 'rgba(184,134,11,0.1)',
    borderColor: 'rgba(184,134,11,0.3)',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  factionName: {
    fontSize: 18,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 2,
  },
  unitList: {
    width: '100%',
    gap: 4,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierBadge: {
    color: Colors.text.muted,
    fontSize: 10,
    fontFamily: 'Rajdhani_700Bold',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  unitName: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontFamily: 'Rajdhani_500Medium',
    flexShrink: 1,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  selectText: {
    fontSize: 14,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 1,
  },
});
