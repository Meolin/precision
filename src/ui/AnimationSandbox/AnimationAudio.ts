import type { BuildingAnimationSound } from '../../game/buildings/BuildingAnimationConfig';

export function sampleAnimationSounds(sounds: BuildingAnimationSound[], seconds: number) {
  const solo = sounds.some((sound) => sound.solo && !sound.muted);
  return sounds.flatMap((sound) => {
    const local = seconds - sound.startSeconds;
    if (sound.muted || (solo && !sound.solo) || local < 0 || local >= sound.durationSeconds)
      return [];
    const fadeIn = sound.fadeInSeconds > 0 ? Math.min(1, local / sound.fadeInSeconds) : 1;
    const fadeOut =
      sound.fadeOutSeconds > 0
        ? Math.min(1, (sound.durationSeconds - local) / sound.fadeOutSeconds)
        : 1;
    return [
      {
        sound,
        offset: sound.offsetSeconds + local,
        gain: sound.volume * Math.min(fadeIn, fadeOut),
        remaining: sound.durationSeconds - local,
      },
    ];
  });
}

export function audioWaveform(channels: readonly Float32Array[], bins = 256): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length) return [];
  const resultLength = Math.min(bins, length);
  return Array.from({ length: resultLength }, (_, index) => {
    let peak = 0;
    const start = Math.floor((index * length) / resultLength);
    const end = Math.floor(((index + 1) * length) / resultLength);
    for (const channel of channels)
      for (let sample = start; sample < end; sample++)
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
    return Math.min(1, peak);
  });
}

export function clampAudioFades(sound: BuildingAnimationSound): void {
  sound.fadeInSeconds = Math.min(sound.durationSeconds, Math.max(0, sound.fadeInSeconds));
  sound.fadeOutSeconds = Math.min(
    sound.durationSeconds - sound.fadeInSeconds,
    Math.max(0, sound.fadeOutSeconds),
  );
}

export function moveAnimationSound(
  sound: BuildingAnimationSound,
  delta: number,
  duration: number,
): BuildingAnimationSound {
  return {
    ...sound,
    startSeconds: Math.max(
      0,
      Math.min(
        Math.max(0, duration - Math.min(sound.durationSeconds, duration)),
        sound.startSeconds + delta,
      ),
    ),
  };
}

export function trimAnimationSound(
  sound: BuildingAnimationSound,
  side: 'left' | 'right',
  delta: number,
  minimum: number,
): BuildingAnimationSound {
  const next = { ...sound };
  if (side === 'left') {
    const amount = Math.max(
      -Math.min(sound.startSeconds, sound.offsetSeconds),
      Math.min(sound.durationSeconds - minimum, delta),
    );
    next.startSeconds += amount;
    next.offsetSeconds += amount;
    next.durationSeconds -= amount;
  } else {
    next.durationSeconds = Math.max(
      minimum,
      Math.min(sound.sourceDuration - sound.offsetSeconds, sound.durationSeconds + delta),
    );
  }
  clampAudioFades(next);
  return next;
}

export function splitAnimationSound(
  sound: BuildingAnimationSound,
  seconds: number,
  id: string,
): BuildingAnimationSound[] {
  const local = seconds - sound.startSeconds;
  if (local <= 0 || local >= sound.durationSeconds) return [sound];
  const left = { ...sound, durationSeconds: local, fadeOutSeconds: 0 };
  const right = {
    ...sound,
    id,
    name: `${sound.name} · 2`,
    startSeconds: seconds,
    offsetSeconds: sound.offsetSeconds + local,
    durationSeconds: sound.durationSeconds - local,
    fadeInSeconds: 0,
  };
  clampAudioFades(left);
  clampAudioFades(right);
  return [left, right];
}

export async function inspectAnimationAudio(file: File) {
  if (file.size > 100 * 1024 * 1024) throw new Error('Audio file exceeds 100 MB.');
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0)
      throw new Error('Audio has no duration.');
    return {
      duration: buffer.duration,
      waveform: audioWaveform(
        Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)),
      ),
    };
  } finally {
    await context.close();
  }
}
