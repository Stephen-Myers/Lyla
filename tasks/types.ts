/** Phase 5/7 placeholders — task scheduler & automations. */
export interface LylaTask {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  dueAt?: number;
  createdAt: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  action: string;
}
