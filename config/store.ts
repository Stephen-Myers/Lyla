import fs from 'node:fs';
import path from 'node:path';
import Store from 'electron-store';
import { app } from 'electron';
import { DEFAULT_CONFIG, mergeConfig } from './defaults';
import type { LylaConfig } from '../shared/types';
import { logger } from '../core/logging';

type StoreSchema = {
  config: LylaConfig;
};

let store: Store<StoreSchema> | null = null;

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'lyla-config.json');
}

/** Strip UTF-8 BOM / repair a config file that PowerShell or editors may have corrupted. */
function repairConfigFileIfNeeded(): void {
  const file = configFilePath();
  if (!fs.existsSync(file)) return;
  try {
    const raw = fs.readFileSync(file);
    const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
    const text = raw.toString('utf8').replace(/^\uFEFF/, '');
    JSON.parse(text); // validate
    if (hasBom || raw[0] !== 0x7b /* '{' */) {
      fs.writeFileSync(file, text, { encoding: 'utf8' });
      logger.warn('config', 'Repaired config file encoding (removed BOM / normalized UTF-8)');
    }
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}.bak`;
    try {
      fs.copyFileSync(file, backup);
      fs.writeFileSync(
        file,
        JSON.stringify({ config: structuredClone(DEFAULT_CONFIG) }, null, 2),
        { encoding: 'utf8' },
      );
      logger.error('config', 'Config was invalid JSON; reset to defaults', {
        error: String(error),
        backup,
      });
    } catch (resetError) {
      logger.error('config', 'Failed to reset corrupt config', resetError);
    }
  }
}

export function getConfigStore(): Store<StoreSchema> {
  if (!store) {
    repairConfigFileIfNeeded();
    store = new Store<StoreSchema>({
      name: 'lyla-config',
      defaults: {
        config: structuredClone(DEFAULT_CONFIG),
      },
    });
  }
  return store;
}

export function loadConfig(): LylaConfig {
  const raw = getConfigStore().get('config');
  const merged = mergeConfig(raw);
  // Persist auto-corrected model names (e.g. openai + lyla-local → gpt-4o-mini).
  if (raw && raw.llm?.model !== merged.llm.model) {
    getConfigStore().set('config', merged);
  }
  return merged;
}

export function saveConfig(config: LylaConfig): LylaConfig {
  const merged = mergeConfig(config);
  getConfigStore().set('config', merged);
  return merged;
}

export function updateConfig(partial: Partial<LylaConfig>): LylaConfig {
  const current = loadConfig();
  return saveConfig(mergeConfig({ ...current, ...partial }));
}
