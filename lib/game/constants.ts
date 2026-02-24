import { FactionInfo } from './types';

export const PEASANT_COST = 10;
export const CASTLE_COST = 15;
export const CASTLE_DEFENSE = 2;

export const UNIT_UPKEEP = [2, 6, 18, 54];
export const UNIT_STRENGTH = [1, 2, 3, 4];

export const MIN_TERRITORY_SIZE = 2;

export const FACTIONS: Record<string, FactionInfo> = {
  army: {
    id: 'army',
    name: 'Army',
    unitNames: ['Private', 'Sergeant', 'Major', 'General'],
    colors: {
      primary: '#1B3A5C',
      secondary: '#4A90D9',
      territory: '#2E5E8E',
      border: '#6BB3E8',
    },
  },
  insurgents: {
    id: 'insurgents',
    name: 'Insurgents',
    unitNames: ['Militant', 'Raider', 'Warlord', 'Commander'],
    colors: {
      primary: '#2A1A0A',
      secondary: '#B8860B',
      territory: '#6B4423',
      border: '#D4A84B',
    },
  },
};

export const PLAYER_COLORS = [
  '#2E5E8E',
  '#8B2E2E',
  '#2E6B3E',
  '#7B5EA7',
  '#B8860B',
  '#5E8E8E',
];

export const PLAYER_BORDER_COLORS = [
  '#6BB3E8',
  '#E87B7B',
  '#7BE87B',
  '#C49EE8',
  '#E8D44B',
  '#7BE8E8',
];

export const TERRITORY_COLORS = [
  ['#1E4060', '#2E5E8E', '#3A7AB8'],
  ['#601E1E', '#8B2E2E', '#B84040'],
  ['#1E4028', '#2E6B3E', '#409B58'],
  ['#3E2860', '#7B5EA7', '#9B7EC7'],
  ['#604B0A', '#B8860B', '#D4A030'],
  ['#1E4848', '#5E8E8E', '#7EB8B8'],
];

export const HEX_SIZE = 18;
export const HEX_GAP = 1;
