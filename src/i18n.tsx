import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { FieldType } from "./types";
import type { Language, Params, LocaleMessages } from "./i18n/types";

export type { Language } from "./i18n/types";

const STORAGE_KEY = "deepsignal.language";
const LANGUAGE_MANUAL_KEY = "deepsignal.language.manual";

type TranslationCatalog = Partial<Record<Language, LocaleMessages>>;
type FieldTypeMessageKey =
  | "fieldTypeShortText"
  | "fieldTypeLongText"
  | "fieldTypeMarkdown"
  | "fieldTypeDate"
  | "fieldTypeDropdown"
  | "fieldTypeCheckbox"
  | "fieldTypeMatrix"
  | "fieldTypeCountrySelect"
  | "fieldTypeConfirmationCheckbox"
  | "fieldTypeRating"
  | "fieldTypeEmotionRating"
  | "fieldTypeUrl"
  | "fieldTypeWalletAddress"
  | "fieldTypeScreenshot"
  | "fieldTypeVideo"
  | "fieldTypeVoice";

const localeLoaders: Record<Language, () => Promise<LocaleMessages>> = {
  en: async () => {
    const module = await import("./i18n/locales/en");
    return module.enMessages;
  },
  ja: async () => {
    const module = await import("./i18n/locales/ja");
    return module.jaMessages;
  },
};

function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  const hasManualLanguageChoice = window.localStorage.getItem(LANGUAGE_MANUAL_KEY) === "true";
  if ((stored === "en" || stored === "ja") && hasManualLanguageChoice) {
    return stored;
  }
  if (stored === "ja") {
    return "ja";
  }

  return window.navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Params) => string;
  fieldTypeLabel: (type: FieldType) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const fieldTypeKeys: Record<FieldType, FieldTypeMessageKey> = {
  shortText: "fieldTypeShortText",
  longText: "fieldTypeLongText",
  markdown: "fieldTypeMarkdown",
  date: "fieldTypeDate",
  dropdown: "fieldTypeDropdown",
  checkbox: "fieldTypeCheckbox",
  matrix: "fieldTypeMatrix",
  country_select: "fieldTypeCountrySelect",
  confirmation: "fieldTypeConfirmationCheckbox",
  rating: "fieldTypeRating",
  emotionRating: "fieldTypeEmotionRating",
  url: "fieldTypeUrl",
  walletAddress: "fieldTypeWalletAddress",
  screenshot: "fieldTypeScreenshot",
  video: "fieldTypeVideo",
  voice: "fieldTypeVoice",
};

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const loadedLanguagesRef = useRef<Set<Language>>(new Set());
  const [messages, setMessages] = useState<TranslationCatalog>({});
  const [initialLanguageReady, setInitialLanguageReady] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (loadedLanguagesRef.current.has(language)) {
      setInitialLanguageReady(true);
      return;
    }

    let cancelled = false;

    async function ensureLanguageCatalog() {
      try {
        const catalog = await localeLoaders[language]();
        if (cancelled) {
          return;
        }
        loadedLanguagesRef.current.add(language);
        setMessages((prev) => {
          if (prev[language]) {
            return prev;
          }
          return { ...prev, [language]: catalog };
        });
      } catch {
        if (!cancelled) {
          console.warn(`Unable to load locale ${language}; fallback translations will be used.`);
        }

        if (language !== "en" && !loadedLanguagesRef.current.has("en")) {
          try {
            const fallbackCatalog = await localeLoaders.en();
            if (cancelled) {
              return;
            }
            loadedLanguagesRef.current.add("en");
            setMessages((prev) => {
              if (prev.en) {
                return prev;
              }
              return { ...prev, en: fallbackCatalog };
            });
          } catch {
            if (!cancelled) {
              console.warn("Unable to load fallback locale en; translation keys will be shown.");
            }
          }
        }
      } finally {
        if (!cancelled) {
          setInitialLanguageReady(true);
        }
      }
    }

    void ensureLanguageCatalog();

    return () => {
      cancelled = true;
    };
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    function updateLanguage(nextLanguage: Language) {
      window.localStorage.setItem(LANGUAGE_MANUAL_KEY, "true");
      setLanguage(nextLanguage);
    }

    const fallbackCatalog = messages.en ?? messages[language] ?? {};

    function t(key: string, params?: Params) {
      const catalog = messages[language] ?? fallbackCatalog;
      const message = catalog[key as keyof LocaleMessages] ?? fallbackCatalog[key as keyof LocaleMessages] ?? key;
      return typeof message === "function" ? message(params) : message;
    }

    return {
      language,
      setLanguage: updateLanguage,
      t,
      fieldTypeLabel(type) {
        return t(fieldTypeKeys[type]);
      },
    };
  }, [language, messages]);

  if (!initialLanguageReady) {
    return null;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}
