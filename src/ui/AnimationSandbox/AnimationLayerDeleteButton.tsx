export function AnimationLayerDeleteButton({
  name,
  disabled,
  onDelete,
}: {
  name: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      className="animation-layer-delete"
      aria-label={`Удалить слой ${name}`}
      title={
        disabled
          ? 'Удаление недоступно: блокировка или загрузка документа'
          : `Удалить ${name} вместе с его эффектами · Undo восстанавливает слой`
      }
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onDelete();
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </svg>
    </button>
  );
}
