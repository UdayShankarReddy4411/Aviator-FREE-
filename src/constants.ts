export const GAME_CONSTANTS = {
  INITIAL_BALANCE: 1000,
  MIN_BET: 1,
  MAX_BET: 1000,
  STARTING_MULTIPLIER: 1.00,
  GROWTH_RATE: 0.05, // Controls how fast the multiplier grows
  TICK_RATE: 50, // ms between logic updates
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 400,
};

// Formula for multiplier: M = start * e^(growth * time)
// Formula for crash: C = 1 / (1 - rand()) * 0.99
export const calculateCrashPoint = (): number => {
  const rand = Math.random();
  // 3% instant crash at 1.00x
  if (rand < 0.03) return 1.00;
  
  // Exponential distribution for high multipliers, rare but possible
  const crash = 0.99 / (1 - Math.random());
  return Math.max(1.01, Math.min(crash, 1000000)); // Cap at 1M for sanity
};
