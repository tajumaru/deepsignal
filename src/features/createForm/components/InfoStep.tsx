import { lazy, Suspense } from "react";
import { FormHeaderImage } from "../../../components/FormHeaderImage";
import { toDateTimeLocalValue } from "../../../lib/responseDeadline";
import type { FormHeaderImagePosition, ResponseDeadlinePreset, Translate } from "../types";

const MAX_HEADER_IMAGE_BYTES = 2 * 1024 * 1024;

const RichTextEditor = lazy(() =>
  import("../../../components/RichTextEditor").then((module) => ({
    default: module.RichTextEditor,
  })),
);

interface InfoStepProps {
  t: Translate;
  title: string;
  description: string;
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
            <h3>{t("privateSignalReady")}</h3>
          </div>
          <span className="signal-chip signal-chip-accent">{t("encryptSubmissionsOn")}</span>
        </div>
        <p className="muted">{t("contestDefaultsBody")}</p>
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

        <section className="composer-header-image-card">
          <div className="section-row">
            <div>
              <span>{t("headerImageTitle")}</span>
              <p className="muted">{t("headerImageHelp")}</p>
            </div>
          </div>

          <FormHeaderImage
            image={headerImage}
            logo={headerLogo}
            className="composer-header-image-inline-preview"
            fallbackTitle={title}
          />

          <label className="composer-header-upload-control">
            <span>{t("headerImageUpload")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                handleHeaderImageUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <small className="muted">
              {headerImage.source === "upload" && headerImage.fileName
                ? t("headerImageUploadedFile", { name: headerImage.fileName })
                : t("headerImageDefaultHelp")}
            </small>
          </label>

          <div className="composer-header-image-grid">
            <label>
              <span>{t("headerImageUrl")}</span>
              <input
                type="url"
                value={headerImage.source === "upload" ? "" : headerImage.url}
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
            <label>
              <span>{t("headerImageAlt")}</span>
              <input
                value={headerImage.alt}
                placeholder={t("headerImageAltPlaceholder")}
                onChange={(event) => setHeaderImage({ ...headerImage, alt: event.target.value })}
              />
            </label>
            <label>
              <span>{t("headerImagePosition")}</span>
              <select
                value={headerImage.position}
                onChange={(event) =>
                  setHeaderImage({ ...headerImage, position: event.target.value as FormHeaderImagePosition })
                }
              >
                <option value="center">{t("imagePositionCenter")}</option>
                <option value="top">{t("imagePositionTop")}</option>
                <option value="bottom">{t("imagePositionBottom")}</option>
              </select>
            </label>
          </div>

          {headerImage.url ? (
            <button
              type="button"
              className="ghost-button composer-header-image-clear"
              onClick={() =>
                setHeaderImage({ url: "", alt: "", position: "center", source: "url", fileName: "" })
              }
            >
              {t("headerImageUseDefault")}
            </button>
          ) : null}

          <section className="composer-header-logo-card">
            <div className="section-row">
              <div>
                <span>{t("headerLogoTitle")}</span>
                <p className="muted">{t("headerLogoHelp")}</p>
              </div>
            </div>

            <label className="composer-header-upload-control">
              <span>{t("headerLogoUpload")}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  handleHeaderLogoUpload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <small className="muted">
                {headerLogo.source === "upload" && headerLogo.fileName
                  ? t("headerImageUploadedFile", { name: headerLogo.fileName })
                  : t("headerLogoDefaultHelp")}
              </small>
            </label>

            <div className="composer-header-logo-grid">
              <label>
                <span>{t("headerLogoUrl")}</span>
                <input
                  type="url"
                  value={headerLogo.source === "upload" ? "" : headerLogo.url}
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
              <label>
                <span>{t("headerLogoAlt")}</span>
                <input
                  value={headerLogo.alt}
                  placeholder={t("headerLogoAltPlaceholder")}
                  onChange={(event) => setHeaderLogo({ ...headerLogo, alt: event.target.value })}
                />
              </label>
            </div>

            {headerLogo.url ? (
              <button
                type="button"
                className="ghost-button composer-header-image-clear"
                onClick={() => setHeaderLogo({ url: "", alt: "", source: "url", fileName: "" })}
              >
                {t("headerLogoUseDefault")}
              </button>
            ) : null}
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

      <div className="composer-step-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className="primary-button" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
