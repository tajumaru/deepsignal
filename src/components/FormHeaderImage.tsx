import { useEffect, useState } from "react";
import type { FormHeaderImage as FormHeaderImageConfig, FormHeaderLogo } from "../types";

interface FormHeaderImageProps {
  image?: FormHeaderImageConfig;
  logo?: FormHeaderLogo;
  className?: string;
  fallbackTitle?: string;
  signalId?: string;
}

export function FormHeaderImage({ image, logo, className = "", signalId }: FormHeaderImageProps) {
  const url = image?.url.trim();
  const logoUrl = logo?.url.trim();
  const [failedUrl, setFailedUrl] = useState("");
  const [failedLogoUrl, setFailedLogoUrl] = useState("");
  const position = image?.position ?? "center";
  const showImage = Boolean(url && failedUrl !== url);
  const showLogoImage = Boolean(logoUrl && failedLogoUrl !== logoUrl);

  useEffect(() => {
    setFailedUrl("");
  }, [url]);

  useEffect(() => {
    setFailedLogoUrl("");
  }, [logoUrl]);

  return (
    <figure
      className={`form-header-image form-header-image-${position} ${showImage ? "has-custom-image" : "has-default-art"} ${className}`.trim()}
    >
      {showImage ? (
        <img src={url} alt={image?.alt ?? ""} loading="lazy" onError={() => setFailedUrl(url ?? "")} />
      ) : (
        <div className="form-header-default-art" aria-hidden="true">
          <span className="form-header-shape form-header-shape-square" />
          <span className="form-header-shape form-header-shape-pill" />
          <span className="form-header-shape form-header-shape-disc" />
        </div>
      )}
      {signalId ? <figcaption className="form-header-signal-id">{`SIGNAL ID ${signalId}`}</figcaption> : null}
      <div className={`form-header-logo ${showLogoImage ? "has-logo-image" : "has-default-logo"}`}>
        {showLogoImage ? (
          <img
            src={logoUrl}
            alt={logo?.alt ?? ""}
            loading="lazy"
            onError={() => setFailedLogoUrl(logoUrl ?? "")}
          />
        ) : (
          <span>DS</span>
        )}
      </div>
    </figure>
  );
}
