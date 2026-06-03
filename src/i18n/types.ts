export type Language = "en" | "ja";

export type Params = Record<string, string | number>;
export type TranslationValue = string | ((params?: Params) => string);
export type LocaleMessages = Record<string, TranslationValue>;
