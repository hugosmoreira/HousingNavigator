/**
 * Environment loader for operator scripts.
 *
 * Reads `.env.local` first, then `.env`, from the directory the script runs
 * in (the repo root for `npm run ...`). Variables already set in the shell
 * always win, and `.env.local` wins over `.env`. The README tells developers
 * to keep credentials in `.env.local`, which `dotenv/config` alone ignores.
 *
 * Import it for its side effect, before reading `process.env`:
 *   import './loadScriptEnv.ts';
 */

import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });
