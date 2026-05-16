import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { demoForm, demoSubmissions, createDemoLiveSubmission, seedDemoWorkspace } from "../demo/demoData";
import { buildExportMetadata, exportResponsesToCsv } from "../lib/exportResponses";
import { localStorageAdapter } from "../storage/localStorageAdapter";
import type { Submission } from "../types";

type DemoStepId =
  | "create"
  | "questions"
  | "publish"
  | "public"
  | "submit"
  | "inbox"
  | "export";

const demoSteps: Array<{ id: DemoStepId; label: string; title: string }> = [
  { id: "create", label: "Create Signal", title: "Draft a Walrus-native signal channel" },
  { id: "questions", label: "Add questions", title: "Shape the form without slowing responders" },
  { id: "publish", label: "Publish", title: "Publish with local demo fallback ready" },
  { id: "public", label: "Open public form", title: "Open a wallet-optional public route" },
  { id: "submit", label: "Submit response", title: "Submit without waiting on wallet prompts" },
  { id: "inbox", label: "View in SignalInbox", title: "Review the encrypted signal queue" },
  { id: "export", label: "Export CSV", title: "Export operator-ready evidence" },
];

const demoAnswer =
  "We need a privacy-safe way to collect beta feedback, triage it quickly, and export the reviewed signals for launch planning.";

const quickQuestionSeeds = [
  "What should we understand first?",
  "Where does this feel blocked?",
  "What would a better outcome look like?",
];

function DemoStatusRail({ activeStep, onSelectStep }: { activeStep: DemoStepId; onSelectStep: (step: DemoStepId) => void }) {
  const activeIndex = demoSteps.findIndex((step) => step.id === activeStep);

  return (
    <nav className="demo-flow-rail" aria-label="Demo flow">
      {demoSteps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className={index === activeIndex ? "is-active" : index < activeIndex ? "is-complete" : ""}
          onClick={() => onSelectStep(step.id)}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
        </button>
      ))}
    </nav>
  );
}

