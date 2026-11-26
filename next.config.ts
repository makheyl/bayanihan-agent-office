import type { NextConfig } from 'next';

// A personal localhost tool: no "powered by" header, no dev badge over the office, and nothing that phones home
// (telemetry is turned off with NEXT_TELEMETRY_DISABLED in every script).
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  // Next 16's dev server would otherwise write an AGENTS.md into this folder.
  agentRules: false,
};

export default config;
