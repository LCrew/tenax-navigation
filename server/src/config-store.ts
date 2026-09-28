import fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigSchema, DEFAULT_CONFIG, type Config } from '../../shared/schema';
import { env } from './env';

const file = path.join(env.dataDir, 'config.json');
const prevFile = path.join(env.dataDir, 'config.prev.json');

let cache: Config | null = null;
let writeChain: Promise<void> = Promise.resolve();

export async function loadConfig(): Promise<Config> {
  if (cache) return cache;
  try {
    cache = ConfigSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
    cache = DEFAULT_CONFIG;
    await saveConfig(DEFAULT_CONFIG);
  }
  return cache;
}

// Writes are serialized and atomic (write temp file, then rename over the old one).
export function saveConfig(config: Config): Promise<void> {
  const run = async () => {
    await fs.mkdir(env.dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(config, null, 2));
    await fs.copyFile(file, prevFile).catch(() => {});
    await fs.rename(tmp, file);
    cache = config;
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}
