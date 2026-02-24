import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GameState } from '@/lib/game/types';
import { FACTIONS, PLAYER_COLORS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

interface StatusBarProps {
  gameState: GameState;
}

export default function StatusBar({ gameState }: StatusBarProps) {
  const currentPlayer = gameState.players[gameState.currentPlayer];
  const faction = FACTIONS[currentPlayer.faction];
  const isHuman = currentPlayer.isHuman;
  const playerColor = PLAYER_COLORS[currentPlayer.id];

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: playerColor }]} />
        <Text style={styles.turnText}>Turn {gameState.turnNumber}</Text>
      </View>

      <View style={styles.center}>
        <Text style={[styles.factionName, { color: playerColor }]}>
          {faction.name}
        </Text>
        <Text style={styles.statusText}>
          {isHuman ? 'Your Turn' : 'Opponent'}
        </Text>
      </View>

      <View style={styles.right}>
        {gameState.players.map((p) => (
          <View
            key={p.id}
            style={[
              styles.playerDot,
              {
                backgroundColor: PLAYER_COLORS[p.id],
                opacity: p.alive ? 1 : 0.3,
              },
              p.id === gameState.currentPlayer && styles.activeDot,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,134,11,0.15)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  turnText: {
    color: Colors.text.secondary,
    fontSize: 13,
    fontFamily: 'Rajdhani_600SemiBold',
  },
  center: {
    alignItems: 'center',
    flex: 2,
  },
  factionName: {
    fontSize: 16,
    fontFamily: 'Rajdhani_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusText: {
    color: Colors.text.muted,
    fontSize: 11,
    fontFamily: 'Rajdhani_500Medium',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  playerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D4A020',
  },
});
