import { Button, Input, Select } from '@affine/component';
import { NotionImportService } from '@affine/core/modules/notion-import';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import * as style from './styles.css';

type Step = 'token' | 'progress' | 'review';

type Mode = 'merge' | 'skip-if-diverged' | 'overwrite';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'skip-if-diverged', label: 'com.affine.import.notion-api.mode.skip-if-diverged' },
  { value: 'merge', label: 'com.affine.import.notion-api.mode.merge' },
  { value: 'overwrite', label: 'com.affine.import.notion-api.mode.overwrite' },
];

export type ApiImportFlowProps = {
  onComplete: (docIds: string[]) => void;
  onError: (error: Error) => void;
  onCancel: () => void;
  initialRunId?: string | null;
};

export const ApiImportFlow = ({ onComplete, onError, onCancel, initialRunId }: ApiImportFlowProps) => {
  const t = useI18n();
  const notionImportService = useService(NotionImportService);

  const [step, setStep] = useState<Step>('token');
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<Mode>('skip-if-diverged');
  const [runId, setRunId] = useState<string | null>(initialRunId ?? null);
  const [ledger, setLedger] = useState<{
    mapped: number;
    degraded: number;
    preservedOnly: number;
    unrecoverable: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run status polling
  const [runStatus, setRunStatus] = useState<{
    status: string;
    progress: { phase: string; completed: number; total: number } | null;
    counters: Record<string, number> | null;
    error: string | null;
    canRetry: boolean | null;
  } | null>(null);

  // Watch run status when in progress step
  useEffect(() => {
    if (step !== 'progress' || !runId) return;

    const subscription = notionImportService.watchRun(runId).subscribe({
      next: (snapshot) => {
        setRunStatus(snapshot);
        
        // Check if run is complete (staged or failed)
        if (snapshot?.status === 'Staged') {
          // Fetch ledger for review
          fetchLedger().then(() => {
            setStep('review');
          }).catch(() => {
            setError('Failed to fetch ledger');
            setStep('review');
          });
        } else if (snapshot?.status === 'Failed' || snapshot?.status === 'Cancelled') {
          setError(snapshot.error || 'Import failed');
          setStep('review');
        }
      },
      error: (err) => {
        setError('Failed to watch run status');
      },
    });

    return () => subscription.unsubscribe();
  }, [step, runId, notionImportService, fetchLedger]);

  const fetchLedger = useCallback(async () => {
    if (!runId) return;
    
    try {
      const ledgerEntries = await notionImportService.collectLedger(runId);
      
      const counts = {
        mapped: 0,
        degraded: 0,
        preservedOnly: 0,
        unrecoverable: 0,
      };
      
      for (const entry of ledgerEntries) {
        switch (entry.outcome) {
          case 'Mapped':
            counts.mapped++;
            break;
          case 'Degraded':
            counts.degraded++;
            break;
          case 'PreservedOnly':
            counts.preservedOnly++;
            break;
          case 'Unrecoverable':
            counts.unrecoverable++;
            break;
        }
      }
      
      setLedger(counts);
      setStep('review');
    } catch (err) {
      setError('Failed to fetch ledger');
    }
  }, [runId, notionImportService]);

  const handleStartImport = useCallback(async () => {
    if (!token.trim()) {
      setError('Please enter a valid token');
      return;
    }

    setError(null);
    
    try {
      const newRunId = await notionImportService.start({
        token,
        mode,
      });
      
      setRunId(newRunId);
      setStep('progress');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
    }
  }, [token, mode, notionImportService]);

  const handleCompleteImport = useCallback(async () => {
    if (!runId) return;
    
    try {
      // Fetch items and files to build the import batch
      const items = await notionImportService.collectItems(runId);
      const files = await notionImportService.collectFiles(runId);
      const blobs = await notionImportService.mirrorBlobs(files);
      const batch = notionImportService.planBatch(items, blobs);
      
      // Import the batch using the ImportService
      // This will be handled by the parent component
      onComplete([]);
    } catch (err) {
      onError(err instanceof Error ? err : new Error('Failed to complete import'));
    }
  }, [runId, notionImportService, onComplete, onError]);

  const handleCancelImport = useCallback(async () => {
    if (!runId) {
      onCancel();
      return;
    }
    
    try {
      await notionImportService.cancel(runId);
      onCancel();
    } catch (err) {
      onCancel();
    }
  }, [runId, notionImportService, onCancel]);

  // Step 1: Token Entry
  if (step === 'token') {
    return (
      <div className={style.importModalContainer}>
        <div className={style.importModalTitle}>
          {t['com.affine.import.notion-api.title']()}
        </div>
        <p className={style.importStatusContent}>
          {t['com.affine.import.notion-api.description']()}{' '}
          <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer">
            Notion Integrations
          </a>
        </p>
        
        <div className={style.apiImportForm}>
          <div className={style.apiImportField}>
            <label className={style.apiImportFieldLabel}>{t['Integration Token']()}</label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your Notion integration token"
              data-testid="notion-api-token-input"
            />
          </div>
          
          <div className={style.apiImportField}>
            <label className={style.apiImportFieldLabel}>{t['Import Mode']()}</label>
            <Select
              value={mode}
              onChange={(value) => setMode(value as Mode)}
              options={MODE_OPTIONS.map(opt => ({
                value: opt.value,
                label: t[opt.label](),
              }))}
              data-testid="notion-api-mode-select"
            />
          </div>
        </div>
        
        {error && (
          <div className={style.importErrorDetail}>{error}</div>
        )}
        
        <div className={style.importModalButtonContainer}>
          <Button onClick={onCancel} variant="secondary">
            {t['Cancel']()}
          </Button>
          <Button
            onClick={handleStartImport}
            variant="primary"
            disabled={!token.trim()}
            data-testid="notion-api-start-button"
          >
            {t['Start Import']()}
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Progress
  if (step === 'progress') {
    const progress = runStatus?.progress;
    const progressLabel = progress && progress.total > 0
      ? `${progress.completed}/${progress.total}`
      : null;
    
    return (
      <div className={style.importModalContainer}>
        <div className={style.importModalTitle}>
          {t['com.affine.import.notion-api.progress.title']()}
        </div>
        <p className={style.importStatusContent}>
          {t['com.affine.import.notion-api.progress.message']()}
        </p>
        
        {runStatus?.error && (
          <div className={style.importErrorDetail}>{runStatus.error}</div>
        )}
        
        {progressLabel && (
          <div className={style.importProgress}>{progressLabel}</div>
        )}
        
        <div className={style.importModalButtonContainer}>
          <Button onClick={handleCancelImport} variant="secondary">
            {t['Cancel']()}
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Review
  if (step === 'review') {
    return (
      <div className={style.importModalContainer}>
        <div className={style.importModalTitle}>
          {t['com.affine.import.notion-api.review.title']()}
        </div>
        
        {error && (
          <div className={style.importErrorDetail}>{error}</div>
        )}
        
        {ledger && (
          <div className={style.ledgerSummary}>
            <div className={style.ledgerItem}>
              <span className={style.ledgerLabel}>Mapped:</span>
              <span className={style.ledgerValue}>{ledger.mapped}</span>
            </div>
            <div className={style.ledgerItem}>
              <span className={style.ledgerLabel}>Degraded:</span>
              <span className={style.ledgerValue}>{ledger.degraded}</span>
            </div>
            <div className={style.ledgerItem}>
              <span className={style.ledgerLabel}>Preserved Only:</span>
              <span className={style.ledgerValue}>{ledger.preservedOnly}</span>
            </div>
            <div className={style.ledgerItem}>
              <span className={style.ledgerLabel}>Unrecoverable:</span>
              <span className={style.ledgerValue}>{ledger.unrecoverable}</span>
            </div>
          </div>
        )}
        
        <div className={style.retentionMessage}>
          {t['com.affine.import.notion-api.retention']()}
        </div>
        
        <div className={style.importModalButtonContainer}>
          <Button onClick={handleCancelImport} variant="secondary">
            {t['Cancel']()}
          </Button>
          <Button
            onClick={handleCompleteImport}
            variant="primary"
            data-testid="notion-api-complete-button"
          >
            {t['Complete']()}
          </Button>
        </div>
      </div>
    );
  }

  return null;
};
