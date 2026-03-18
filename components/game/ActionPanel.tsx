import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { GameState, hexKey, PurchaseType } from '@/lib/game/types';
import { FACTIONS, PEASANT_COST, CASTLE_COST } from '@/lib/game/constants';
import { getTerritoryForHex } from '@/lib/game/territoryManager';
import Colors from '@/constants/colors';

const UNITS_SPRITE = require('@/assets/sprites/units_nobg.png'); // background-removed sheet
// Row in sprite sheet: coalition=0, insurgents=1 (tier-0 is always col 0)
const FACTION_ROW: Record<string, number> = { coalition: 0, insurgents: 1 };

const CASTLE_SPRITES: Record<string, any> = {
  coalition: require('@/assets/sprites/tower_army.png'),
  insurgents: require('@/assets/sprites/tower_insurgent.png'),
};


interface ActionPanelProps {
  gameState: GameState;
  onBuyUnit: (type: PurchaseType) => void;
  onCombine: () => void;
  onDeselect: () => void;
  onEndTurn: () => void;
}

export default function ActionPanel({ gameState, onBuyUnit, onCombine, onDeselect, onEndTurn }: ActionPanelProps) {
  const currentPlayer = gameState.players[gameState.currentPlayer];
  const faction = FACTIONS[currentPlayer.faction];
  const isHuman = currentPlayer.isHuman;

  const selectedTerritory = useMemo(() => {
    if (!gameState.selectedHex) return null;
    return getTerritoryForHex(
      gameState.selectedHex.q,
      gameState.selectedHex.r,
      gameState.territories,
    );
  }, [gameState.selectedHex, gameState.territories]);

  const bestTerritory = useMemo(() => {
    const playerTerritories = gameState.territories.filter(
      (t) => t.owner === gameState.currentPlayer,
    );
    if (playerTerritories.length === 0) return null;
    return playerTerritories.reduce((best, t) =>
      t.treasury > best.treasury ? t : best,
    );
  }, [gameState.territories, gameState.currentPlayer]);

  const displayTerritory = selectedTerritory || bestTerritory;

  const playerStats = useMemo(() => {
    const playerTerritories = gameState.territories.filter(
      (t) => t.owner === gameState.currentPlayer,
    );
    const totalHexes = playerTerritories.reduce((sum, t) => sum + t.hexes.length, 0);
    const totalTreasury = playerTerritories.reduce((sum, t) => sum + t.treasury, 0);
    const totalIncome = playerTerritories.reduce((sum, t) => sum + t.income, 0);
    const totalUpkeep = playerTerritories.reduce((sum, t) => sum + t.upkeep, 0);
    return { totalHexes, totalTreasury, totalIncome, totalUpkeep, territoryCount: playerTerritories.length };
  }, [gameState.territories, gameState.currentPlayer]);

  if (!isHuman) {
    return (
      <View style={styles.container}>
        <View style={styles.aiTurn}>
          <MaterialCommunityIcons name="robot" size={20} color={Colors.text.muted} />
          <Text style={styles.aiText}>Opponent is planning...</Text>
        </View>
      </View>
    );
  }

  const canAffordPeasant = displayTerritory ? displayTerritory.treasury >= PEASANT_COST : false;
  const canAffordCastle = displayTerritory ? displayTerritory.treasury >= CASTLE_COST : false;
  const isPeasantActive = gameState.purchaseType === 'peasant';
  const isCastleActive = gameState.purchaseType === 'castle';
  const isCombineActive = gameState.combineMode;
  const hasSelection = gameState.selectedHex !== null;
  const hasAnyMode = isPeasantActive || isCastleActive || isCombineActive || hasSelection;

  const hasUnmovedUnits = useMemo(() =>
    Array.from(gameState.hexes.values()).some(
      h => h.owner === gameState.currentPlayer && h.unitTier !== null && !h.unitMoved
    ),
    [gameState.hexes, gameState.currentPlayer]
  );

  const selectedHex = gameState.selectedHex
    ? gameState.hexes.get(hexKey(gameState.selectedHex.q, gameState.selectedHex.r))
    : null;
  const hasSelectedUnit = selectedHex?.unitTier !== null && selectedHex?.owner === gameState.currentPlayer;

  return (
    <View style={styles.container}>
      <View style={styles.territoryInfo}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="barrel" size={14} color={Colors.accent.oil} />
            <Text style={styles.statValue}>
              {displayTerritory ? displayTerritory.treasury : playerStats.totalTreasury}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="trending-up" size={14} color={Colors.accent.greenLight} />
            <Text style={[styles.statValue, { color: Colors.accent.greenLight }]}>
              +{displayTerritory ? displayTerritory.income : playerStats.totalIncome}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="trending-down" size={14} color={Colors.accent.redLight} />
            <Text style={[styles.statValue, { color: Colors.accent.redLight }]}>
              -{displayTerritory ? displayTerritory.upkeep : playerStats.totalUpkeep}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.netLabel}>NET</Text>
            <Text
              style={[
                styles.statValue,
                {
                  color:
                    (displayTerritory
                      ? displayTerritory.income - displayTerritory.upkeep
                      : playerStats.totalIncome - playerStats.totalUpkeep) >= 0
                      ? Colors.accent.greenLight
                      : Colors.accent.redLight,
                },
              ]}
            >
              {(displayTerritory
                ? displayTerritory.income - displayTerritory.upkeep
                : playerStats.totalIncome - playerStats.totalUpkeep) >= 0
                ? '+'
                : ''}
              {displayTerritory
                ? displayTerritory.income - displayTerritory.upkeep
                : playerStats.totalIncome - playerStats.totalUpkeep}
            </Text>
          </View>
          <View style={styles.stat}>
            <MaterialCommunityIcons name="hexagon-multiple" size={14} color={Colors.text.muted} />
            <Text style={[styles.statValue, { color: Colors.text.secondary }]}>
              {playerStats.totalHexes}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <View style={styles.buyButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.buyButton,
              isPeasantActive && styles.buyButtonActive,
              !canAffordPeasant && styles.buyButtonDisabled,
              pressed && canAffordPeasant && { opacity: 0.8 },
            ]}
            onPress={() => canAffordPeasant && onBuyUnit('peasant')}
            disabled={!canAffordPeasant}
          >
            <View style={[styles.buttonSprite, { overflow: 'hidden' }, !canAffordPeasant && { opacity: 0.4 }]}>
              <Image
                source={UNITS_SPRITE}
                style={{
                  width: styles.buttonSprite.width * 4,
                  height: styles.buttonSprite.height * 2,
                  marginTop: -(FACTION_ROW[currentPlayer.faction] ?? 0) * styles.buttonSprite.height,
                }}
              />
            </View>
            <Text
              style={[
                styles.buyName,
                isPeasantActive && { color: '#D4A020' },
                !canAffordPeasant && { color: Colors.text.muted },
              ]}
              numberOfLines={1}
            >
              {faction.unitNames[0].split(' ')[0]}
            </Text>
            <Text
              style={[
                styles.buyCost,
                !canAffordPeasant && { color: Colors.text.muted },
              ]}
            >
              {PEASANT_COST}bbl
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.buyButton,
              isCastleActive && styles.buyButtonActive,
              !canAffordCastle && styles.buyButtonDisabled,
              pressed && canAffordCastle && { opacity: 0.8 },
            ]}
            onPress={() => canAffordCastle && onBuyUnit('castle')}
            disabled={!canAffordCastle}
          >
            <Image
              source={CASTLE_SPRITES[currentPlayer.faction]}
              style={[styles.buttonSprite, !canAffordCastle && { opacity: 0.4 }]}
            />
            <Text
              style={[
                styles.buyName,
                isCastleActive && { color: '#D4A020' },
                !canAffordCastle && { color: Colors.text.muted },
              ]}
            >
              Castle
            </Text>
            <Text
              style={[
                styles.buyCost,
                !canAffordCastle && { color: Colors.text.muted },
              ]}
            >
              {CASTLE_COST}bbl
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.buyButton,
              isCombineActive && styles.combineButtonActive,
              pressed && { opacity: 0.8 },
            ]}
            onPress={onCombine}
          >
            <MaterialCommunityIcons
              name="merge"
              size={18}
              color={isCombineActive ? '#FF8C00' : Colors.text.primary}
            />
            <Text
              style={[
                styles.buyName,
                isCombineActive && { color: '#FF8C00' },
              ]}
            >
              Combine
            </Text>
          </Pressable>
        </View>

        {hasAnyMode && (
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={onDeselect}
          >
            <Ionicons name="close" size={22} color="#FF6B6B" />
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.endTurnButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] as const },
          ]}
          onPress={onEndTurn}
        >
          <MaterialCommunityIcons name="arrow-right-bold" size={22} color="#fff" />
          <Text style={styles.endTurnText}>END</Text>
          {hasUnmovedUnits && (
            <View style={styles.unmovedDot} />
          )}
        </Pressable>
      </View>

      {isCombineActive && hasSelectedUnit && (
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>Tap another unit in the same territory to combine them</Text>
        </View>
      )}
      {isCombineActive && !hasSelectedUnit && (
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>Select a unit first, then tap another to combine</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,134,11,0.15)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  territoryInfo: {
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
  },
  stat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  statValue: {
    color: Colors.text.primary,
    fontSize: 14,
    fontFamily: 'Rajdhani_700Bold',
  },
  netLabel: {
    color: Colors.text.muted,
    fontSize: 9,
    fontFamily: 'Rajdhani_600SemiBold',
  },
  actionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  buyButtons: {
    flexDirection: 'row' as const,
    gap: 4,
    flex: 1,
  },
  buttonSprite: {
    width: 24,
    height: 24,
    resizeMode: 'contain' as const,
  },
  buyButton: {
    alignItems: 'center' as const,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 56,
  },
  buyButtonActive: {
    borderColor: '#D4A020',
    backgroundColor: 'rgba(212,160,32,0.1)',
  },
  combineButtonActive: {
    borderColor: '#FF8C00',
    backgroundColor: 'rgba(255,140,0,0.1)',
  },
  buyButtonDisabled: {
    opacity: 0.4,
  },
  buyName: {
    color: Colors.text.primary,
    fontSize: 9,
    fontFamily: 'Rajdhani_600SemiBold',
  },
  buyCost: {
    color: Colors.accent.oil,
    fontSize: 10,
    fontFamily: 'Rajdhani_600SemiBold',
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,107,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
  },
  endTurnButton: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.accent.oil,
    gap: 2,
    position: 'relative' as const,
  },
  unmovedDot: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF6B35',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  endTurnText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 1,
  },
  hintRow: {
    marginTop: 6,
    alignItems: 'center' as const,
  },
  hintText: {
    color: '#FF8C00',
    fontSize: 11,
    fontFamily: 'Rajdhani_500Medium',
    textAlign: 'center' as const,
  },
  aiTurn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 16,
  },
  aiText: {
    color: Colors.text.muted,
    fontSize: 14,
    fontFamily: 'Rajdhani_500Medium',
  },
});
