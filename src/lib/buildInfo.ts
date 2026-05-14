export type BuildInfo = {
  appVersion: string;
  buildTime: string;
  gitHash: string;
  appEnvironment: string;
  label: string;
  copyText: string;
};

const fallback = "unknown";

const appVersion = import.meta.env.VITE_APP_VERSION || fallback;
const buildTime = import.meta.env.VITE_BUILD_TIME || fallback;
const gitHash = import.meta.env.VITE_GIT_HASH || fallback;
const appEnvironment = import.meta.env.VITE_APP_ENV || import.meta.env.MODE || fallback;

const hashLabel = gitHash === fallback ? "local" : gitHash;
const envLabel = appEnvironment === fallback ? "" : ` - ${appEnvironment}`;

export const buildInfo: BuildInfo = {
  appVersion,
  buildTime,
  gitHash,
  appEnvironment,
  label: `v${appVersion} - build ${buildTime} - ${hashLabel}${envLabel}`,
  copyText: [
    `DeepSignal v${appVersion}`,
    `build ${buildTime}`,
    `git ${gitHash}`,
    `env ${appEnvironment}`,
  ].join("\n"),
};
