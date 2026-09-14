import { TerrainMaterialId } from './TerrainMaterialId';

/** Gameplay tuning, not measured physical material properties. */
export interface TerrainMaterialDefinition {
  readonly id: TerrainMaterialId;
  readonly name: string;
  readonly density: number;
  readonly hardness: number;
  /** 0 disables ricochet; 1 uses the projectile's angle threshold unchanged. */
  readonly ricochetFactor: number;
  /** Energy cost in J/m before the projectile's penetrationPower modifier. */
  readonly penetrationResistance: number;
  /** Reserved for later blast tuning; Step 3 preserves the original crater law. */
  readonly blastResistance: number;
}

export const terrainMaterialDefinitions: Readonly<
  Record<TerrainMaterialId, TerrainMaterialDefinition>
> = Object.freeze({
  [TerrainMaterialId.Air]: Object.freeze({
    id: TerrainMaterialId.Air,
    name: 'Air',
    density: 0,
    hardness: 0,
    ricochetFactor: 0,
    penetrationResistance: 0,
    blastResistance: 0,
  }),
  [TerrainMaterialId.Soil]: Object.freeze({
    id: TerrainMaterialId.Soil,
    name: 'Soil',
    density: 1,
    hardness: 1,
    ricochetFactor: 0,
    penetrationResistance: 1500,
    blastResistance: 1,
  }),
  [TerrainMaterialId.Rock]: Object.freeze({
    id: TerrainMaterialId.Rock,
    name: 'Rock',
    density: 3,
    hardness: 8,
    ricochetFactor: 1,
    penetrationResistance: 12000,
    blastResistance: 4,
  }),
});
