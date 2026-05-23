export const EMOTION_SCALE_VALUES = [1, 2, 3, 4, 5] as const;

export type EmotionScaleValue = (typeof EMOTION_SCALE_VALUES)[number];

export interface EmotionScaleOption {
  value: EmotionScaleValue;
  emoji: string;
  labelKey:
    | "emotionScaleAngry"
    | "emotionScaleConcerned"
    | "emotionScaleNeutral"
    | "emotionScaleHappy"
    | "emotionScaleExcited";
  accent: string;
}

export const EMOTION_SCALE_OPTIONS: EmotionScaleOption[] = [
  { value: 1, emoji: "😡", labelKey: "emotionScaleAngry", accent: "#ff6b6b" },
  { value: 2, emoji: "😕", labelKey: "emotionScaleConcerned", accent: "#ffb86b" },
  { value: 3, emoji: "😐", labelKey: "emotionScaleNeutral", accent: "#9fb2c8" },
  { value: 4, emoji: "🙂", labelKey: "emotionScaleHappy", accent: "#59d3b4" },
  { value: 5, emoji: "🤩", labelKey: "emotionScaleExcited", accent: "#7be0ff" },
];

export function isEmotionScaleValue(value: unknown): value is EmotionScaleValue {
  return typeof value === "number" && EMOTION_SCALE_VALUES.includes(value as EmotionScaleValue);
}

export function getEmotionScaleOption(value: unknown) {
  const numericValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return EMOTION_SCALE_OPTIONS.find((option) => option.value === numericValue);
}
