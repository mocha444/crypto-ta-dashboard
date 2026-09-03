/**
 * Centralized env access. We only ever look at the single key the user
 * pointed us to. Anything else in process.env is ignored — we never read it.
 */

export const HAS_GROQ_KEY = Boolean(
  process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 0,
);

// GROQ_API_KEY intentionally not re-exported. Consumers should import
// HAS_GROQ_KEY and call the API helper in `lib/groq.ts`, which is the only
// place that actually reads the value (server-side only).
