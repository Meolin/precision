export type ImpactDefinitionId = 'basicImpact' | 'mortarImpact';

export interface ImpactDefinition {
  readonly id: ImpactDefinitionId;
  readonly terrainDamage: Readonly<{
    enabled: boolean;
    baseRadiusMeters: number;
    energyScale: number;
    maxRadiusMeters: number;
  }>;
}
