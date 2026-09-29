import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForegroundWindow, WindowInspector } from './inspector';

const execFileAsync = promisify(execFile);

const FOREGROUND_SCRIPT = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class LylaFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$h = [LylaFg]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { Write-Output '{}'; exit 0 }
$sb = New-Object System.Text.StringBuilder 2048
[void][LylaFg]::GetWindowText($h, $sb, 2048)
[uint32]$procId = 0
[void][LylaFg]::GetWindowThreadProcessId($h, [ref]$procId)
$r = New-Object LylaFg+RECT
[void][LylaFg]::GetWindowRect($h, [ref]$r)
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
$path = $null
if ($proc) {
  try { $path = $proc.Path } catch { $path = $null }
}
$payload = @{
  title = $sb.ToString()
  processName = if ($proc) { $proc.ProcessName } else { '' }
  processId = [int]$procId
  exePath = $path
  bounds = @{
    x = $r.Left
    y = $r.Top
    width = [Math]::Max(0, $r.Right - $r.Left)
    height = [Math]::Max(0, $r.Bottom - $r.Top)
  }
}
$payload | ConvertTo-Json -Compress
`.trim();

export class WindowsWindowInspector implements WindowInspector {
  readonly id = 'windows-user32';

  async getForegroundWindow(): Promise<ForegroundWindow | null> {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', FOREGROUND_SCRIPT],
        { windowsHide: true, timeout: 8000, encoding: 'utf8' },
      );
      const raw = stdout.trim();
      if (!raw || raw === '{}') return null;
      const parsed = JSON.parse(raw) as {
        title?: string;
        processName?: string;
        processId?: number;
        exePath?: string | null;
        bounds?: { x?: number; y?: number; width?: number; height?: number };
      };
      const processName = (parsed.processName ?? '').trim();
      return {
        title: (parsed.title ?? '').trim(),
        processName,
        processId: parsed.processId ?? null,
        exePath: parsed.exePath ?? null,
        bounds: parsed.bounds
          ? {
              x: parsed.bounds.x ?? 0,
              y: parsed.bounds.y ?? 0,
              width: parsed.bounds.width ?? 0,
              height: parsed.bounds.height ?? 0,
            }
          : null,
      };
    } catch {
      return null;
    }
  }
}
