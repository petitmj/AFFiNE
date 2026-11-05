import { Button } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import {
  type NotionRun,
  NotionImportService,
  type RunState,
} from '@affine/core/modules/notion-import';
import { parseRoots } from '@affine/core/modules/notion-import/domain/roots';
import {
  isRunning,
  overallProgress,
} from '@affine/core/modules/notion-import/services/progress';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import * as style from './styles.css';
import * as css from './notion-api-wizard.css';

type Scope = 'all' | 'some';

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** the whole Notion API import as one dialog step; it holds no import logic */
export function NotionApiWizard({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  /** closes the import dialog; the ids let the caller reveal the new docs */
  onFinish: (docIds: string[]) => void;
}) {
  const service = useService(NotionImportService);
  const state = useLiveData(service.state$);

  useEffect(() => () => service.leave(), [service]);

  if (isRunning(state)) return <RunningStep state={state} />;
  if (state.phase === 'done') {
    return <DoneStep state={state} onFinish={onFinish} />;
  }
  if (state.phase === 'failed') return <FailedStep state={state} />;
  return <ConnectStep state={state} onBack={onBack} />;
}

function ConnectStep({
  state,
  onBack,
}: {
  state: RunState;
  onBack: () => void;
}) {
  const t = useI18n();
  const service = useService(NotionImportService);
  const [token, setToken] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [rootsText, setRootsText] = useState('');
  const [comments, setComments] = useState(false);
  const [resumable, setResumable] = useState<NotionRun>();

  useEffect(() => {
    if (!service.available) return;
    let alive = true;
    service
      .findResumable()
      .then(run => alive && setResumable(run))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [service]);

  const parsed = parseRoots(rootsText);
  const needsRoots = scope === 'some';
  const rootsOk =
    !needsRoots || (parsed.ids.length > 0 && parsed.invalid.length === 0);
  const canStart = service.available && token.trim().length > 0 && rootsOk;

  const start = useCallback(() => {
    service
      .start({
        token: token.trim(),
        roots: needsRoots ? parsed.ids : [],
        includeBlockComments: comments,
      })
      .catch(() => undefined);
    // the token has been handed to the server; do not keep it in memory here
    setToken('');
  }, [service, token, needsRoots, parsed.ids, comments]);

  return (
    <div className={css.wizard}>
      <div className={style.importModalTitle}>
        {t['com.affine.import.notion-api.title']()}
      </div>
      <p className={css.lead}>{t['com.affine.import.notion-api.intro']()}</p>

      {!service.available ? (
        <div className={css.notice}>
          {t['com.affine.import.notion-api.unavailable']()}
        </div>
      ) : null}

      {resumable ? (
        <div className={css.notice}>
          {t['com.affine.import.notion-api.resume.found']({
            status: resumable.status,
          })}{' '}
          <Button
            variant="secondary"
            onClick={() => {
              service.attach(resumable).catch(() => undefined);
            }}
          >
            {t['com.affine.import.notion-api.resume.continue']()}
          </Button>
        </div>
      ) : null}

      <label className={css.field}>
        <span className={css.label}>
          {t['com.affine.import.notion-api.token.label']()}
        </span>
        <input
          className={css.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          placeholder={t['com.affine.import.notion-api.token.placeholder']()}
          onChange={e => setToken(e.target.value)}
        />
        <span className={css.help}>
          {t['com.affine.import.notion-api.token.help']()}
        </span>
      </label>

      <div className={css.field} role="radiogroup">
        <label className={css.choice}>
          <input
            type="radio"
            name="notion-scope"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          {t['com.affine.import.notion-api.scope.all']()}
        </label>
        <label className={css.choice}>
          <input
            type="radio"
            name="notion-scope"
            checked={scope === 'some'}
            onChange={() => setScope('some')}
          />
          {t['com.affine.import.notion-api.scope.some']()}
        </label>
        {needsRoots ? (
          <>
            <textarea
              className={css.textarea}
              value={rootsText}
              spellCheck={false}
              aria-label={t['com.affine.import.notion-api.scope.some']()}
              placeholder={t[
                'com.affine.import.notion-api.scope.placeholder'
              ]()}
              onChange={e => setRootsText(e.target.value)}
            />
            {parsed.invalid.length ? (
              <span className={css.errorText} role="alert">
                {t['com.affine.import.notion-api.scope.invalid']({
                  lines: parsed.invalid.join(', '),
                })}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <label className={css.choice}>
        <input
          type="checkbox"
          checked={comments}
          onChange={e => setComments(e.target.checked)}
        />
        {t['com.affine.import.notion-api.comments']()}
      </label>

      {state.phase === 'cancelled' ? (
        <div className={css.notice}>
          {t['com.affine.import.notion-api.cancelled']()}
        </div>
      ) : null}
      {state.phase === 'detached' ? (
        <div className={css.notice}>
          {t['com.affine.import.notion-api.detached']()}
        </div>
      ) : null}

      <div className={css.buttons}>
        <Button variant="secondary" onClick={onBack}>
          {t['com.affine.import.notion-api.back']()}
        </Button>
        <Button variant="primary" disabled={!canStart} onClick={start}>
          {t['com.affine.import.notion-api.start']()}
        </Button>
      </div>
    </div>
  );
}

function phaseText(t: ReturnType<typeof useI18n>, state: RunState): string {
  const p = state.extract;
  switch (state.phase) {
    case 'extracting':
      return t['com.affine.import.notion-api.phase.extracting']({
        done: String(p?.doneTasks ?? 0),
        total: String((p?.doneTasks ?? 0) + (p?.pendingTasks ?? 0)),
      });
    case 'paused':
      return t['com.affine.import.notion-api.phase.paused']();
    case 'loading':
      return t['com.affine.import.notion-api.phase.loading']({
        count: String(state.loaded ?? 0),
      });
    case 'transforming':
      return t['com.affine.import.notion-api.phase.transforming']();
    case 'committing':
      return t['com.affine.import.notion-api.phase.committing']({
        completed: String(state.commit?.completed ?? 0),
        total: String(state.commit?.total ?? 0),
      });
    case 'reporting':
      return t['com.affine.import.notion-api.phase.reporting']();
    default:
      return t['com.affine.import.notion-api.phase.creating']();
  }
}

function RunningStep({ state }: { state: RunState }) {
  const t = useI18n();
  const service = useService(NotionImportService);
  const reading = state.phase === 'extracting' || state.phase === 'paused';
  const notices = state.extract?.warningCount ?? 0;

  return (
    <div className={css.wizard}>
      <div className={style.importModalTitle}>
        {t['com.affine.import.notion-api.title']()}
      </div>
      <progress
        className={css.bar}
        max={1}
        value={overallProgress(state)}
        aria-label={phaseText(t, state)}
      />
      <p className={style.importStatusContent} aria-live="polite">
        {phaseText(t, state)}
      </p>
      {notices ? (
        <p className={css.help}>
          {t['com.affine.import.notion-api.notices']({
            count: String(notices),
          })}
        </p>
      ) : null}
      <div className={css.buttons}>
        <Button variant="secondary" onClick={() => service.leave()}>
          {t['com.affine.import.notion-api.keep-running']()}
        </Button>
        {reading ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                (state.phase === 'paused'
                  ? service.resume()
                  : service.pause()
                )?.catch(() => undefined);
              }}
            >
              {state.phase === 'paused'
                ? t['com.affine.import.notion-api.resume']()
                : t['com.affine.import.notion-api.pause']()}
            </Button>
            <Button
              variant="error"
              onClick={() => {
                service.cancel()?.catch(() => undefined);
              }}
            >
              {t['com.affine.import.notion-api.cancel']()}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FailedStep({ state }: { state: RunState }) {
  const t = useI18n();
  const service = useService(NotionImportService);
  const [token, setToken] = useState('');
  return (
    <div className={css.wizard}>
      <div className={style.importModalTitle}>
        {t['com.affine.import.notion-api.failed.title']()}
      </div>
      <p className={css.errorText} role="alert">
        {state.error}
      </p>
      <label className={css.field}>
        <span className={css.label}>
          {t['com.affine.import.notion-api.failed.token']()}
        </span>
        <input
          className={css.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          placeholder={t['com.affine.import.notion-api.token.placeholder']()}
          onChange={e => setToken(e.target.value)}
        />
      </label>
      <div className={css.buttons}>
        <Button variant="secondary" onClick={() => service.reset()}>
          {t['com.affine.import.notion-api.failed.restart']()}
        </Button>
        <Button
          variant="primary"
          disabled={!token.trim()}
          onClick={() => {
            service.resume(token.trim())?.catch(() => undefined);
            setToken('');
          }}
        >
          {t['com.affine.import.notion-api.failed.continue']()}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  state,
  onFinish,
}: {
  state: RunState;
  onFinish: (docIds: string[]) => void;
}) {
  const t = useI18n();
  const service = useService(NotionImportService);
  const workspaceId = useService(WorkspaceService).workspace.id;
  const { jumpToPage } = useNavigateHelper();
  const s = state.summary;

  const rows = [
    ['mapped', s?.mapped],
    ['degraded', s?.degraded],
    ['preserved', s?.preservedOnly],
    ['unrecoverable', s?.unrecoverable],
  ] as const;
  const label = {
    mapped: t['com.affine.import.notion-api.outcome.mapped'](),
    degraded: t['com.affine.import.notion-api.outcome.degraded'](),
    preserved: t['com.affine.import.notion-api.outcome.preserved'](),
    unrecoverable: t['com.affine.import.notion-api.outcome.unrecoverable'](),
  };

  return (
    <div className={css.wizard}>
      <div className={style.importModalTitle}>
        {t['com.affine.import.notion-api.done.title']()}
      </div>
      <p className={style.importStatusContent}>
        {t['com.affine.import.notion-api.done.summary']({
          count: String(state.importedDocIds.length),
        })}
      </p>
      <ul className={css.outcomes}>
        {rows.map(([key, count]) => (
          <li key={key} className={css.outcome}>
            <span>{label[key]}</span>
            <span className={css.outcomeCount}>{count ?? 0}</span>
          </li>
        ))}
      </ul>
      {state.warnings.length ? (
        <div className={style.importWarnings}>
          {state.warnings.map((w, i) => (
            <div key={`${w.code}-${i}`}>{w.message}</div>
          ))}
        </div>
      ) : null}
      <div className={css.buttons}>
        {state.preservedJson ? (
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                'notion-import-preserved.json',
                state.preservedJson ?? ''
              )
            }
          >
            {t['com.affine.import.notion-api.done.download']()}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => {
            service
              .downloadPreserved()
              ?.then(text => downloadText('notion-server-preserved.json', text))
              .catch(() => undefined);
          }}
        >
          {t['com.affine.import.notion-api.done.download-server']()}
        </Button>
        {state.reportDocId ? (
          <Button
            variant="secondary"
            onClick={() => {
              jumpToPage(workspaceId, state.reportDocId as string);
              onFinish(state.importedDocIds);
            }}
          >
            {t['com.affine.import.notion-api.done.report']()}
          </Button>
        ) : null}
        <Button
          variant="primary"
          onClick={() => onFinish(state.importedDocIds)}
        >
          {t['com.affine.import.notion-api.done.finish']()}
        </Button>
      </div>
    </div>
  );
}
