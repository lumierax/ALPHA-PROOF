export const NATIVE_KEYS = {
  watchlist: '@cycle/native_watchlist_v1',
  systemRunning: '@cycle/system_running_v1',
  wakeDesired: '@cycle/wake_desired_v1',
  backgroundEvents: '@cycle/background_events_v1',
  backgroundState: '@cycle/background_state_v1',
};

export const WEB_KEYS = {
  watchlist: 'cyc_v5_watchlist_v1',
  systemRunning: 'cyc_v5_system_running_v1',
  wakeDesired: 'cyc_v5_wake_lock_v1',
};

export const BACKGROUND_TASK_NAME = 'cycle-tracker-background-refresh';
export const FUTURES_BASES = [
  'https://fapi.binance.com',
  'https://fapi1.binance.com',
  'https://fapi2.binance.com',
];
export const KLINE_LIMIT = 84;
export const HIGHER_EXIT_IDS = ['15m','30m','1h','2h','4h','6h','8h','12h','1d','1w'];
export const SUPPORT_IDS = ['15m','30m','1h','4h','12h'];
