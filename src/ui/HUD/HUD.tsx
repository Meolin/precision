import type { GameRuntime } from '../../game/core/GameRuntime';
import { formatNumber, useTelemetry } from '../useTelemetry';

export function HUD({ runtime }: { runtime: GameRuntime }) {
  const data = useTelemetry(runtime);
  const values = [
    { label: 'Угол ствола', value: formatNumber(data.angle, 1), unit: '°' },
    { label: 'Начальная скорость', value: formatNumber(data.velocity, 1), unit: 'm/s' },
    { label: 'Масса снаряда', value: formatNumber(data.mass, 1), unit: 'kg' },
    { label: 'Дульная энергия', value: formatNumber(data.muzzleEnergy), unit: 'J' },
  ];
  return (
    <>
      <div className="weapon-status" aria-label="Выбранное оружие">
        <span>
          <b>{data.weaponName}</b> / {data.projectileName}
          {data.weaponPending ? ' · в очереди' : ''}
        </span>
        <span>
          {data.cooldownRemaining > 0
            ? `До выстрела ${formatNumber(data.cooldownRemaining, 1)} s`
            : 'Готово к выстрелу'}
        </span>
      </div>
      <div className="hud" aria-label="Параметры выстрела">
        {values.map((item, index) => (
          <div className={`hud-item ${index === 3 ? 'accent-value' : ''}`} key={item.label}>
            <span className="eyebrow">{item.label}</span>
            <div className="hud-value">
              {item.value}
              <span>{item.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function FlightTelemetry({ runtime }: { runtime: GameRuntime }) {
  const data = useTelemetry(runtime);
  return (
    <section className="telemetry" aria-label="Телеметрия">
      <div className="telemetry-column">
        <div className="section-caption">
          <span>01 / В полёте</span>
          <span className="small-badge">{data.active} ACTIVE</span>
        </div>
        <div className="telemetry-values">
          <div>
            <span>Скорость</span>
            <strong>
              {formatNumber(data.speed, 1)} <small>m/s</small>
            </strong>
          </div>
          <div>
            <span>Текущая энергия</span>
            <strong>
              {formatNumber(data.energy)} <small>J</small>
            </strong>
          </div>
        </div>
        <p>Данные последнего активного снаряда</p>
      </div>
      <div className="telemetry-column impact-column">
        <div className="section-caption">
          <span>02 / Последнее попадание</span>
          <span className="impact-dot" />
        </div>
        <p>{data.impactWeapon ? `${data.impactWeapon} / ${data.impactProjectile}` : '—'}</p>
        <p>
          Материал: <b>{data.impactMaterial ?? '—'}</b> · Пробитие:{' '}
          <b>
            {data.penetrationStatus === 'success'
              ? 'SUCCESS'
              : data.penetrationStatus === 'penetrating'
                ? 'В ПРОЦЕССЕ'
                : data.penetrationStatus === 'stopped'
                  ? 'STOPPED'
                  : data.penetrationStatus === 'disabled'
                    ? 'ВЫКЛЮЧЕНО'
                    : '—'}
          </b>
        </p>
        <div className="telemetry-values">
          <div>
            <span>Энергия удара</span>
            <strong>
              {formatNumber(data.impactEnergy)} <small>J</small>
            </strong>
          </div>
          <div>
            <span>Радиус кратера</span>
            <strong>
              {formatNumber(data.crater, 2)} <small>m</small>
            </strong>
          </div>
        </div>
        <p>
          Скорость: {formatNumber(data.impactSpeed, 2)} m/s · x: {formatNumber(data.impactX, 2)} m ·
          y: {formatNumber(data.impactY, 2)} m
        </p>
        <div className="telemetry-values penetration-telemetry">
          <div>
            <span>Глубина пробития</span>
            <strong>
              {formatNumber(data.penetrationDepth, 2)} <small>m</small>
            </strong>
          </div>
          <div>
            <span>Потеря энергии</span>
            <strong>
              {formatNumber(data.energyLost)} <small>J</small>
            </strong>
          </div>
          <div>
            <span>Остаток энергии</span>
            <strong>
              {formatNumber(data.remainingEnergy)} <small>J</small>
            </strong>
          </div>
          <div>
            <span>Скорость выхода</span>
            <strong>
              {formatNumber(data.exitSpeed, 2)} <small>m/s</small>
            </strong>
          </div>
        </div>
        <p>
          {data.removed === null
            ? 'Сделайте первый выстрел по рельефу'
            : `Удалено ячеек грунта: ${formatNumber(data.removed)}`}
        </p>
      </div>
    </section>
  );
}

export function SceneStatus({ runtime }: { runtime: GameRuntime }) {
  const data = useTelemetry(runtime);
  return (
    <div className="scene-status">
      <span>
        SEED <b>{data.seed}</b>
      </span>
      <span>
        TICK <b>{data.tick}</b>
      </span>
      <span>
        TIME <b>{data.seconds.toFixed(1)} s</b>
      </span>
      <span>
        SHOTS <b>{data.shots}</b>
      </span>
      <span className="queue-status">
        {data.queued > 0 ? `В очереди: ${data.queued}` : 'LOCAL SIMULATION'}
      </span>
    </div>
  );
}
