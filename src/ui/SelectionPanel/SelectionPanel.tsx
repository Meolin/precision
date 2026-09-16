import type { RtsController } from '../../game/client/RtsController';
import type { GameRuntime } from '../../game/core/GameRuntime';
import type { InstallationOrder } from '../../game/orders/InstallationOrder';
import { isWeaponId, weaponDefinitions } from '../../game/weapons/weaponDefinitions';
import { formatNumber, useTelemetry } from '../useTelemetry';
import './SelectionPanel.css';

function orderLabel(order: InstallationOrder): string {
  return order.type === 'attackTarget' ? `Цель #${order.targetEntityId}`
    : `Точка ${formatNumber(order.targetPosition.x, 1)} / ${formatNumber(order.targetPosition.y, 1)} m`;
}

const failures = {
  noBallisticSolution: 'NO BALLISTIC SOLUTION — нет траектории',
  targetLost: 'Цель уничтожена или недоступна',
  unsupported: 'Нет опоры',
};

export function SelectionPanel({ runtime, controls }: { runtime: GameRuntime; controls: RtsController }) {
  const data = useTelemetry(runtime, controls);
  const selected = data.selectedInstallations;
  const hovered = data.hoveredUnit;
  const inspect = hovered ?? data.units.find((unit) => unit.id === data.inspectedEntityId);
  const counts = new Map<string, number>();
  for (const unit of selected) {
    const name = weaponDefinitions[unit.installationType].name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return (
    <section className="selection-panel" aria-label="Управление установками">
      <div className="selection-heading">
        <strong>ВЫБРАНО: {data.selectedIds.length}</strong>
        <span>{[...counts].map(([name, count]) => `${count} × ${name}`).join(' · ') || 'ЛКМ или рамка — выделить установки'}</span>
      </div>
      <div className="selection-actions">
        <button disabled={!selected.length} aria-pressed={data.inputMode === 'attackGround'} onClick={(event) => controls.startTargeting(event.shiftKey)}>A · Огонь по точке</button>
        <button disabled={!selected.length} onClick={(event) => controls.stop(event.shiftKey)}>S · Стоп</button>
        <button disabled={selected.length !== 1} onClick={() => controls.manualFire()}>Space · Ручной выстрел</button>
        <select aria-label="Оружие выбранных установок" disabled={!selected.length} value={data.selectionWeaponId ?? ''}
          onChange={(event) => { if (isWeaponId(event.target.value)) controls.setWeapon(event.target.value); }}>
          <option value="" disabled>{data.mixedWeapons ? 'Оружие: Mixed' : 'Нет выделения'}</option>
          {Object.values(weaponDefinitions).map((weapon) => <option key={weapon.id} value={weapon.id}>{weapon.name}</option>)}
        </select>
      </div>
      <p className="selection-hint" role="status">
        {data.inputMode === 'attackGround'
          ? `${data.queueTargeting ? 'ОЧЕРЕДЬ · ' : ''}Укажите точку ЛКМ. Shift добавляет приказ. Esc / ПКМ — отмена.`
          : 'ПКМ по противнику — атака цели. Shift добавляет приказ. Один приказ = один выстрел.'}
      </p>
      <div className="control-groups" aria-label="Группы управления">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((group) => (
          <button key={group} title={`Ctrl+${group} или Ctrl+клик — сохранить; ${group} или клик — выбрать`}
            onClick={(event) => { if (event.ctrlKey) controls.saveGroup(group); else controls.recallGroup(group); }}>
            <kbd>{group}</kbd> {data.controlGroups[group]?.length ?? 0}
          </button>
        ))}
      </div>
      <div className="selection-cards">
        {selected.map((unit) => (
          <article key={unit.id} className="selection-card">
            <button className="installation-name" onClick={() => controls.setSelection([unit.id])}>#{unit.id} · {weaponDefinitions[unit.installationType].name}</button>
            <span>{formatNumber(unit.health.current, 1)} / {unit.health.max} HP · {weaponDefinitions[unit.weaponId].name}</span>
            <meter min={0} max={unit.health.max} value={unit.health.current} aria-label={`Здоровье установки ${unit.id}`} />
            <span>Перезарядка: {formatNumber(Math.max(0, unit.nextFireTimeSeconds - data.seconds), 1)} s</span>
            <span>{unit.orders[0] ? orderLabel(unit.orders[0]) : unit.fireControl.status === 'fired' ? 'Выстрел выполнен' : 'Нет приказа'} · Очередь {unit.orders.length}/{runtime.getConfig().rts.maxOrders}</span>
            {unit.fireControl.lastFailure && <span className="order-failure">{failures[unit.fireControl.lastFailure]}</span>}
            {unit.fireControl.lastSolution && <span>Решение: {formatNumber(unit.fireControl.lastSolution.angleRad * 180 / Math.PI, 1)}° · {formatNumber(unit.fireControl.lastSolution.flightSeconds, 1)} s</span>}
            {unit.orders.length > 1 && <details><summary>Очередь приказов</summary><ol>{unit.orders.map((order, index) => <li key={index}>{orderLabel(order)}</li>)}</ol></details>}
          </article>
        ))}
      </div>
      {inspect && <p className="selection-hint">{inspect.ownerPlayerId === controls.playerId ? 'Своя установка' : 'Противник'} #{inspect.id} · {inspect.alive ? `${formatNumber(inspect.health.current, 1)} / ${inspect.health.max} HP` : 'Уничтожена'}</p>}
    </section>
  );
}
