import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';
import { sampleAnimationSounds } from './AnimationAudio';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  url: string;
  offset: number;
  started: number;
  speed: number;
  end: number;
}

export function useAnimationAudio(
  preview: BuildingAnimationPreview,
  playing: boolean,
  speed: number,
) {
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());
  const voices = useRef(new Map<string, Voice>());
  const lastSeconds = useRef<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const enable = useCallback(() => {
    try {
      context.current ??= new AudioContext();
      void context.current
        .resume()
        .then(() => setRevision((value) => value + 1))
        .catch(() => setError('Audio playback is unavailable.'));
    } catch {
      setError('Audio playback is unavailable in this browser.');
    }
  }, []);
  const stop = useCallback(() => {
    for (const voice of voices.current.values()) {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    voices.current.clear();
    lastSeconds.current = null;
  }, []);

  useEffect(() => {
    const audio = context.current;
    if (!audio || !playing) return;
    let cancelled = false;
    const controller = new AbortController();
    const sounds = preview.config.sounds;
    const urls = [
      ...new Set(sounds.map((sound) => preview.sourceUrls[sound.assetId] ?? `/${sound.assetId}`)),
    ];
    setError('');
    void Promise.all(
      urls.map(async (url) => {
        if (buffers.current.has(url)) return;
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Unavailable audio resource');
          const buffer = await audio.decodeAudioData(await response.arrayBuffer());
          if (!cancelled) {
            buffers.current.set(url, buffer);
            setRevision((value) => value + 1);
          }
        } catch {
          if (!cancelled)
            setError('Some audio files are unavailable. Select a clip and use Relink audio.');
        }
      }),
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [playing, preview.config.sounds, preview.sourceUrls]);

  useEffect(() => {
    const audio = context.current;
    if (!playing || !audio || audio.state !== 'running') {
      stop();
      return;
    }
    const seconds = preview.progress * preview.config.timeline.durationSeconds;
    if (lastSeconds.current !== null && seconds < lastSeconds.current) stop();
    lastSeconds.current = seconds;
    const samples = sampleAnimationSounds(preview.config.sounds, seconds);
    const active = new Set(samples.map((sample) => sample.sound.id));
    for (const [id, voice] of voices.current) {
      if (!active.has(id)) {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
        voices.current.delete(id);
      }
    }
    for (const { sound, offset, gain, remaining } of samples) {
      const url = preview.sourceUrls[sound.assetId] ?? `/${sound.assetId}`;
      const buffer = buffers.current.get(url);
      if (!buffer || offset >= buffer.duration) continue;
      let voice = voices.current.get(sound.id);
      if (
        voice &&
        (voice.url !== url ||
          voice.speed !== speed ||
          Math.abs(voice.end - (offset + remaining)) > 0.00001 ||
          Math.abs(voice.offset + (audio.currentTime - voice.started) * speed - offset) > 0.08)
      ) {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
        voices.current.delete(sound.id);
        voice = undefined;
      }
      if (!voice) {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;
        const volume = audio.createGain();
        volume.gain.value = gain;
        source.connect(volume).connect(audio.destination);
        source.start(audio.currentTime, offset);
        source.stop(audio.currentTime + Math.min(remaining, buffer.duration - offset) / speed);
        voice = {
          source,
          gain: volume,
          url,
          offset,
          started: audio.currentTime,
          speed,
          end: offset + remaining,
        };
        voices.current.set(sound.id, voice);
      }
      voice.gain.gain.setTargetAtTime(gain, audio.currentTime, 0.01);
    }
  }, [
    playing,
    speed,
    preview.progress,
    preview.config.sounds,
    preview.config.timeline.durationSeconds,
    preview.sourceUrls,
    revision,
    stop,
  ]);

  useEffect(
    () => () => {
      stop();
      void context.current?.close();
      context.current = null;
      buffers.current.clear();
    },
    [stop],
  );
  return { enable, error };
}
