import type { RunState } from './run-controller';

/**
 * One bar for the whole run, 0 to 1. Reading from Notion is the long part
 * and has no known size until it ends, so it takes the first 40% and moves
 * with finished tasks; writing pages takes the 50% to 95% stretch.
 */
export function overallProgress(state: RunState): number {
  switch (state.phase) {
    case 'idle':
    case 'creating':
      return 0;
    case 'extracting':
    case 'paused': {
      const p = state.extract;
      const total = p ? p.doneTasks + p.failedTasks + p.pendingTasks : 0;
      return total
        ? (0.4 * ((p?.doneTasks ?? 0) + (p?.failedTasks ?? 0))) / total
        : 0.02;
    }
    case 'loading':
      return 0.42;
    case 'transforming':
      return 0.48;
    case 'committing': {
      const c = state.commit;
      return (
        0.5 + (c && c.total ? 0.45 * Math.min(c.completed / c.total, 1) : 0)
      );
    }
    case 'reporting':
      return 0.97;
    case 'done':
      return 1;
    default:
      return 0;
  }
}

/** phases in which the wizard shows the running screen */
export const RUNNING_PHASES = [
  'creating',
  'extracting',
  'paused',
  'loading',
  'transforming',
  'committing',
  'reporting',
] as const;

export const isRunning = (state: RunState) =>
  (RUNNING_PHASES as readonly string[]).includes(state.phase);
