// TypeScript-only shim. Metro picks AdBanner.native.tsx / AdBanner.web.tsx at
// bundle time; this file exists so `tsc` and editors can resolve the import.
export { AdBanner, default } from './AdBanner.native';
