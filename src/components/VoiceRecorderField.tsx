import { useEffect, useMemo, useRef, useState } from "react";
import type { VoiceAnswerValue } from "../types";

export interface VoiceAnswerDraft extends VoiceAnswerValue {
  blob?: Blob;
}

interface VoiceRecorderFieldProps {
  fieldId: string;
  value: unknown;
  disabled?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  labels?: {
    title?: string;
    idle?: string;
    recording?: string;
    recorded?: string;
    start?: string;
    stop?: string;
    retry?: string;
    preview?: string;
    duration?: string;
    permissionDenied?: string;
    unsupported?: string;
    failed?: string;
    emptyPreview?: string;
  };
  onChange: (value: VoiceAnswerDraft | null) => void;
}

function isVoiceAnswerDraft(value: unknown): value is VoiceAnswerDraft {
  return Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "voice";
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function VoiceStartIcon() {
  return (
    <span className="voice-recorder-button-icon" aria-hidden="true">
      <span className="voice-icon-mic">
        <span className="voice-icon-mic-head" />
        <span className="voice-icon-mic-stem" />
        <span className="voice-icon-mic-base" />
      </span>
    </span>
  );
}

function VoiceStopIcon() {
  return (
    <span className="voice-recorder-button-icon voice-recorder-button-icon-stop" aria-hidden="true">
      <span className="voice-icon-stop-square" />
    </span>
  );
}

function VoiceRetryIcon() {
  return (
    <span className="voice-recorder-button-icon" aria-hidden="true">
      <span className="voice-icon-retry-arrow" />
    </span>
  );
}

export function VoiceRecorderField({
  fieldId,
  value,
  disabled,
  ariaDescribedBy,
  ariaInvalid,
  labels,
  onChange,
}: VoiceRecorderFieldProps) {
  const currentValue = isVoiceAnswerDraft(value) ? value : null;
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(currentValue ? Math.round(currentValue.duration) : 0);
  const [localError, setLocalError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const previewUrlRef = useRef<string | null>(currentValue?.audioUrl ?? null);
  const timerRef = useRef<number | null>(null);

  const supported = typeof window !== "undefined" && typeof navigator !== "undefined" && "mediaDevices" in navigator && typeof MediaRecorder !== "undefined";
  const statusLabel = useMemo(() => {
    if (recording) {
      return labels?.recording ?? "Recording in progress";
    }
    if (currentValue?.audioUrl) {
      return labels?.recorded ?? "Recording ready";
    }
    return labels?.idle ?? "Ready to record";
  }, [currentValue?.audioUrl, labels, recording]);

  useEffect(() => {
    if (!recording) {
      setElapsedSeconds(currentValue ? Math.round(currentValue.duration) : 0);
    }
  }, [currentValue, recording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  async function startRecording() {
    if (disabled || recording) {
      return;
    }
    if (!supported) {
      setLocalError(labels?.unsupported ?? "This browser does not support voice recording.");
      return;
    }
    try {
      setLocalError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setLocalError(labels?.failed ?? "Recording failed. Please try again.");
        setRecording(false);
      };

      recorder.onstop = () => {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        const audioUrl = URL.createObjectURL(blob);
        previewUrlRef.current = audioUrl;
        onChange({
          kind: "voice",
          audioUrl,
          duration,
          mimeType: blob.type || recorder.mimeType || "audio/webm",
          fileName: `${fieldId}-voice.${(blob.type.split("/")[1] || "webm").split(";")[0]}`,
          size: blob.size,
          blob,
        });
      };

      recorder.start();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)));
      }, 250);
    } catch (error) {
      const message =
        error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
          ? labels?.permissionDenied ?? "Microphone access was denied. Allow microphone access and try again."
          : labels?.failed ?? "Recording failed. Please try again.";
      setLocalError(message);
    }
  }

  function stopRecording() {
    if (!recording) {
      return;
    }
    mediaRecorderRef.current?.stop();
  }

  function resetRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    chunksRef.current = [];
    setElapsedSeconds(0);
    setRecording(false);
    setLocalError("");
    onChange(null);
  }

  return (
    <div
      className={`voice-recorder-card ${ariaInvalid ? "is-error" : ""} ${recording ? "is-recording" : ""}`}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    >
      <div className="voice-recorder-hero" aria-hidden="true">
        <div className={`voice-recorder-hero-illustration ${recording ? "is-recording" : currentValue?.audioUrl ? "is-recorded" : ""}`}>
          <span className="voice-recorder-hero-ring voice-recorder-hero-ring-outer" />
          <span className="voice-recorder-hero-ring voice-recorder-hero-ring-middle" />
          <span className="voice-recorder-hero-ring voice-recorder-hero-ring-inner" />
          <span className="voice-recorder-hero-mic">
            <span className="voice-recorder-hero-mic-head" />
            <span className="voice-recorder-hero-mic-stem" />
            <span className="voice-recorder-hero-mic-base" />
          </span>
        </div>
        <div className="voice-recorder-hero-copy">
          <strong>{labels?.title ?? "Voice answer"}</strong>
          <small>{statusLabel}</small>
        </div>
      </div>

      <div className="voice-recorder-status">
        <span className="voice-recorder-timer" aria-live="polite">
          {labels?.duration ?? "Duration"} {formatDuration(elapsedSeconds)}
        </span>
      </div>

      <div className="voice-recorder-actions">
        <button type="button" className="primary-button voice-recorder-button" disabled={disabled || recording} onClick={() => void startRecording()}>
          <VoiceStartIcon />
          {labels?.start ?? "Start recording"}
        </button>
        <button type="button" className="ghost-button voice-recorder-button" disabled={disabled || !recording} onClick={stopRecording}>
          <VoiceStopIcon />
          {labels?.stop ?? "Stop"}
        </button>
        <button
          type="button"
          className="ghost-button voice-recorder-button"
          disabled={disabled || (!currentValue?.audioUrl && !recording)}
          onClick={resetRecording}
        >
          <VoiceRetryIcon />
          {labels?.retry ?? "Record again"}
        </button>
      </div>

      {currentValue?.audioUrl ? (
        <div className="voice-recorder-preview">
          <span>{labels?.preview ?? "Preview"}</span>
          <audio controls preload="metadata" src={currentValue.audioUrl}>
            {labels?.emptyPreview ?? "Audio preview is unavailable."}
          </audio>
        </div>
      ) : null}

      {localError ? <small className="error-text">{localError}</small> : null}
      {!supported ? <small className="muted">{labels?.unsupported ?? "This browser does not support voice recording."}</small> : null}
    </div>
  );
}
