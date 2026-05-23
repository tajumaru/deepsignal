import type { VoiceAnswerValue } from "../../types";

export type PublicAnswers = Record<string, unknown>;
export type ValidationErrors = Record<string, string>;

export interface PublicVoiceAnswerDraft extends VoiceAnswerValue {
  blob?: Blob;
}
