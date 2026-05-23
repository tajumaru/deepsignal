import { lazy, Suspense, useState, type DragEvent } from "react";
import { FormHeaderImage } from "../../../components/FormHeaderImage";
import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import type { FormHeaderImagePosition, ResponseDeadlinePreset, Translate } from "../types";
import { StepNavigationActions } from "./StepNavigationActions";

const MAX_HEADER_IMAGE_BYTES = 2 * 1024 * 1024;
type HeaderAssetSource = "upload" | "url";

const RichTextEditor = lazy(() =>
  import("../../../components/RichTextEditor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

interface InfoStepProps {
  t: Translate;
  title: string;
  description: string;
  identityPolicy: "anonymous_allowed" | "wallet_required";
  locationRequirement: "optional" | "required";
  encryptSubmissions: boolean;
  headerImage: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source: "url" | "upload";
    fileName: string;
  };
  headerLogo: {
    url: string;
    alt: string;
    source: "url" | "upload";
    fileName: string;
  };
  responseDeadlinePreset: ResponseDeadlinePreset;
  responseDeadlineCustomAt: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setHeaderImage: (value: {
    url: string;
    alt: string;
    position: FormHeaderImagePosition;
    source: "url" | "upload";
    fileName: string;
  }) => void;
  setHeaderLogo: (value: {
    url: string;
    alt: string;
    source: "url" | "upload";
    fileName: string;
  }) => void;
  setResponseDeadlinePreset: (value: ResponseDeadlinePreset) => void;
  setResponseDeadlineCustomAt: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function InfoStep({
  t,
  title,
  description,
  identityPolicy,
  locationRequirement,
  encryptSubmissions,
  headerImage,
  headerLogo,
  responseDeadlinePreset,
  responseDeadlineCustomAt,
  setTitle,
  setDescription,
  setHeaderImage,
  setHeaderLogo,
  setResponseDeadlinePreset,
  setResponseDeadlineCustomAt,
  onBack,
  onContinue,
}: InfoStepProps) {
  const deadlineOptions: Array<{ value: ResponseDeadlinePreset; label: string }> = [
    { value: "none", label: t("responseDeadlineNone") },
    { value: "1h", label: t("responseDeadlineOneHour") },
    { value: "24h", label: t("responseDeadlineTwentyFourHours") },
    { value: "7d", label: t("responseDeadlineSevenDays") },
    { value: "30d", label: t("responseDeadlineThirtyDays") },
    { value: "custom", label: t("responseDeadlineCustom") },
  ];

  function handleHeaderImageUpload(file: File | undefined) {
    readHeaderAsset(file, {
      currentAlt: headerImage.alt,
      onLoad: (result, fileName, alt) =>
        setHeaderImage({
          ...headerImage,
          url: result,
          source: "upload",
          fileName,
          alt,
        }),
    });
  }

  function handleHeaderLogoUpload(file: File | undefined) {
    readHeaderAsset(file, {
      currentAlt: headerLogo.alt,
      onLoad: (result, fileName, alt) =>
        setHeaderLogo({
          ...headerLogo,
          url: result,
          source: "upload",
          fileName,
          alt,
        }),
    });
  }

  function setHeaderImageSource(source: HeaderAssetSource) {
    setHeaderImage({
      ...headerImage,
      source,
      fileName: source === "url" ? "" : headerImage.fileName,
    });
  }

  function setHeaderLogoSource(source: HeaderAssetSource) {
    setHeaderLogo({
      ...headerLogo,
      source,
      fileName: source === "url" ? "" : headerLogo.fileName,
    });
  }

  function readHeaderAsset(
    file: File | undefined,
    args: {
      currentAlt: string;
      onLoad: (result: string, fileName: string, alt: string) => void;
    },
  ) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      window.alert(t("headerImageUploadImageOnly"));
      return;
    }
    if (file.size > MAX_HEADER_IMAGE_BYTES) {
      window.alert(t("headerImageUploadTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }
      args.onLoad(reader.result, file.name, args.currentAlt || file.name.replace(/\.[^.]+$/, ""));
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="panel composer-section-card composer-step-card">
      <div className="section-row">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>{t("basicInfoTitle")}</h2>
          <p className="muted">{t("infoStepBody")}</p>
        </div>
      </div>

      <section className="contest-builder-quickstart contest-builder-quickstart-plain">
        <div className="section-row">
          <div>
            <p className="eyebrow">{t("contestDefaultsEyebrow")}</p>
            <h3>{t("signalPostureTitle")}</h3>
          </div>
          <div className="signal-type-posture-row" aria-label={t("signalPostureTitle")}>
            <span className="signal-chip signal-chip-accent">{encryptSubmissions ? "Seal on" : "Open"}</span>
            <span className="signal-chip">{identityPolicy === "wallet_required" ? t("verificationRequired") : t("verificationOptional")}</span>
            <span className="signal-chip">{locationRequirement === "required" ? t("locationRequirementRequired") : t("locationRequirementOptional")}</span>
          </div>
        </div>
        <p className="muted">{t("signalPostureBody")}</p>
      </section>

      <div className="composer-info-grid">
        <label>
          <span>{t("formTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="composer-info-intro">
          <span>{t("description")}</span>
          <Suspense
            fallback={
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("builderDescriptionPlaceholder")}
                rows={6}
              />
            }
          >
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder={t("builderDescriptionPlaceholder")}
            />
          </Suspense>
        </label>

        <section className="composer-header-image-card signal-identity-builder">
          <div className="section-row signal-identity-heading">
            <div>
              <p className="eyebrow">{t("signalIdentityEyebrow")}</p>
              <span>{t("headerImageTitle")}</span>
              <p className="muted">{t("headerImageHelp")}</p>
            </div>
            <span className="signal-chip signal-chip-accent">{t("signalIdentityLivePreview")}</span>
          </div>

          <div className="signal-identity-layout">
            <div className="signal-preview-stage" aria-live="polite">
              <FormHeaderImage
                key={`${headerImage.url}-${headerLogo.url}-${headerImage.position}`}
                image={headerImage}
                logo={headerLogo}
                className="composer-header-image-inline-preview"
                fallbackTitle={title}
              />
              <div className="signal-preview-shimmer" aria-hidden="true" />
            </div>

            <div className="signal-identity-controls">
              <section className="signal-asset-panel">
                <div className="signal-asset-heading">
                  <div className="signal-asset-heading-row">
                    <strong>{t("signalCoverTitle")}</strong>
                    {headerImage.url ? (
                      <button
                        type="button"
                        className="ghost-button signal-asset-clear-button"
                        onClick={() =>
                          setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" })
                        }
                      >
                        {t("headerImageClear")}
                      </button>
                    ) : null}
                  </div>
                  <small>{t("signalCoverHelp")}</small>
                </div>

                <SourceSegmentedControl
                  t={t}
                  label={t("signalCoverSourceLabel")}
                  value={headerImage.source}
                  onChange={setHeaderImageSource}
                />

                {headerImage.source === "upload" ? (
                  <HeaderAssetDropzone
                    t={t}
                    label={t("headerImageUpload")}
                    helper={
                      headerImage.fileName
                        ? t("headerImageUploadedFile", { name: headerImage.fileName })
                        : t("signalCoverUploadHelp")
                    }
                    onSelect={handleHeaderImageUpload}
                  />
                ) : (
                  <label>
                    <span>{t("headerImageUrl")}</span>
                    <input
                      type="url"
                      value={headerImage.url}
                      placeholder="https://example.com/cover.jpg"
                      onChange={(event) =>
                        setHeaderImage({
                          ...headerImage,
                          url: event.target.value,
                          source: "url",
                          fileName: "",
                        })
                      }
                    />
                  </label>
                )}

                <div className="signal-asset-grid">
                  <label>
                    <span>{t("headerImageAlt")}</span>
                    <input
                      value={headerImage.alt}
                      placeholder={t("headerImageAltPlaceholder")}
                      onChange={(event) => setHeaderImage({ ...headerImage, alt: event.target.value })}
                    />
                    <small className="muted">{t("headerImageAltHelp")}</small>
                  </label>
                  <fieldset className="signal-position-field">
                    <legend>{t("headerImagePosition")}</legend>
                    <div className="signal-position-selector">
                      {(["top", "center", "bottom"] as FormHeaderImagePosition[]).map((position) => (
                        <button
                          key={position}
                          type="button"
                          className={headerImage.position === position ? "is-active" : ""}
                          aria-pressed={headerImage.position === position}
                          onClick={() => setHeaderImage({ ...headerImage, position })}
                        >
                          <span className={`position-glyph position-glyph-${position}`} aria-hidden="true">
                            <i />
                          </span>
                          {position === "top"
                            ? t("imagePositionTop")
                            : position === "bottom"
                              ? t("imagePositionBottom")
                              : t("imagePositionCenter")}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </section>
            </div>
          </div>

          <section className="composer-header-logo-card signal-asset-panel signal-logo-panel">
            <div className="section-row">
              <div>
                <div className="signal-asset-heading-row">
                  <strong>{t("headerLogoTitle")}</strong>
                  {headerLogo.url ? (
                    <button
                      type="button"
                      className="ghost-button signal-asset-clear-button"
                      onClick={() => setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" })}
                    >
                      {t("headerLogoClear")}
                    </button>
                  ) : null}
                </div>
                <p className="muted">{t("headerLogoHelp")}</p>
              </div>
            </div>

            <SourceSegmentedControl
              t={t}
              label={t("signalLogoSourceLabel")}
              value={headerLogo.source}
              onChange={setHeaderLogoSource}
            />

            <div className="composer-header-logo-grid">
              {headerLogo.source === "upload" ? (
                <HeaderAssetDropzone
                  t={t}
                  label={t("headerLogoUpload")}
                  helper={
                    headerLogo.fileName
                      ? t("headerImageUploadedFile", { name: headerLogo.fileName })
                      : t("signalLogoUploadHelp")
                  }
                  onSelect={handleHeaderLogoUpload}
                />
              ) : (
                <label>
                  <span>{t("headerLogoUrl")}</span>
                  <input
                    type="url"
                    value={headerLogo.url}
                    placeholder="https://example.com/logo.png"
                    onChange={(event) =>
                      setHeaderLogo({
                        ...headerLogo,
                        url: event.target.value,
                        source: "url",
                        fileName: "",
                      })
                    }
                  />
                </label>
              )}
              <label>
                <span>{t("headerLogoAlt")}</span>
                <input
                  value={headerLogo.alt}
                  placeholder={t("headerLogoAltPlaceholder")}
                  onChange={(event) => setHeaderLogo({ ...headerLogo, alt: event.target.value })}
                />
                <small className="muted">{t("headerImageAltHelp")}</small>
              </label>
            </div>

          </section>
        </section>

        <section className="composer-deadline-card">
          <div className="section-row">
            <div>
              <span>{t("responseDeadlineTitle")}</span>
              <p className="muted">{t("responseDeadlineHelp")}</p>
              <p className="muted">{t("responseDeadlineAdminHelp")}</p>
            </div>
          </div>

          <label>
            <span>{t("responseDeadlineLabel")}</span>
            <select
              value={responseDeadlinePreset}
              onChange={(event) => {
                const nextPreset = event.target.value as ResponseDeadlinePreset;
                setResponseDeadlinePreset(nextPreset);
                if (nextPreset === "custom" && !responseDeadlineCustomAt) {
                  setResponseDeadlineCustomAt(toDateTimeLocalValue(Date.now() + 60 * 60 * 1000));
                }
              }}
            >
              {deadlineOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {responseDeadlinePreset === "custom" ? (
            <label>
              <span>{t("responseDeadlineCustomAt")}</span>
              <input
                type="datetime-local"
                value={responseDeadlineCustomAt}
                min={toDateTimeLocalValue(Date.now() + 60 * 1000)}
                onChange={(event) => setResponseDeadlineCustomAt(event.target.value)}
              />
            </label>
          ) : null}
        </section>
      </div>

      <StepNavigationActions t={t} onBack={onBack} onContinue={onContinue} />
    </section>
  );
}

interface SourceSegmentedControlProps {
  t: Translate;
  label: string;
  value: HeaderAssetSource;
  onChange: (source: HeaderAssetSource) => void;
}

function SourceSegmentedControl({ t, label, value, onChange }: SourceSegmentedControlProps) {
  return (
    <div className="signal-source-control" role="group" aria-label={label}>
      {(["upload", "url"] as HeaderAssetSource[]).map((source) => (
        <button
          key={source}
          type="button"
          className={value === source ? "is-active" : ""}
          aria-pressed={value === source}
          onClick={() => onChange(source)}
        >
          {source === "upload" ? t("signalSourceUpload") : t("signalSourceUrl")}
        </button>
      ))}
    </div>
  );
}

interface HeaderAssetDropzoneProps {
  t: Translate;
  label: string;
  helper: string;
  onSelect: (file: File | undefined) => void;
}

function HeaderAssetDropzone({ t, label, helper, onSelect }: HeaderAssetDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    onSelect(event.dataTransfer.files[0]);
  }

  return (
    <label
      className={`signal-upload-zone ${isDragging ? "is-dragging" : ""}`}
      tabIndex={0}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.querySelector("input")?.click();
        }
      }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          onSelect(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <span className="signal-upload-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 16V5m0 0 4 4m-4-4L8 9m-3 9h14" />
        </svg>
      </span>
      <span className="signal-upload-copy">
        <strong>{label}</strong>
        <span>{t("signalUploadDropHint")}</span>
        <small>{helper}</small>
      </span>
    </label>
  );
}
