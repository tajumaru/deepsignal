type ReviewLayoutSnapshot = {
  label: string;
  selector: string;
  className: string;
  rectWidth: number;
  clientWidth: number;
  scrollWidth: number;
  offsetWidth: number;
  minWidth: string;
  maxWidth: string;
  width: string;
  display: string;
  gridTemplateColumns: string;
  flex: string;
  overflowX: string;
  overflowY: string;
  transform: string;
};

const REVIEW_LAYOUT_SELECTORS: Array<{ label: string; selector: string }> = [
  { label: "mobile detail sheet", selector: ".desktop-signal-inbox.has-selected-signal" },
  { label: "signal console layout", selector: ".desktop-signal-inbox.has-selected-signal .signal-console-layout" },
  { label: "signal detail panel", selector: ".desktop-signal-inbox.has-selected-signal .signal-detail-column.panel" },
  { label: "signal detail column", selector: ".desktop-signal-inbox.has-selected-signal .signal-detail-column" },
  { label: "review progress rail", selector: ".review-progress-rail" },
  { label: "review progress step", selector: ".review-progress-step" },
  { label: "review progress copy", selector: ".review-progress-copy" },
  { label: "review primary sections", selector: ".review-primary-sections" },
  { label: "original signal section", selector: ".original-signal-section" },
  { label: "original signal body", selector: ".original-signal-body-block" },
  { label: "answer line", selector: ".answer-line" },
  { label: "review session modal", selector: ".review-session-modal" },
  { label: "review session shell", selector: ".review-session-shell" },
  { label: "review session stage", selector: ".review-session-stage" },
  { label: "review read panel", selector: ".review-session-read-panel" },
  { label: "review answer card", selector: ".review-session-answer-card" },
  { label: "signal timeline section", selector: ".signal-timeline-section" },
  { label: "signal timeline card", selector: ".signal-timeline-card" },
];

function shouldLogReviewLayoutDiagnostics() {
  return new URLSearchParams(window.location.search).has("reviewLayoutDebug");
}

function createSnapshot({ label, selector }: { label: string; selector: string }): ReviewLayoutSnapshot | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return {
    label,
    selector,
    className: element.className,
    rectWidth: Math.round(rect.width * 100) / 100,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    offsetWidth: element.offsetWidth,
    minWidth: styles.minWidth,
    maxWidth: styles.maxWidth,
    width: styles.width,
    display: styles.display,
    gridTemplateColumns: styles.gridTemplateColumns,
    flex: styles.flex,
    overflowX: styles.overflowX,
    overflowY: styles.overflowY,
    transform: styles.transform,
  };
}

export function logReviewLayoutDiagnostics(reason: string) {
  if (typeof window === "undefined" || !shouldLogReviewLayoutDiagnostics()) {
    return;
  }

  const snapshots = REVIEW_LAYOUT_SELECTORS.map(createSnapshot).filter(
    (snapshot): snapshot is ReviewLayoutSnapshot => Boolean(snapshot),
  );
  const narrowest = snapshots.reduce<ReviewLayoutSnapshot | null>(
    (current, snapshot) => (!current || snapshot.rectWidth < current.rectWidth ? snapshot : current),
    null,
  );

  console.groupCollapsed(`[DeepSignal review layout] ${reason}`);
  console.table(snapshots);
  console.info("Narrowest measured review container", narrowest);
  console.info("Viewport", {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewportWidth: window.visualViewport?.width,
    visualViewportHeight: window.visualViewport?.height,
    devicePixelRatio: window.devicePixelRatio,
  });
  console.groupEnd();
}
