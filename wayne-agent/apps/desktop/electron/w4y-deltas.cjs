/**
 * w4y-deltas.cjs — Work4You product surface for Hermes desktop (opção A).
 * Implementation lives in sibling modules; this file is the stable require API.
 */
"use strict";

const cloud = require("./w4y-cloud.cjs");
const login = require("./w4y-login.cjs");
const wayne = require("./w4y-wayne-resolve.cjs");

const DEFAULT_ENGINE_LATEST =
  process.env.WAYNE_SOURCE_ZIP_URL ||
  "https://storage.googleapis.com/w4y-engine-dist/latest.json";
const DEFAULT_UI_LATEST =
  process.env.W4Y_UI_LATEST_URL ||
  "https://storage.googleapis.com/w4y-engine-dist/ui-latest.json";

function getW4YDistributionConfig() {
  return {
    platformOrigin: cloud.platformOrigin(),
    engineLatestUrl: DEFAULT_ENGINE_LATEST,
    uiLatestUrl: DEFAULT_UI_LATEST,
    wayneHome: login.resolveWayneHome(),
  };
}

function getWork4YouLoginUrl(returnTo = "/device") {
  return login.loginUrl(returnTo);
}

const CLOUD_BRIDGE_CHANNELS = Object.freeze({
  wsUrl: "w4y:cloud:wsUrl",
  api: "w4y:cloud:api",
  canMutate: "w4y:cloud:canMutate",
});

function getUpdatePolicy() {
  return {
    mode: "gcs",
    shellFeed: "electron-updater → gs://w4y-engine-dist",
    engineFeed: DEFAULT_ENGINE_LATEST,
    uiFeed: DEFAULT_UI_LATEST,
    forbidNewStateMachine: true,
  };
}

module.exports = {
  CLOUD_BRIDGE_CHANNELS,
  getUpdatePolicy,
  getW4YDistributionConfig,
  getWork4YouLoginUrl,
  cloud,
  login,
  wayne,
};
