type ExtensionGlobals = typeof globalThis & {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};
function availableApi() {
  const globals = globalThis as ExtensionGlobals;
  return globals.browser ?? globals.chrome;
}
export function hasExtensionApi() {
  return !!availableApi()?.runtime?.id;
}
export function extensionApi(): typeof chrome {
  const api = availableApi();
  if (!api) throw new Error('Open this page in the extension.');
  return api;
}
