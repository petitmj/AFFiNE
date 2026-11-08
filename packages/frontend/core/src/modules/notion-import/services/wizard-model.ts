import { parseRoots } from '../domain/roots';
import type { LedgerSummaryResult } from './notion-api';
import { isRunning } from './progress';
import type { RunState } from './run-controller';

/** which screen of the import wizard a run state belongs on */
export type WizardStep = 'connect' | 'running' | 'done' | 'failed';

export function wizardStep(state: RunState): WizardStep {
  if (isRunning(state)) return 'running';
  if (state.phase === 'done') return 'done';
  if (state.phase === 'failed') return 'failed';
  // idle, cancelled and detached all go back to the form
  return 'connect';
}

export type Scope = 'all' | 'some';

export interface ConnectForm {
  token: string;
  scope: Scope;
  /** the "only these pages" box: Notion links or ids, one per line or comma separated */
  rootsText: string;
  includeBlockComments: boolean;
  /** false for local workspaces, which have no server to stage on */
  available: boolean;
}

/** why the start button is disabled; `undefined` once the form can be sent */
export type ConnectBlock = 'unavailable' | 'token' | 'roots' | 'invalid-roots';

export interface StartRequest {
  token: string;
  roots: string[];
  includeBlockComments: boolean;
}

export interface ConnectResult {
  /** present only when the form is complete */
  request?: StartRequest;
  blocked?: ConnectBlock;
  /** lines of the roots box that held no Notion id, for the error message */
  invalid: string[];
}

/**
 * Validates the connect form and builds the request. It is the only place that
 * decides whether the run can start, so the button state and the request
 * cannot disagree. "Everything" sends no roots at all; "some" needs at least
 * one id and no unreadable line, because silently skipping a line the person
 * typed would import less than they asked for.
 */
export function connectForm(form: ConnectForm): ConnectResult {
  const parsed = form.scope === 'some' ? parseRoots(form.rootsText) : undefined;
  const invalid = parsed?.invalid ?? [];
  const token = form.token.trim();

  let blocked: ConnectBlock | undefined;
  if (!form.available) blocked = 'unavailable';
  else if (!token) blocked = 'token';
  else if (parsed && invalid.length > 0) blocked = 'invalid-roots';
  else if (parsed && parsed.ids.length === 0) blocked = 'roots';

  if (blocked) return { blocked, invalid };
  return {
    invalid,
    request: {
      token,
      roots: parsed?.ids ?? [],
      includeBlockComments: form.includeBlockComments,
    },
  };
}

export type OutcomeKey = 'mapped' | 'degraded' | 'preserved' | 'unrecoverable';

export interface OutcomeRow {
  key: OutcomeKey;
  count: number;
}

/**
 * The four ledger outcomes in the order the results screen lists them, best
 * first. A missing summary shows zeros rather than hiding the rows, so the
 * screen never looks like it is claiming "all fine" by saying nothing.
 */
export function outcomeRows(summary?: LedgerSummaryResult): OutcomeRow[] {
  return [
    { key: 'mapped', count: summary?.mapped ?? 0 },
    { key: 'degraded', count: summary?.degraded ?? 0 },
    { key: 'preserved', count: summary?.preservedOnly ?? 0 },
    { key: 'unrecoverable', count: summary?.unrecoverable ?? 0 },
  ];
}
