import type { CSSProperties } from "react";
import { useI18n } from "../../../../i18n";
import { EMOTION_SCALE_OPTIONS } from "../../../../lib/emotionScale";
import { isLongTextLikeField } from "../../../../lib/fieldTypes";
import type { MirrorPreviewState } from "./types";
import { getFieldPreviewHint, getNodePreviewArtifacts, mediaFieldTypes } from "./utils";

export function MirrorCurrentSignalNode({ state }: { state: MirrorPreviewState }) {
  const { fieldTypeLabel, t } = useI18n();
  const field = state.activeField;
  const label = field?.label?.trim() || t("askPlaceholder");
  const hint = getFieldPreviewHint(field, t("placeholderExample"));
  const { options, matrixRows, matrixColumns } = getNodePreviewArtifacts(field);
  const previewRows = matrixRows.length ? matrixRows : [t("mirrorMatrixRowSignalQuality"), t("mirrorMatrixRowUrgency")];
  const previewColumns = matrixColumns.length ? matrixColumns : [t("mirrorMatrixColumnLow"), t("mirrorMatrixColumnMedium"), t("mirrorMatrixColumnHigh")];

  if (!field) {
    return (
      <section className="mirror-current-node-card is-empty">
        <div className="mirror-empty-constellation" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="eyebrow">{t("mirrorEmptySignalEyebrow")}</p>
          <h3>{t("mirrorEmptySignalTitle")}</h3>
          <p className="muted">{t("mirrorEmptySignalBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section key={field.id} className="mirror-current-node-card is-reflecting">
      <div className="mirror-current-node-header">
        <div>
          <p className="eyebrow">{t("mirrorCurrentSignalNode")}</p>
          <h3>{label}</h3>
        </div>
        <span className="mirror-reflecting-pill">{t("mirrorReflectingNow")}</span>
      </div>

      <div className="mirror-current-node-grid">
        <span>
          <small>{t("mirrorNodeLabel")}</small>
          <strong>{t("mirrorNodeIndex", { index: state.activeFieldIndex + 1 })}</strong>
        </span>
        <span>
          <small>{t("mirrorBlockType")}</small>
          <strong>{fieldTypeLabel(field.type)}</strong>
        </span>
        <span>
          <small>{t("mirrorRequirement")}</small>
          <strong>{field.required ? t("required") : t("optional")}</strong>
        </span>
        <span>
          <small>{t("mirrorSectionLabel")}</small>
          <strong>{state.activeSectionName}</strong>
        </span>
      </div>

      <div className="mirror-current-node-body">
        <div>
          <small>{t("mirrorPlaceholderHelperText")}</small>
          <p>{hint}</p>
        </div>
        <div>
          <small>{t("mirrorBranchPath")}</small>
          <p>{state.activeBranchInfo}</p>
        </div>
      </div>

      <div className="mirror-question-frame">
        <div className="mirror-question-frame-topline">
          <span>{state.markdownSupported ? t("mirrorMarkdownSupported") : t("mirrorPlainInput")}</span>
          <span>{state.mediaSupported ? t("mirrorMediaSupported") : t("mirrorNoMedia")}</span>
          <span>{state.hasConditionalLogic ? t("mirrorAdaptivePath") : t("mirrorLinearNode")}</span>
        </div>
        {field.helpText?.trim() ? <p className="muted">{field.helpText.trim()}</p> : null}

        {field.type === "dropdown" || field.type === "checkbox" ? (
          <div className="mirror-choice-list">
            {(options.length ? options : [t("mirrorOptionOne"), t("mirrorOptionTwo")]).slice(0, 4).map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
        ) : null}

        {field.type === "matrix" ? (
          <div className="mirror-matrix-preview" aria-hidden="true">
            <div className="mirror-matrix-preview-row is-header">
              <span />
              {previewColumns.slice(0, 3).map((column) => (
                <strong key={column}>{column}</strong>
              ))}
            </div>
            {previewRows.slice(0, 3).map((row) => (
              <div key={row} className="mirror-matrix-preview-row">
                <span>{row}</span>
                {previewColumns.slice(0, 3).map((column) => (
                  <i key={column} />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {field.type === "rating" ? (
          <div className="mirror-rating-preview" aria-hidden="true">
            <span>*****</span>
            <small>{t("chooseRating")}</small>
          </div>
        ) : null}

        {field.type === "emotionRating" ? (
          <div className="mirror-emotion-preview" aria-hidden="true">
            <div className="composer-emotion-signal-preview">
              {EMOTION_SCALE_OPTIONS.map((option) => (
                <span key={option.value} data-tone={option.value} style={{ "--emotion-accent": option.accent } as CSSProperties} />
              ))}
            </div>
            <small>{t("chooseEmotionRating")}</small>
          </div>
        ) : null}

        {mediaFieldTypes.includes(field.type as (typeof mediaFieldTypes)[number]) ? (
          <div className="mirror-upload-preview is-media-ready">
            <span className="mirror-upload-icon" aria-hidden="true" />
            <strong>
              {field.type === "screenshot" ? t("fieldTypeScreenshot") : field.type === "video" ? t("fieldTypeVideo") : t("fieldTypeVoice")}
            </strong>
            <small>
              {field.type === "screenshot"
                ? t("screenshotHint")
                : field.type === "video"
                  ? t("videoHint")
                  : t("mirrorVoiceHint")}
            </small>
          </div>
        ) : null}

        {field.type !== "dropdown" &&
        field.type !== "checkbox" &&
        field.type !== "matrix" &&
        field.type !== "rating" &&
        field.type !== "emotionRating" &&
        !mediaFieldTypes.includes(field.type as (typeof mediaFieldTypes)[number]) ? (
          <div className={`mirror-input-preview ${isLongTextLikeField(field.type) ? "is-long" : ""}`}>
            <span>{field.type === "markdown" ? t("markdownPreviewExample") : hint}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
