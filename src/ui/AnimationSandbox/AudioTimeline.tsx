import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type {
  BuildingAnimationConfig,
  BuildingAnimationSound,
} from '../../game/buildings/BuildingAnimationConfig';
import type { AnimationDocument } from './useAnimationDocument';
import { NumericInput, TextInput } from './EditorInput';
import {
  clampAudioFades,
  inspectAnimationAudio,
  moveAnimationSound,
  splitAnimationSound,
  trimAnimationSound,
} from './AnimationAudio';
import { snapAnimationTime } from './AnimationEditing';

function Waveform({ sound }: { sound: BuildingAnimationSound }) {
  const amplitude = Math.max(0.01, ...sound.waveform);
  const points = Array.from({ length: 128 }, (_, index) => {
    const position =
      (sound.offsetSeconds + (index / 127) * sound.durationSeconds) / sound.sourceDuration;
    return (
      (sound.waveform[
        Math.min(sound.waveform.length - 1, Math.floor(position * sound.waveform.length))
      ] ?? 0) / amplitude
    );
  });
  const path = points
    .map((peak, index) => `M${index} ${20 - peak * 18}V${20 + peak * 18}`)
    .join(' ');
  return (
    <svg
      className="audio-waveform"
      viewBox="0 0 128 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function AudioTimeline({
  document,
  compact = false,
}: {
  document: AnimationDocument;
  compact?: boolean;
}) {
  const { preview } = document;
  const { config } = preview;
  const duration = config.timeline.durationSeconds;
  const seconds = preview.progress * duration;
  const view = document.session.view(preview.activeAnimationId);
  const [selectedId, setSelectedId] = useState<string | null>(view.audioSelectedId);
  const [audioZoom, setAudioZoom] = useState(view.audioZoom);
  const zoom = compact ? document.timelineZoom : audioZoom;
  const setZoom = compact ? document.setTimelineZoom : setAudioZoom;
  const scroll = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(700);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth) setTrackWidth(Math.max(160, element.clientWidth - 340));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (compact && element && Math.abs(element.scrollLeft - document.timelineScrollLeft) > 1)
      element.scrollLeft = document.timelineScrollLeft;
  }, [compact, document.timelineScrollLeft, trackWidth]);
  useEffect(() => {
    view.audioSelectedId = selectedId;
    view.audioZoom = zoom;
  }, [view, selectedId, zoom]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const relink = useRef<HTMLInputElement>(null);
  const latest = useRef(preview);
  const importRevision = useRef(0);
  useEffect(
    () => () => {
      importRevision.current++;
    },
    [],
  );
  latest.current = preview;
  const drag = useRef<{
    sound: BuildingAnimationSound;
    config: BuildingAnimationConfig;
    x: number;
    width: number;
    mode: 'move' | 'left' | 'right';
    recorded: boolean;
  } | null>(null);
  const selected = config.sounds.find((sound) => sound.id === selectedId);
  const change = (next: BuildingAnimationConfig, record = true) => {
    document.setPlaying(false);
    document.update({ ...latest.current, config: next }, record);
  };
  const patch = (id: string, patch: Partial<BuildingAnimationSound>) => {
    const sounds = config.sounds.map((sound) => {
      if (sound.id !== id) return sound;
      const next = { ...sound, ...patch };
      next.offsetSeconds = Math.max(0, Math.min(next.sourceDuration - 0.001, next.offsetSeconds));
      next.durationSeconds = Math.max(
        0.001,
        Math.min(next.sourceDuration - next.offsetSeconds, next.durationSeconds),
      );
      clampAudioFades(next);
      return next;
    });
    change({ ...config, sounds });
  };
  const remove = () => {
    if (selected)
      change({ ...config, sounds: config.sounds.filter((sound) => sound.id !== selected.id) });
  };
  const duplicate = () => {
    if (!selected) return;
    const sound = moveAnimationSound(
      { ...selected, id: `sound-${crypto.randomUUID()}`, name: `${selected.name} · copy` },
      1 / config.timeline.frameRate,
      duration,
    );
    change({ ...config, sounds: [...config.sounds, sound] });
    setSelectedId(sound.id);
  };
  const split = () => {
    if (!selected) return;
    change({
      ...config,
      sounds: config.sounds.flatMap((sound) =>
        sound.id === selected.id
          ? splitAnimationSound(sound, seconds, `sound-${crypto.randomUUID()}`)
          : [sound],
      ),
    });
  };
  const importAudio = async (files: FileList | null, replacement?: string) => {
    if (!files?.length || importing || !document.ready) return;
    document.setPlaying(false);
    const initial = latest.current;
    const revision = ++importRevision.current;
    setImporting(true);
    setError('');
    try {
      const inspected = await Promise.all(
        [...files].map(async (file) => ({ file, ...(await inspectAnimationAudio(file)) })),
      );
      if (revision !== importRevision.current) return;
      if (
        latest.current.activeAnimationId !== initial.activeAnimationId ||
        latest.current.config !== initial.config
      )
        throw new Error('Animation changed during import. Import the audio again.');
      const sourceUrls = { ...initial.sourceUrls };
      const startSeconds =
        initial.progress >= 1 ? 0 : initial.progress * initial.config.timeline.durationSeconds;
      const sounds = inspected.map((item) => {
        const id = `sound-${crypto.randomUUID()}`;
        const assetId = `audio/${id}-${item.file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        sourceUrls[assetId] = document.createSource(item.file);
        const previous = initial.config.sounds.find((sound) => sound.id === replacement);
        return {
          id,
          name: item.file.name,
          startSeconds,
          offsetSeconds: 0,
          durationSeconds: Math.min(
            item.duration,
            initial.config.timeline.durationSeconds - startSeconds,
          ),
          volume: 1,
          muted: false,
          solo: false,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
          ...previous,
          assetId: assetId,
          sourceDuration: item.duration,
          waveform: item.waveform,
        };
      });
      for (const sound of sounds) {
        sound.offsetSeconds = Math.min(
          sound.offsetSeconds,
          Math.max(0, sound.sourceDuration - 0.001),
        );
        sound.durationSeconds = Math.min(
          sound.durationSeconds,
          sound.sourceDuration - sound.offsetSeconds,
        );
        clampAudioFades(sound);
      }
      const next = {
        ...initial.config,
        sounds: replacement
          ? initial.config.sounds.map((sound) => (sound.id === replacement ? sounds[0]! : sound))
          : [...initial.config.sounds, ...sounds],
      };
      document.update({ ...initial, config: next, sourceUrls });
      setSelectedId(sounds[0]!.id);
    } catch (reason) {
      if (revision === importRevision.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to decode audio. Try a WAV, MP3 or OGG file.',
        );
    } finally {
      if (revision === importRevision.current) setImporting(false);
    }
  };
  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    document.setPlaying(false);
    document.update({
      ...latest.current,
      progress: snapAnimationTime(
        (event.clientX - bounds.left) / bounds.width,
        config,
        document.snap,
      ),
      visible: true,
    });
  };
  const beginDrag = (
    event: PointerEvent<HTMLElement>,
    sound: BuildingAnimationSound,
    mode: 'move' | 'left' | 'right',
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(sound.id);
    document.setPlaying(false);
    drag.current = {
      sound: structuredClone(sound),
      config: structuredClone(config),
      x: event.clientX,
      width: event.currentTarget.closest('.audio-track-lane')!.getBoundingClientRect().width,
      mode,
      recorded: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const value = drag.current;
    if (!value || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const raw = ((event.clientX - value.x) / value.width) * value.config.timeline.durationSeconds;
    const delta = document.snap
      ? Math.round(raw * value.config.timeline.frameRate) / value.config.timeline.frameRate
      : raw;
    if (Math.abs(delta) < 0.000001 && !value.recorded) return;
    const sound =
      value.mode === 'move'
        ? moveAnimationSound(value.sound, delta, duration)
        : trimAnimationSound(
            value.sound,
            value.mode,
            delta,
            Math.min(value.sound.durationSeconds, 1 / config.timeline.frameRate),
          );
    if (!value.recorded) {
      document.remember(value.config);
      value.recorded = true;
    }
    change(
      {
        ...value.config,
        sounds: value.config.sounds.map((item) => (item.id === sound.id ? sound : item)),
      },
      false,
    );
  };
  const endDrag = () => {
    drag.current = null;
  };
  const togglePlayback = () => {
    if (
      !document.playing &&
      (preview.progress < config.timeline.workAreaStart ||
        preview.progress >= config.timeline.workAreaEnd)
    )
      document.update({ ...preview, progress: config.timeline.workAreaStart, visible: true });
    document.setPlaying(!document.playing);
  };
  return (
    <div
      className="audio-timeline ae-timeline"
      tabIndex={0}
      aria-label="Sound timeline"
      aria-busy={importing}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        void importAudio(event.dataTransfer.files);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if ((event.target as HTMLElement).closest('input,textarea,select')) return;
        const command = event.ctrlKey || event.metaKey;
        if (command && (event.code === 'KeyZ' || event.code === 'KeyY')) {
          event.preventDefault();
          if (event.shiftKey || event.code === 'KeyY') document.redo();
          else document.undo();
        } else if (command && event.code === 'KeyD') {
          event.preventDefault();
          if (event.shiftKey) split();
          else duplicate();
        } else if (event.code === 'Delete' || event.code === 'Backspace') {
          event.preventDefault();
          remove();
        } else if (event.code === 'Space' && !(event.target as HTMLElement).closest('button')) {
          event.preventDefault();
          if (!event.repeat) togglePlayback();
        } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
          event.preventDefault();
          document.setPlaying(false);
          const time =
            event.code === 'Home'
              ? config.timeline.workAreaStart
              : event.code === 'End'
                ? config.timeline.workAreaEnd
                : preview.progress +
                  ((event.code === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1)) /
                    (duration * config.timeline.frameRate);
          document.update({ ...preview, progress: snapAnimationTime(time, config, true) });
        }
      }}
    >
      <div className="keyframe-toolbar">
        <div className="keyframe-toolbar-group" hidden={compact}>
          <strong>AUDIO</strong>
          <button onClick={togglePlayback}>{document.playing ? 'Pause' : 'Play'}</button>
          <label>
            <input
              type="checkbox"
              checked={document.loop}
              onChange={(event) => document.setLoop(event.target.checked)}
            />{' '}
            Loop
          </label>
          <label>
            <input
              type="checkbox"
              checked={document.snap}
              onChange={(event) => document.setSnap(event.target.checked)}
            />{' '}
            Frame snap
          </label>
          <select
            aria-label="Playback speed"
            value={document.speed}
            onChange={(event) => document.setSpeed(Number(event.target.value))}
          >
            {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
          <output>
            {seconds.toFixed(3)} s / {duration}s
          </output>
        </div>
        <div className="keyframe-toolbar-group">
          <button onClick={document.undo} disabled={!document.canUndo}>
            Undo
          </button>
          <button onClick={document.redo} disabled={!document.canRedo}>
            Redo
          </button>
          <button disabled={importing || !document.ready} onClick={() => input.current?.click()}>
            {importing ? 'Importing…' : '+ Import audio'}
          </button>
          <select
            aria-label="Audio timeline zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[1, 2, 4, 8].map((zoom) => (
              <option key={zoom} value={zoom}>
                {zoom}× zoom
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={`audio-edit-controls ${selected ? 'has-selected-sound' : ''}`}>
        {selected ? (
          <>
            <TextInput
              label="Sound clip name"
              value={selected.name}
              onCommit={(name) => {
                if (name.trim()) patch(selected.id, { name: name.trim() });
              }}
            />
            <label>
              Start{' '}
              <NumericInput
                label="Sound start"
                min={0}
                step={1 / config.timeline.frameRate}
                value={selected.startSeconds}
                onCommit={(startSeconds) => patch(selected.id, { startSeconds })}
              />{' '}
              s
            </label>
            <label>
              Offset{' '}
              <NumericInput
                label="Sound source offset"
                min={0}
                max={selected.sourceDuration - 0.001}
                step={0.01}
                value={selected.offsetSeconds}
                onCommit={(offsetSeconds) => patch(selected.id, { offsetSeconds })}
              />{' '}
              s
            </label>
            <label>
              Length{' '}
              <NumericInput
                label="Sound length"
                min={0.001}
                max={selected.sourceDuration - selected.offsetSeconds}
                step={0.01}
                value={selected.durationSeconds}
                onCommit={(durationSeconds) => patch(selected.id, { durationSeconds })}
              />{' '}
              s
            </label>
            <label>
              Volume{' '}
              <NumericInput
                label="Sound volume"
                min={0}
                max={100}
                step={1}
                value={Math.round(selected.volume * 100)}
                onCommit={(volume) => patch(selected.id, { volume: volume / 100 })}
              />{' '}
              %
            </label>
            <label>
              Fade in{' '}
              <NumericInput
                label="Sound fade in"
                min={0}
                max={selected.durationSeconds - selected.fadeOutSeconds}
                step={0.01}
                value={selected.fadeInSeconds}
                onCommit={(fadeInSeconds) => patch(selected.id, { fadeInSeconds })}
              />{' '}
              s
            </label>
            <label>
              Fade out{' '}
              <NumericInput
                label="Sound fade out"
                min={0}
                max={selected.durationSeconds - selected.fadeInSeconds}
                step={0.01}
                value={selected.fadeOutSeconds}
                onCommit={(fadeOutSeconds) => patch(selected.id, { fadeOutSeconds })}
              />{' '}
              s
            </label>
            <button onClick={duplicate}>Duplicate</button>
            <button
              disabled={
                seconds <= selected.startSeconds ||
                seconds >= selected.startSeconds + selected.durationSeconds
              }
              onClick={split}
            >
              Split at cursor
            </button>
            <button disabled={importing} onClick={() => relink.current?.click()}>
              Relink audio
            </button>
            <button onClick={remove}>Delete clip</button>
          </>
        ) : (
          <span>
            Выберите клип · перетащите WAV, MP3, OGG, M4A или FLAC · Ctrl+D — копия · Ctrl+Shift+D —
            разрез
          </span>
        )}
      </div>
      {error || document.audioError ? (
        <p className="audio-error" role="alert">
          {error || document.audioError}
        </p>
      ) : null}
      <div
        className="audio-scroll"
        ref={scroll}
        onScroll={(event) => {
          if (trackWidth !== Math.max(160, event.currentTarget.clientWidth - 340)) return;
          if (compact) document.setTimelineScrollLeft(event.currentTarget.scrollLeft);
        }}
      >
        <div className="audio-sheet" style={{ width: 340 + trackWidth * zoom }}>
          <div className="audio-track-row audio-ruler-row">
            <div className="audio-track-label">SOURCE / MUTE / SOLO</div>
            <div
              className="audio-track-lane audio-ruler"
              onPointerDown={(event) => {
                scrub(event);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event);
              }}
            >
              {Array.from({ length: 11 }, (_, index) => (
                <span key={index} style={{ left: `${index * 10}%` }}>
                  {((duration * index) / 10).toFixed(1)}s
                </span>
              ))}
            </div>
          </div>
          {config.sounds.map((sound) => (
            <div
              key={sound.id}
              className={`audio-track-row ${sound.id === selectedId ? 'is-selected' : ''}`}
            >
              <div className="audio-track-label">
                <button
                  className="audio-source-name"
                  onClick={() => setSelectedId(sound.id)}
                  title={`${sound.assetId} · ${sound.sourceDuration.toFixed(2)}s`}
                >
                  {sound.name}
                </button>
                <button
                  aria-label={`Mute ${sound.name}`}
                  aria-pressed={sound.muted}
                  onClick={() => patch(sound.id, { muted: !sound.muted })}
                >
                  M
                </button>
                <button
                  aria-label={`Solo ${sound.name}`}
                  aria-pressed={sound.solo}
                  onClick={() => patch(sound.id, { solo: !sound.solo })}
                >
                  S
                </button>
              </div>
              <div className="audio-track-lane">
                <div
                  className="audio-work-area"
                  style={{
                    left: `${config.timeline.workAreaStart * 100}%`,
                    width: `${(config.timeline.workAreaEnd - config.timeline.workAreaStart) * 100}%`,
                  }}
                />
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Sound clip ${sound.name}`}
                  className={`audio-clip ${sound.muted ? 'is-muted' : ''}`}
                  style={{
                    left: `${(sound.startSeconds / duration) * 100}%`,
                    width: `${(sound.durationSeconds / duration) * 100}%`,
                  }}
                  onFocus={() => setSelectedId(sound.id)}
                  onPointerDown={(event) => beginDrag(event, sound, 'move')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onLostPointerCapture={endDrag}
                >
                  <Waveform sound={sound} />
                  <span className="audio-clip-caption">{sound.name}</span>
                  <i
                    className="audio-fade audio-fade-in"
                    style={{ width: `${(sound.fadeInSeconds / sound.durationSeconds) * 100}%` }}
                  />
                  <i
                    className="audio-fade audio-fade-out"
                    style={{ width: `${(sound.fadeOutSeconds / sound.durationSeconds) * 100}%` }}
                  />
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      aria-label={`Trim ${side} ${sound.name}`}
                      className={`audio-trim audio-trim-${side}`}
                      onPointerDown={(event) => beginDrag(event, sound, side)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onLostPointerCapture={endDrag}
                    />
                  ))}
                </div>
                <i className="audio-playhead" style={{ left: `${preview.progress * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        {!config.sounds.length ? (
          <div className="audio-empty">
            <strong>Звуковой таймлайн</strong>
            <p>
              Импортируйте звук, затем разместите его на момент постройки, действия или уничтожения.
            </p>
            <button disabled={importing || !document.ready} onClick={() => input.current?.click()}>
              Import audio files
            </button>
            <small>
              Форматы зависят от поддержки браузера. Файлы сохраняются локально вместе с черновиком.
            </small>
          </div>
        ) : null}
      </div>
      <input
        ref={input}
        className="hidden-input"
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
        multiple
        onChange={(event) => {
          void importAudio(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={relink}
        className="hidden-input"
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
        onChange={(event) => {
          void importAudio(event.target.files, selected?.id);
          event.target.value = '';
        }}
      />
    </div>
  );
}
