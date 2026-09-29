import type { VisionConfig } from '../shared/types';

const DEFAULT_BLOCKED = [
  '1password',
  'bitwarden',
  'lastpass',
  'keepass',
  'keeper',
  'dashlane',
  'authy',
  'nordpass',
  'roboform',
  'windows security',
  'credential manager',
];

export class PrivacyManager {
  private excludedApps: string[];
  private excludedDisplays: string[];
  private enabled: boolean;
  private paused: boolean;
  private localOnly: boolean;

  constructor(config: VisionConfig) {
    this.enabled = config.enabled;
    this.paused = config.paused;
    this.localOnly = config.localOnly;
    this.excludedApps = normalizeList([...DEFAULT_BLOCKED, ...config.excludedApplications]);
    this.excludedDisplays = [...config.excludedDisplayIds];
  }

  update(config: VisionConfig): void {
    this.enabled = config.enabled;
    this.paused = config.paused;
    this.localOnly = config.localOnly;
    this.excludedApps = normalizeList([...DEFAULT_BLOCKED, ...config.excludedApplications]);
    this.excludedDisplays = [...config.excludedDisplayIds];
  }

  isEnabled(): boolean {
    return this.enabled && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isLocalOnly(): boolean {
    return this.localOnly;
  }

  excludeApplication(name: string): string[] {
    const key = name.trim().toLowerCase();
    if (key && !this.excludedApps.includes(key)) {
      this.excludedApps.push(key);
    }
    return this.userExclusions();
  }

  userExclusions(): string[] {
    return this.excludedApps.filter((name) => !DEFAULT_BLOCKED.includes(name));
  }

  canCapture(opts: {
    displayId?: string | null;
    application?: string | null;
    windowTitle?: string | null;
  }): { allowed: boolean; reason?: string } {
    if (!this.enabled) {
      return { allowed: false, reason: 'Screen vision is disabled in settings.' };
    }
    if (this.paused) {
      return { allowed: false, reason: 'Screen vision is temporarily paused.' };
    }
    if (opts.displayId && this.excludedDisplays.includes(opts.displayId)) {
      return { allowed: false, reason: 'That display is excluded from vision.' };
    }
    const haystack = `${opts.application ?? ''} ${opts.windowTitle ?? ''}`.toLowerCase();
    const blocked = this.excludedApps.find((app) => haystack.includes(app));
    if (blocked) {
      return {
        allowed: false,
        reason: `I won't look at ${blocked} — it's on the visual exclusion list.`,
      };
    }
    return { allowed: true };
  }
}

function normalizeList(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}
