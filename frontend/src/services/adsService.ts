// TypeScript-only shim. Metro picks adsService.native.ts / adsService.web.ts at
// bundle time; this file exists so `tsc` and editors can resolve the import.
export * from './adsService.native';
