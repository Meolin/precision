import type { GameConfig } from '../config/GameConfig';
import { toRadians } from '../math/Vec2';
import { refreshUnitGrounding } from '../movement/terrainGrounding';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import type { WeaponId } from '../weapons/WeaponDefinition';
import { weaponDefinitions } from '../weapons/weaponDefinitions';
import { spawnCannon } from './Cannon';
import type { InstallationState } from './InstallationState';

export function spawnInstallations(terrain: TerrainGrid, config: GameConfig): InstallationState[] {
  const installations: InstallationState[] = [];
  const loadout: WeaponId[] = ['basicCannon', 'mortar', 'mortar', 'heavyPenetrator', 'basicCannon'];
  const count = config.rts.installationsPerPlayer;
  const radius = config.cannon.mountHeightMeters;
  // Interleaved IDs retain #1 (player) and #2 (opponent) for existing combat tools.
  for (let slot = 0; slot < count; slot++) {
    for (const playerId of [1, 2]) {
      const weaponId = loadout[slot] ?? 'basicCannon';
      const installation = spawnCannon(terrain, config);
      const fraction =
        playerId === 1 ? config.cannon.spawnXFraction + slot * 0.065 : 0.72 + slot * 0.065;
      const x = config.world.widthMeters * fraction;
      if (
        x - radius < 0 ||
        x + radius > config.world.widthMeters ||
        installations.some(
          (other) => Math.abs(other.position.x - x) < radius + other.hitbox.radiusMeters,
        )
      )
        throw new Error('World is too narrow for non-overlapping installation spawns.');
      installation.id = slot * 2 + playerId;
      installation.teamId = playerId;
      installation.ownerPlayerId = playerId;
      installation.position.x = x;
      installation.installationType = weaponId;
      installation.weaponId = weaponId;
      const elevation = toRadians(weaponDefinitions[weaponId].defaultAngleDeg);
      installation.angleRad = playerId === 1 ? elevation : Math.PI - elevation;
      refreshUnitGrounding(installation, terrain);
      if (!installation.grounding.grounded) throw new Error('Installation spawn requires support.');
      installations.push(installation);
    }
  }
  return installations;
}
