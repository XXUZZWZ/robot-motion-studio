import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
const config: NextConfig = { output: process.env.STATIC_EXPORT === '1' ? 'export' : undefined, devIndicators: false, turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) } };
export default config;
