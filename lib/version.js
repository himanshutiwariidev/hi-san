export const APP_VERSION = "1.0.11";
// The extension build in public/hi-san-bot-extension.zip. A test fails if this and the zip's manifest differ.
export const EXTENSION_VERSION = "1.0.17";
// The version in the address makes a browser fetch the new zip instead of an older copy it kept.
export const EXTENSION_DOWNLOAD_URL = `/hi-san-bot-extension.zip?v=${EXTENSION_VERSION}`;
