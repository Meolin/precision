import { createAnimationVariant } from '../../game/buildings/BuildingAnimationLibrary';
import type { AnimationDocument } from './useAnimationDocument';
import { TextInput } from './EditorInput';

export function AnimationTabs({ document }: { document: AnimationDocument }) {
  const { library, activeAnimationId } = document.preview;
  const active = library.animations.find((entry) => entry.id === activeAnimationId)!;
  const add = (duplicate: boolean) => {
    const id = `custom-${crypto.randomUUID()}`;
    const name = duplicate
      ? `${active.name} · копия`
      : `Custom ${library.animations.filter((entry) => entry.kind === 'custom').length + 1}`;
    const config = createAnimationVariant(active.config, 'custom', `${library.entityId}-${id}`);
    if (!duplicate) {
      config.tracks = [];
      config.sounds = [];
      config.markers = [];
    }
    document.editLibrary(
      { ...library, animations: [...library.animations, { id, name, kind: 'custom', config }] },
      id,
    );
  };
  return (
    <div className="animation-library">
      <div className="animation-tabs" role="tablist" aria-label="Анимации сущности">
        {library.animations.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            id={`animation-tab-${entry.id}`}
            aria-controls="animation-editor-panel"
            aria-selected={entry.id === activeAnimationId}
            tabIndex={entry.id === activeAnimationId ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index = library.animations.indexOf(entry);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? library.animations.length - 1
                    : (index + (event.key === 'ArrowLeft' ? -1 : 1) + library.animations.length) %
                      library.animations.length;
              const target = library.animations[next]!;
              document.selectAnimation(target.id);
              const tabs =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              tabs?.[next]?.focus();
            }}
            disabled={!document.ready}
            onClick={() => document.selectAnimation(entry.id)}
          >
            {entry.name} <small>{entry.config.timeline.durationSeconds}s</small>
          </button>
        ))}
        <button
          disabled={!document.ready}
          onClick={() => add(false)}
          title="Создать анимацию с текущими изображениями"
        >
          + Custom
        </button>
      </div>
      <details
        className="sandbox-topbar-menu animation-properties-menu"
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.open = false;
        }}
      >
        <summary title="Свойства текущей анимации" aria-label="Свойства текущей анимации">
          Свойства · {active.name} ⋯
        </summary>
        <div className="animation-tab-controls sandbox-topbar-popover">
          <label>
            СУЩНОСТЬ{' '}
            <TextInput
              label="Entity ID"
              value={library.entityId}
              onCommit={(value) => {
                if (value.trim()) document.editLibrary({ ...library, entityId: value.trim() });
              }}
            />
          </label>
          <label>
            АНИМАЦИЯ{' '}
            <TextInput
              label="Animation name"
              value={active.name}
              onCommit={(value) => {
                if (value.trim())
                  document.editLibrary({
                    ...library,
                    animations: library.animations.map((entry) =>
                      entry.id === activeAnimationId ? { ...entry, name: value.trim() } : entry,
                    ),
                  });
              }}
            />
          </label>
          <button disabled={!document.ready} onClick={() => add(true)}>
            Duplicate animation
          </button>
          {active.kind !== 'construction' &&
          library.animations.some((entry) => entry.kind === 'construction') ? (
            <button
              disabled={!document.ready}
              title="Заменить слои изображениями постройки; звуки и маркеры сохраняются. Undo отменяет замену."
              onClick={() => {
                const source = library.animations.find((entry) => entry.kind === 'construction')!;
                const config = createAnimationVariant(source.config, active.kind, active.config.id);
                config.timeline = { ...active.config.timeline };
                config.sounds = structuredClone(active.config.sounds);
                config.markers = structuredClone(active.config.markers);
                document.update({
                  ...document.preview,
                  config,
                  visible: true,
                  sourceRevision: document.preview.sourceRevision + 1,
                });
              }}
            >
              Use construction artwork
            </button>
          ) : null}
          {active.kind === 'custom' ? (
            <button
              disabled={!document.ready}
              onClick={() => {
                const animations = library.animations.filter(
                  (entry) => entry.id !== activeAnimationId,
                );
                if (animations[0])
                  document.editLibrary({ ...library, animations }, animations[0].id);
              }}
            >
              Delete animation
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
