export enum GameStatus {
  IDLE = 'IDLE',
  READY = 'READY',
  FLYING = 'FLYING',
  CRASHED = 'CRASHED',
  CASHED_OUT = 'CASHED_OUT',
}

export interface GameHistory {
  id: string;
  multiplier: number;
  timestamp: number;
  cashedOut: boolean;
}

export interface CrashRecord {
  id: string;
  multiplier: number;
  timestamp: number;
}

export interface PlayerState {
  balance: number;
  lastBet: number;
}
