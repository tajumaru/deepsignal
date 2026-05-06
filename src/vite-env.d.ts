/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_MODE?: string;
  readonly VITE_WALRUS_PUBLISHER_URL?: string;
  readonly VITE_WALRUS_AGGREGATOR_URL?: string;
  readonly VITE_SEAL_MODE?: string;
  readonly VITE_SEAL_PACKAGE_ID?: string;
  readonly VITE_SEAL_KEY_SERVER_OBJECT_ID?: string;
  readonly VITE_SEAL_AGGREGATOR_URL?: string;
  readonly VITE_SUI_NETWORK?: string;
  readonly VITE_WALFORM_PACKAGE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
