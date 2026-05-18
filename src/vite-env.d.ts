/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_TIME?: string;
  readonly VITE_GIT_HASH?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_STORAGE_MODE?: string;
  readonly VITE_WALRUS_STORAGE_MODE?: string;
  readonly VITE_WALRUS_NETWORK?: string;
  readonly VITE_WALRUS_PUBLISHER_URL?: string;
  readonly VITE_WALRUS_AGGREGATOR_URL?: string;
  readonly VITE_WALRUS_UPLOAD_RELAY_URL?: string;
  readonly VITE_WALRUS_UPLOAD_RELAY_TIMEOUT_MS?: string;
  readonly VITE_WALRUS_UPLOAD_RELAY_TIP_MAX?: string;
  readonly VITE_WALRUS_STORAGE_EPOCHS?: string;
  readonly VITE_SEAL_PACKAGE_ID?: string;
  readonly VITE_SEAL_KEY_SERVER_OBJECT_ID?: string;
  readonly VITE_SEAL_AGGREGATOR_URL?: string;
  readonly VITE_SUI_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_SUI_FULLNODE_URL?: string;
  readonly NEXT_PUBLIC_SUI_RPC_URL?: string;
  readonly NEXT_PUBLIC_TATUM_ENABLED?: string;
  readonly VITE_TATUM_PROXY_ENABLED?: string;
  readonly VITE_TATUM_PROXY_PATH?: string;
  readonly VITE_WALFORM_PACKAGE_ID?: string;
  readonly VITE_PACKAGE_ID?: string;
  readonly VITE_REGISTRY_ID?: string;
  readonly VITE_ADMIN_CAP_ID?: string;
  readonly VITE_OWNER_CAP_ID?: string;
  readonly VITE_DEEPSIGNAL_PACKAGE_ID?: string;
  readonly VITE_DEEPSIGNAL_REGISTRY_ID?: string;
  readonly VITE_DEEPSIGNAL_ADMIN_CAP_ID?: string;
  readonly VITE_DEEPSIGNAL_OWNER_CAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
