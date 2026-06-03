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
import type { Language, Params, TranslationValue, LocaleMessages } from "./i18n/types";
import { enMessages } from "./i18n/locales/en";

export type { Language } from "./i18n/types";

const STORAGE_KEY = "deepsignal.language";
const LANGUAGE_MANUAL_KEY = "deepsignal.language.manual";

type TranslationCatalog = Partial<Record<Language, LocaleMessages>>;

const localeLoaders: Record<"ja", () => Promise<LocaleMessages>> = {
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

const fieldTypeKeys: Record<FieldType, keyof typeof enMessages> = {
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
  const loadedLanguagesRef = useRef<Set<Language>>(new Set(["en"]));
  const [messages, setMessages] = useState<TranslationCatalog>({
    en: enMessages,
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (language === "en" || loadedLanguagesRef.current.has(language)) {
      return;
    }

    let cancelled = false;
    localeLoaders[language]()
      .then((catalog) => {
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
      })
      .catch(() => {
        if (!cancelled) {
          console.warn(`Unable to load locale ${language}; fallback translations will be used.`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    function updateLanguage(nextLanguage: Language) {
      window.localStorage.setItem(LANGUAGE_MANUAL_KEY, "true");
      setLanguage(nextLanguage);
    }

    const fallbackCatalog = messages.en ?? enMessages;

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

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}
