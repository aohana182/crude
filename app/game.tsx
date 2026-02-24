import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Faction, GameState, PurchaseType } from '@/lib/game/types';
import { createNewGame, handleHexTap, startPurchase, endTurn, toggleCombineMode } from '@/lib/game/gameEngine';
import HexGrid from '@/components/game/HexGrid';
import StatusBar from '@/components/game/StatusBar';
import ActionPanel from '@/components/game/ActionPanel';
import GameOverlay from '@/components/game/GameOverlay';
import Colors from '@/constants/colors';

const MAP_RADIUS = 10;

export default function GameScreen() {
  const { faction } = useLocalSearchParams<{ faction: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const [gameState, setGameState] = useState<GameState>(() =>
    createNewGame((faction as Faction) || 'army', MAP_RADIUS),
  );

  const onHexPress = useCallback(
    (q: number, r: number) => {
      setGameState((prev) => handleHexTap(prev, q, r));
    },
    [],
  );

  const onBuyUnit = useCallback((type: PurchaseType) => {
    setGameState((prev) => startPurchase(prev, type));
  }, []);

  const onCombine = useCallback(() => {
    setGameState((prev) => toggleCombineMode(prev));
  }, []);

  const onDeselect = useCallback(() => {
    setGameState((prev) => ({ ...prev, selectedHex: null, combineMode: false, purchaseType: null }));
  }, []);

  const onEndTurn = useCallback(() => {
    setGameState((prev) => {
      try {
        return endTurn(prev);
      } catch (e) {
        console.error('End turn error:', e);
        return { ...prev, selectedHex: null, purchaseType: null, combineMode: false };
      }
    });
  }, []);

  const onNewGame = useCallback(() => {
    setGameState(createNewGame((faction as Faction) || 'army', MAP_RADIUS));
  }, [faction]);

  const onMainMenu = useCallback(() => {
    router.back();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <StatusBar gameState={gameState} />

      <View style={styles.gridContainer}>
        <HexGrid gameState={gameState} onHexPress={onHexPress} />
      </View>

      <View style={{ paddingBottom: bottomPadding }}>
        <ActionPanel
          gameState={gameState}
          onBuyUnit={onBuyUnit}
          onCombine={onCombine}
          onDeselect={onDeselect}
          onEndTurn={onEndTurn}
        />
      </View>

      <GameOverlay
        gameState={gameState}
        onNewGame={onNewGame}
        onMainMenu={onMainMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  gridContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
