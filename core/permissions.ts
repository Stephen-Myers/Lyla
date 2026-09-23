import type { PermissionConfig, PermissionLevel } from '../shared/types';

export type PermissionAction =
  | 'computer_control'
  | 'file_read'
  | 'file_modify'
  | 'app_install'
  | 'purchase'
  | 'system_destruction'
  | 'terminal'
  | 'web'
  | 'clipboard';

export interface PermissionDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
  level: PermissionLevel | 'allowed' | 'denied';
}

export class PermissionGuard {
  constructor(private config: PermissionConfig) {}

  update(config: PermissionConfig): void {
    this.config = config;
  }

  evaluate(action: PermissionAction): PermissionDecision {
    switch (action) {
      case 'computer_control':
        return boolDecision(this.config.computerControl, 'Computer control');
      case 'file_read':
        return boolDecision(this.config.fileReading, 'File reading');
      case 'file_modify':
        return levelDecision(this.config.fileModification, 'File modification');
      case 'app_install':
        return levelDecision(this.config.applicationInstall, 'Application installation');
      case 'purchase':
        return levelDecision(this.config.purchases, 'Purchases');
      case 'system_destruction':
        return levelDecision(this.config.systemDestruction, 'System destruction');
      case 'terminal':
        return levelDecision(this.config.terminalExecution, 'Terminal execution');
      case 'web':
        return boolDecision(this.config.webAccess, 'Web access');
      case 'clipboard':
        return boolDecision(this.config.clipboardAccess, 'Clipboard access');
      default:
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: 'Unknown permission action',
          level: 'denied',
        };
    }
  }
}

function boolDecision(enabled: boolean, label: string): PermissionDecision {
  if (!enabled) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${label} is disabled in settings.`,
      level: 'denied',
    };
  }
  return {
    allowed: true,
    requiresConfirmation: false,
    reason: `${label} allowed.`,
    level: 'allowed',
  };
}

function levelDecision(level: PermissionLevel, label: string): PermissionDecision {
  if (level === 'disabled') {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${label} is disabled.`,
      level: 'disabled',
    };
  }
  if (level === 'dangerous' || level === 'confirm') {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: `${label} requires your confirmation.`,
      level,
    };
  }
  return {
    allowed: true,
    requiresConfirmation: false,
    reason: `${label} allowed.`,
    level: 'safe',
  };
}
