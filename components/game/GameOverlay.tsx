import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GameState } from '@/lib/game/types';
import { FACTIONS, PLAYER_COLORS } from '@/lib/game/constants';
import Colors from '@/constants/colors';

interface GameOverlayProps {
  gameState: GameState;
  onNewGame: () => void;
  onMainMenu: () => void;
}

export default function GameOverlay({ gameState, onNewGame, onMainMenu }: GameOverlayProps) {
  if (gameState.phase !== 'game_over' || gameState.winner === null) return null;

  const winner = gameState.players[gameState.winner];
  const faction = FACTIONS[winner.faction];
  const isPlayerWin = winner.isHuman;
  const playerColor = PLAYER_COLORS[winner.id];

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <MaterialCommunityIcons
          name={isPlayerWin ? 'trophy' : 'skull-crossbones'}
          size={48}
          color={isPlayerWin ? '#D4A020' : Colors.accent.redLight}
        />

        <Text style={[styles.title, { color: playerColor }]}>
          {isPlayerWin ? 'VICTORY' : 'DEFEAT'}
        </Text>

        <Text style={styles.subtitle}>
          {faction.name} {isPlayerWin ? 'conquers the island' : 'has been overwhelmed'}
        </Text>

        <Text style={styles.stat}>
          Completed in {gameState.turnNumber} turns
        </Text>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={onNewGame}
          >
            <MaterialCommunityIcons name="restart" size={18} color="#fff" />
            <Text style={styles.buttonText}>New Game</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={onMainMenu}
          >
            <MaterialCommunityIcons name="home" size={18} color={Colors.text.primary} />
            <Text style={[styles.buttonText, { color: Colors.text.primary }]}>Menu</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    backgroundColor: Colors.bg.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '80%',
    borderWidth: 1,
    borderColor: 'rgba(184,134,11,0.3)',
    gap: 12,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 4,
  },
  subtitle: {
    color: Colors.text.secondary,
    fontSize: 15,
    fontFamily: 'Rajdhani_500Medium',
    textAlign: 'center',
  },
  stat: {
    color: Colors.text.muted,
    fontSize: 13,
    fontFamily: 'Rajdhani_500Medium',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryButton: {
    backgroundColor: Colors.accent.oil,
  },
  secondaryButton: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: 'rgba(184,134,11,0.2)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Rajdhani_700Bold',
  },
});