function DemoBuilderPreview({
  activeStep,
  signalIntent,
  questionDraft,
  questions,
  onSignalIntentChange,
  onQuestionDraftChange,
  onAddQuestion,
}: {
  activeStep: DemoStepId;
  signalIntent: string;
  questionDraft: string;
  questions: string[];
  onSignalIntentChange: (value: string) => void;
  onQuestionDraftChange: (value: string) => void;
  onAddQuestion: (question?: string) => void;
}) {
  const isQuestions = activeStep === "questions";
  const isPublish = activeStep === "publish";
  const title = signalIntent.trim() || "Untitled Signal";

  return (
    <section className="demo-stage-panel demo-builder-preview demo-builder-creative" aria-label="Demo builder preview">
      <div className="demo-panel-topline">
        <span>Create Signal</span>
        <strong>{isPublish ? "Ready to publish" : questions.length ? `${questions.length} question${questions.length === 1 ? "" : "s"}` : "Blank canvas"}</strong>
      </div>
      <div className="demo-creative-grid">
        <div className="demo-blank-composer">
          <label className="demo-big-intent">
            <span>What do you want to collect?</span>
            <textarea
              value={signalIntent}
              onChange={(event) => onSignalIntentChange(event.target.value)}
              placeholder="Private beta feedback"
              rows={3}
            />
          </label>

          <div className={`demo-first-question ${isQuestions ? "is-active" : ""}`}>
            <label>
              <span>Add the first question</span>
              <input
                value={questionDraft}
                onChange={(event) => onQuestionDraftChange(event.target.value)}
                placeholder="What should we understand first?"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddQuestion();
                  }
                }}
              />
            </label>
            <button type="button" className="primary-button" onClick={() => onAddQuestion()}>
              Add question
            </button>
          </div>

          <div className="demo-question-seeds" aria-label="Fast question starters">
            {quickQuestionSeeds.map((question) => (
              <button key={question} type="button" onClick={() => onAddQuestion(question)}>
                {question}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-live-preview">
          <div className="demo-live-preview-top">
            <span>Live public preview</span>
            <strong>{questions.length ? "Building" : "Waiting for first question"}</strong>
          </div>
          <article className="demo-live-form">
            <p className="eyebrow">Signal</p>
            <h3>{title}</h3>
            <p>
              {questions.length
                ? "A wallet-optional signal channel is forming as you type."
                : "Start from a blank page. One question is enough."}
            </p>
            <div className={`demo-live-question-list ${questions.length === 0 ? "is-empty" : ""}`}>
              {questions.length === 0 ? (
                <div className="demo-live-empty-card">
                  <span aria-hidden="true">+</span>
                  <strong>Add a question to create the signal</strong>
                </div>
              ) : (
                questions.map((question, index) => (
                  <label key={`${question}-${index}`} className={index === questions.length - 1 ? "is-new" : ""}>
                    <span>{question}</span>
                    <textarea readOnly value={index === 0 ? demoAnswer : ""} placeholder="Responder answer..." />
                  </label>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
      {isPublish ? (
        <div className="demo-publish-card">
          <span className="demo-live-dot" />
          <div>
            <strong>Published locally for capture</strong>
            <p>Walrus and wallet calls use mock-ready fallback in Demo Mode.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DemoPublicFormPreview({
  submitted,
  onSubmit,
}: {
  submitted: boolean;
  onSubmit: () => void;
}) {
  return (
    <section className="demo-stage-panel demo-public-preview" aria-label="Demo public form preview">
      <div className="demo-panel-topline">
        <span>/f/{demoForm.id}</span>
        <strong>Wallet optional</strong>
      </div>
      <div className="demo-public-card">
        <p className="eyebrow">Public signal form</p>
        <h3>{demoForm.title}</h3>
        <p>{demoForm.description}</p>
        <label>
          {demoForm.fields[0]?.label}
          <textarea readOnly value={demoAnswer} />
        </label>
        <div className="demo-public-row">
          <span>Anonymous responder</span>
          <span>Seal-ready private field</span>
          <span>Local fallback active</span>
        </div>
        <button type="button" className="primary-button" onClick={onSubmit} disabled={submitted}>
          {submitted ? "Response submitted" : "Submit response"}
        </button>
      </div>
    </section>
  );
}

function DemoInboxPreview({ submissions }: { submissions: Submission[] }) {
  const selected = submissions[0] ?? demoSubmissions[0];
  const unreadCount = submissions.filter((submission) => submission.status === "unread").length;
  const encryptedCount = submissions.filter((submission) => submission.isEncrypted).length;

  return (
    <section className="demo-stage-panel demo-inbox-preview" aria-label="Demo SignalInbox preview">
      <div className="demo-panel-topline">
        <span>Encrypted Signal Inbox</span>
        <strong>{submissions.length} signals</strong>
      </div>
      <div className="demo-inbox-grid">
        <aside className="demo-inbox-streams">
          <button type="button" className="is-active">All signals <span>{submissions.length}</span></button>
          <button type="button">Unread <span>{unreadCount}</span></button>
          <button type="button">Encrypted <span>{encryptedCount}</span></button>
          <button type="button">High value <span>{submissions.filter((item) => item.priority === "high").length}</span></button>
        </aside>
        <div className="demo-inbox-list">
          {submissions.slice(0, 4).map((submission) => (
            <article key={submission.id} className={submission.id === selected.id ? "is-selected" : ""}>
              <div>
                <strong>{submission.subjectPreview ?? submission.aiSummary ?? "Private signal"}</strong>
                <p>{submission.isEncrypted ? "Encrypted payload waiting for authorized review" : submission.aiSummary}</p>
              </div>
              <span>{submission.triageStatus.replace("_", " ")}</span>
            </article>
          ))}
        </div>
        <div className="demo-inbox-detail">
          <p className="eyebrow">Selected signal</p>
          <h3>{selected.subjectPreview ?? "Sensitive enterprise feedback"}</h3>
          <p>{selected.isEncrypted ? "Mock unlock is ready for the video. No wallet prompt blocks the shot." : selected.aiSummary}</p>
          <div className="demo-signal-tags">
            <span>{selected.priority} priority</span>
            <span>{selected.isEncrypted ? "Seal protected" : "Readable"}</span>
            <span>{selected.blobId ?? selected.encryptedBlobId}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DemoModePage() {
  const [activeStep, setActiveStep] = useState<DemoStepId>("create");
  const [submissions, setSubmissions] = useState<Submission[]>(demoSubmissions);
  const [submitted, setSubmitted] = useState(false);
  const [exportState, setExportState] = useState("Ready");
  const [signalIntent, setSignalIntent] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const activeStepMeta = demoSteps.find((step) => step.id === activeStep) ?? demoSteps[0];
  const activeIndex = demoSteps.findIndex((step) => step.id === activeStep);
  const progress = useMemo(() => Math.round(((activeIndex + 1) / demoSteps.length) * 100), [activeIndex]);

  useEffect(() => {
    void seedDemoWorkspace();
  }, []);

  async function handleSubmitDemoResponse() {
    if (submitted) {
      return;
    }
    const liveSubmission = createDemoLiveSubmission(demoAnswer);
    setSubmissions((current) => [liveSubmission, ...current]);
    setSubmitted(true);
    await localStorageAdapter.saveSubmission(liveSubmission);
    setActiveStep("inbox");
  }

  function handleExportCsv() {
    const metadata = buildExportMetadata(demoForm, submissions, {
      scope: "all",
      exportedBy: "Demo Mode",
      filterSnapshot: { status: "all" },
    });
    const result = exportResponsesToCsv(demoForm, submissions, {
      scope: "all",
      exportedBy: "Demo Mode",
      metadata,
      sortOrder: "createdAtDesc",
    });
    setExportState(`${result.responseCount} rows exported`);
  }

  function handleNextStep() {
    if (activeStep === "create" && questions.length === 0) {
      handleAddQuestion(questionDraft || quickQuestionSeeds[0]);
    }
    const nextStep = demoSteps[Math.min(activeIndex + 1, demoSteps.length - 1)];
    setActiveStep(nextStep.id);
  }

  function handleAddQuestion(question = questionDraft) {
    const nextQuestion = question.trim() || quickQuestionSeeds[0];
    setQuestions((current) => (current.includes(nextQuestion) ? current : [...current, nextQuestion]));
    setQuestionDraft("");
    setActiveStep("questions");
  }

  const showPublicPreview = activeStep === "public" || activeStep === "submit";
  const showInboxPreview = activeStep === "inbox" || activeStep === "export";

  return (
    <section className="demo-mode-shell">
      <header className="demo-hero">
        <div className="demo-hero-copy">
          <p className="eyebrow">Contest recording mode</p>
          <h1>DeepSignal demo run</h1>
          <p>
            A 60-90 second path from creating a signal form to reviewing private feedback and exporting CSV.
          </p>
          <div className="demo-hero-actions">
            <button type="button" className="primary-button" onClick={handleNextStep}>
              {activeStep === "export" ? "Demo ready" : `Next: ${demoSteps[Math.min(activeIndex + 1, demoSteps.length - 1)].label}`}
            </button>
            <Link className="ghost-button" to={`/f/${demoForm.id}?demo=1`}>
              Open public form
            </Link>
            <Link className="ghost-button" to="/dashboard?demo=1">
              Open SignalInbox
            </Link>
          </div>
        </div>
        <div className="demo-hero-status">
          <span>{progress}%</span>
          <strong>{activeStepMeta.label}</strong>
          <p>{activeStepMeta.title}</p>
        </div>
      </header>

      <div className="demo-console">
        <DemoStatusRail activeStep={activeStep} onSelectStep={setActiveStep} />

        <div className="demo-stage">
          <div className="demo-stage-heading">
            <div>
              <p className="eyebrow">{activeStepMeta.label}</p>
              <h2>{activeStepMeta.title}</h2>
            </div>
            <div className="demo-mock-status">
              <span>Wallet mock: verified</span>
              <span>Walrus fallback: local</span>
              <span>Seal state: demo unlock</span>
            </div>
          </div>

          {showInboxPreview ? (
            <DemoInboxPreview submissions={submissions} />
          ) : showPublicPreview ? (
            <DemoPublicFormPreview submitted={submitted} onSubmit={handleSubmitDemoResponse} />
          ) : (
            <DemoBuilderPreview
              activeStep={activeStep}
              signalIntent={signalIntent}
              questionDraft={questionDraft}
              questions={questions}
              onSignalIntentChange={setSignalIntent}
              onQuestionDraftChange={setQuestionDraft}
              onAddQuestion={handleAddQuestion}
            />
          )}

          <div className="demo-stage-actions">
            {activeStep === "submit" ? (
              <button type="button" className="primary-button" onClick={handleSubmitDemoResponse} disabled={submitted}>
                {submitted ? "Response captured" : "Submit response"}
              </button>
            ) : null}
            {activeStep === "export" ? (
              <button type="button" className="primary-button" onClick={handleExportCsv}>
                Export CSV
              </button>
            ) : null}
            <span>{activeStep === "export" ? exportState : "No external network call required"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
