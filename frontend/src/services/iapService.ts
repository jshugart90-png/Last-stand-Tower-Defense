// TypeScript-only shim. Metro picks iapService.native.ts / iapService.web.ts at
// bundle time; this file exists so `tsc` and editors can resolve the import.
export * from './iapService.native';
