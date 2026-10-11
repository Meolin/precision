import { useRef, useState } from 'react';
import type { AnimationDocument } from './useAnimationDocument';
import type { BuildingAnimationConfig } from '../../game/buildings/BuildingAnimationConfig';
import { snapAnimationTime } from './AnimationEditing';
import { TextInput } from './EditorInput';

export function AnimationMarkers({ document }: { document: AnimationDocument }) {
  const { preview } = document;
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{
    config: BuildingAnimationConfig;
    left: number;
    width: number;
    recorded: boolean;
  } | null>(null);
  const marker = preview.config.markers.find((item) => item.id === selected);
  const change = (config: BuildingAnimationConfig, record = true) =>
    document.update({ ...preview, config }, record);
  return (
    <div className="animation-marker-panel">
      <div className="animation-marker-controls">
        <span>EVENT MARKERS</span>
        <button
          onClick={() => {
            const id = `marker-${crypto.randomUUID()}`;
            change({
              ...preview.config,
              markers: [
                ...preview.config.markers,
                {
                  id,
                  name: `Event ${preview.config.markers.length + 1}`,
                  time: snapAnimationTime(preview.progress, preview.config, document.snap),
                },
              ],
            });
            setSelected(id);
          }}
        >
          + Marker
        </button>
        {marker ? (
          <>
            <TextInput
              label="Marker name"
              value={marker.name}
              onCommit={(name) => {
                if (name.trim())
                  change({
                    ...preview.config,
                    markers: preview.config.markers.map((item) =>
                      item.id === marker.id ? { ...item, name: name.trim() } : item,
                    ),
                  });
              }}
            />
            <button
              aria-label="Delete marker"
              onClick={() =>
                change({
                  ...preview.config,
                  markers: preview.config.markers.filter((item) => item.id !== marker.id),
                })
              }
            >
              Delete
            </button>
          </>
        ) : (
          <small>Метки для попаданий, переходов и звуков · перетаскивайте для синхронизации</small>
        )}
      </div>
      <div
        className="animation-marker-ruler"
        aria-label="Маркеры анимации"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || event.button !== 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          document.setPlaying(false);
          document.update({
            ...preview,
            progress: snapAnimationTime(
              (event.clientX - bounds.left) / bounds.width,
              preview.config,
              document.snap,
            ),
          });
        }}
      >
        <i className="marker-playhead" style={{ left: `${preview.progress * 100}%` }} />
        {preview.config.markers.map((item) => (
          <button
            key={item.id}
            className={`event-marker ${item.id === selected ? 'is-selected' : ''}`}
            style={{ left: `${item.time * 100}%` }}
            title={`${item.name} · ${(item.time * preview.config.timeline.durationSeconds).toFixed(3)} s`}
            aria-label={`Marker ${item.name}`}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
              drag.current = {
                config: structuredClone(preview.config),
                left: bounds.left,
                width: bounds.width,
                recorded: false,
              };
              setSelected(item.id);
              document.setPlaying(false);
              document.update({ ...preview, progress: item.time });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const value = drag.current;
              if (!value || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const time = snapAnimationTime(
                (event.clientX - value.left) / value.width,
                value.config,
                document.snap,
              );
              if (time === item.time) return;
              if (!value.recorded) {
                document.remember(value.config);
                value.recorded = true;
              }
              const config = {
                ...value.config,
                markers: value.config.markers.map((marker) =>
                  marker.id === item.id ? { ...marker, time } : marker,
                ),
              };
              change(config, false);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            ◆ <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
