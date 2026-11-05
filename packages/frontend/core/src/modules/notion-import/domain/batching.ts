import type { ReportBlob } from './report';
import type { OutDoc, TransformOutput } from './transform';

export interface PlannedBatch {
  docs: OutDoc[];
  blobs: ReportBlob[];
  folders?: TransformOutput['folders'];
  icons?: TransformOutput['icons'];
  warnings?: TransformOutput['warnings'];
  progress: { completed: number; total: number };
  done: boolean;
}

export const DEFAULT_DOCS_PER_BATCH = 40;

/** the docs of the run in commit-sized slices; folders, icons and the report come later */
export function planDocBatches(
  out: Pick<TransformOutput, 'docs'>,
  docsPerBatch = DEFAULT_DOCS_PER_BATCH
): PlannedBatch[] {
  const size = Math.max(1, Math.floor(docsPerBatch));
  const total = out.docs.length + 1;
  const batches: PlannedBatch[] = [];
  for (let i = 0; i < out.docs.length; i += size) {
    const slice = out.docs.slice(i, i + size);
    batches.push({
      docs: slice,
      blobs: [],
      progress: {
        completed: Math.min(i + slice.length, out.docs.length),
        total,
      },
      done: false,
    });
  }
  return batches;
}

/** the closing batch: report doc and its attachment, then folders and icons */
export function planFinalBatch(
  out: TransformOutput,
  report: { doc: OutDoc; blob: ReportBlob }
): PlannedBatch {
  const total = out.docs.length + 1;
  return {
    docs: [report.doc],
    blobs: [report.blob],
    folders: out.folders,
    icons: out.icons,
    warnings: out.warnings,
    progress: { completed: total, total },
    done: true,
  };
}

/**
 * Splits the transform output into commit batches. Docs go in first so that
 * folder links and icons, which point at docs, land on the final batch when
 * every doc exists. The report doc and its attachment go in last, so a run
 * that fails part-way never leaves a report claiming success.
 */
export function planBatches(
  out: TransformOutput,
  report: { doc: OutDoc; blob: ReportBlob },
  docsPerBatch = DEFAULT_DOCS_PER_BATCH
): PlannedBatch[] {
  return [...planDocBatches(out, docsPerBatch), planFinalBatch(out, report)];
}
