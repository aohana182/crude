import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Faction } from '@/lib/game/types';
import FactionPicker from '@/components/game/FactionPicker';
import Colors from '@/constants/colors';

export default function MainMenu() {
  const insets = useSafeAreaInsets();
  const [showFactionPicker, setShowFactionPicker] = useState(false);

  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleFactionSelect = (faction: Faction) => {
    router.push({ pathname: '/game', params: { faction } });
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <LinearGradient
        colors={['#1A1410', '#241E16', '#1A1410']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.decorTop}>
        {[...Array(5)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.decorHex,
              {
                left: `${15 + i * 18}%`,
                top: 20 + Math.sin(i) * 30,
                opacity: 0.04 + i * 0.01,
              },
            ]}
          >
            <MaterialCommunityIcons name="hexagon-outline" size={60 + i * 10} color={Colors.accent.oil} />
          </View>
        ))}
      </View>

      <View style={styles.header}>
        <MaterialCommunityIcons name="barrel" size={56} color={Colors.accent.oil} />
        <Text style={styles.title}>CRUDE</Text>
        <Text style={styles.subtitle}>Desert Territory Warfare</Text>
      </View>

      {!showFactionPicker ? (
        <View style={styles.menuButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.menuButton,
              styles.primaryMenuButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => setShowFactionPicker(true)}
          >
            <MaterialCommunityIcons name="sword-cross" size={22} color="#fff" />
            <Text style={styles.menuButtonText}>NEW GAME</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.factionSection}>
          <Text style={styles.pickText}>CHOOSE YOUR SIDE</Text>
          <FactionPicker onSelect={handleFactionSelect} />
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setShowFactionPicker(false)}
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color={Colors.text.muted} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>A Slay-inspired strategy game</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  decorTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  decorHex: {
    position: 'absolute',
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
    gap: 2,
  },
  title: {
    fontSize: 52,
    fontFamily: 'Rajdhani_700Bold',
    color: Colors.text.primary,
    letterSpacing: 12,
    lineHeight: 56,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Rajdhani_500Medium',
    color: Colors.text.muted,
    letterSpacing: 3,
    marginTop: 4,
  },
  menuButtons: {
    paddingHorizontal: 40,
    paddingTop: 40,
    gap: 14,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryMenuButton: {
    backgroundColor: Colors.accent.oil,
  },
  menuButtonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 2,
  },
  factionSection: {
    flex: 1,
    paddingTop: 20,
    gap: 16,
  },
  pickText: {
    color: Colors.text.secondary,
    fontSize: 16,
    fontFamily: 'Rajdhani_700Bold',
    letterSpacing: 3,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  backText: {
    color: Colors.text.muted,
    fontSize: 14,
    fontFamily: 'Rajdhani_500Medium',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerText: {
    color: Colors.text.muted,
    fontSize: 11,
    fontFamily: 'Rajdhani_400Regular',
    letterSpacing: 1,
  },
});
