/**
 * Load before any other app code. Hermes release builds may not define Buffer;
 * audio and other code paths expect it (via `buffer` package).
 */
import { Buffer } from 'buffer';

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer };

if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}
