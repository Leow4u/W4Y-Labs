/**
 * w4y-deltas.cjs — Work4You product hooks for the Hermes desktop base (opção A).
 *
 * PR1 restores upstream apps/desktop. These modules are the deliberate W4Y
 * surface (login, ZIP/slots motor, cloud bridge, GCS update) so we do NOT
 * grow a second shell. Each helper is fail-open until wired in main.cjs.
 *
 * See docs/PLANO-REPARO.md Fase 3 and docs/PLATAFORMA.md.
 */

"use strict";

const DEFAULT_PLATFORM_ORIGIN =
  process.env.W4Y_PLATFORM_ORIGIN || "https://work4you.ai";
const DEFAULT_ENGINE_LATEST =
  process.env.WAYNE_SOURCE_ZIP_URL ||
  "https://storage.googleapis.com/w4y-engine-dist/latest.json";
const DEFAULT_UI_LATEST =
  process.env.W4Y_UI_LATEST_URL ||
  "https://storage.googleapis.com/w4y-engine-dist/ui-latest.json";

/**
 * @returns {{ platformOrigin: string, engineLatestUrl: string, uiLatestUrl: string }}
 */
function getW4YDistributionConfig() {
  return {
    platformOrigin: DEFAULT_PLATFORM_ORIGIN.replace(/\/$/, ""),
    engineLatestUrl: DEFAULT_ENGINE_LATEST,
    uiLatestUrl: DEFAULT_UI_LATEST,
  };
}

/**
 * Login Work4You + device engine-key — port from desktop-shell main.cjs.
 * Stub: returns the platform login URL the BrowserWindow should open.
 */
function getWork4YouLoginUrl(returnTo = "/device") {
  const { platformOrigin } = getW4YDistributionConfig();
  const q = new URLSearchParams({ return_to: returnTo });
  return `${platformOrigin}/login?${q.toString()}`;
}

/**
 * Cloud bridge IPC names (parity with desktop-shell preload).
 * Wire these in main/preload when spawning the local motor + cloud session.
 */
const CLOUD_BRIDGE_CHANNELS = Object.freeze({
  wsUrl: "w4y:cloud:wsUrl",
  api: "w4y:cloud:api",
  canMutate: "w4y:cloud:canMutate",
});

/**
 * Update policy for W4Y distribution (not git / hermes update).
 * Prefer GCS feeds; never invent a new state-machine — call sites stay thin.
 */
function getUpdatePolicy() {
  return {
    mode: "gcs",
    shellFeed: "electron-updater → gs://w4y-engine-dist",
    engineFeed: getW4YDistributionConfig().engineLatestUrl,
    uiFeed: getW4YDistributionConfig().uiLatestUrl,
    forbidNewStateMachine: true,
  };
}

module.exports = {
  getW4YDistributionConfig,
  getWork4YouLoginUrl,
  CLOUD_BRIDGE_CHANNELS,
  getUpdatePolicy,
};
