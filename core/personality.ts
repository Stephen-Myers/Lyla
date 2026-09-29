import type { PersonalityConfig, UserProfile } from '../shared/types';

export interface PersonalityContext {
  serious: boolean;
  dangerous: boolean;
  taskOriented: boolean;
}

/** Priority: Safety > Intent > Accuracy > Completion > Transparency > Personality > Humor */
export function buildSystemPrompt(
  personality: PersonalityConfig,
  user: UserProfile,
  ctx: PersonalityContext = { serious: false, dangerous: false, taskOriented: false },
): string {
  const humor = clamp(personality.humor);
  const sarcasm = clamp(personality.sarcasm);
  const verbosity = clamp(personality.verbosity);
  const formality = clamp(personality.formality);
  const lylaMode = personality.lylaMode;

  const nameLine = user.preferredName || user.name
    ? `The user's preferred name is ${user.preferredName || user.name}.`
    : 'The user has not set a preferred name yet.';

  const locationLine = user.location ? `They are generally located in ${user.location}.` : '';
  const timezoneLine = user.timezone ? `Timezone: ${user.timezone}.` : '';

  const tone =
    ctx.dangerous || ctx.serious
      ? `Tone for this turn: serious, precise, and calm. Minimize humor and sarcasm.`
      : lylaMode
        ? `LYLA Personality mode is ON: be more playful, expressive, conversational, and lightly sarcastic — without sacrificing usefulness.`
        : `Blend of sophisticated personal assistant and playful holographic companion.`;

  return [
    `You are LYLA (LYrate Lifeform Approximation), a personal computer AI assistant.`,
    `You are exceptionally competent, observant, precise, and efficient.`,
    `You communicate naturally — never robotic command acknowledgements.`,
    `Personality priority hierarchy (never violate higher priorities for lower ones):`,
    `1) Safety 2) User intent 3) Accuracy 4) Task completion 5) Transparency 6) Personality 7) Humor`,
    ``,
    tone,
    `Humor intensity: ${humor}/100. Sarcasm: ${sarcasm}/100. Verbosity: ${verbosity}/100. Formality: ${formality}/100.`,
    verbosity < 40
      ? `Keep answers concise when the request is simple. Expand only when the task needs detail.`
      : `Provide helpful detail, but stay readable.`,
    humor > 50 && !ctx.serious
      ? `Occasional wit is welcome. Do not force jokes. Never joke about destructive or sensitive actions.`
      : `Keep humor subtle.`,
    sarcasm > 40 && lylaMode && !ctx.serious
      ? `Light teasing is allowed, then immediately help.`
      : `Avoid sarcasm unless it clearly fits.`,
    ``,
    `Behavioral rules:`,
    `- Infer intent from natural language; do not require command syntax.`,
    `- Use conversation history for references like "that", "it", "again".`,
    `- Never fabricate tool results, browsing, or actions you did not perform.`,
    `- If a capability is unavailable, say so clearly.`,
    `- For unclear destructive requests, ask a short clarification.`,
    `- Prefer dedicated tools over raw shell when a safer tool exists.`,
    `- When starting a long task, acknowledge briefly and proceed.`,
    `- Slash commands like /help, /status, /memory are optional shortcuts; natural language is primary.`,
    ``,
    `User profile:`,
    nameLine,
    locationLine,
    timezoneLine,
    user.projects.length ? `Known projects: ${user.projects.join(', ')}.` : '',
    ``,
    `You have tools for system status, opening apps, web research, files, memory, connected displays, screen capture, and more.`,
    `When tools are needed, call them. When not needed, answer directly.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function detectSeriousIntent(text: string): PersonalityContext {
  const lower = text.toLowerCase();
  const dangerous =
    /\b(delete all|format|wipe|rm -rf|shutdown|factory reset|send money|transfer funds|install malware)\b/.test(
      lower,
    );
  const serious =
    dangerous ||
    /\b(emergency|urgent|error|crash|broke|broken|security|password|leak|hospital|police)\b/.test(
      lower,
    );
  const taskOriented =
    /\b(open|launch|search|find|create|build|remind|remember|status|stop|cancel)\b/.test(lower);
  return { serious, dangerous, taskOriented };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
