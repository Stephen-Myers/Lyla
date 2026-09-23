import { useEffect, useRef } from 'react';
import type { SpeakPayload } from '@shared/types';

/** Plays ElevenLabs (or other) audio payloads from the main process. */
export function useVoicePlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const api = window.lyla;
    if (!api) return;

    const stop = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };

    const unSpeak = api.onSpeak((payload: SpeakPayload) => {
      stop();
      try {
        const binary = atob(payload.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: payload.mimeType || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => stop();
        void audio.play().catch(() => stop());
      } catch {
        stop();
      }
    });

    const unStop = api.onStopSpeak(() => stop());

    return () => {
      unSpeak();
      unStop();
      stop();
    };
  }, []);
}
