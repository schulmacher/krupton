export interface FetcherState {
  isRunning: boolean;
  fetchCount: number;
  lastFetchTime: number | null;
  errors: number;
}

export interface MdsFetcherService {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

