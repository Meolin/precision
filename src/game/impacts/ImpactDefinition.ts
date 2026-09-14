export type ImpactDefinitionId = 'basicImpact' | 'mortarImpact' | 'penetratorImpact';

export interface ImpactDefinition {
  readonly id: ImpactDefinitionId;
  /** Surface crater tuning is independent of the penetration channel. */
  readonly terrainDamage: Readonly<{
    enabled: boolean;
    baseRadiusMeters: number;
    energyScale: number;
    maxRadiusMeters: number;
  }>;
  readonly penetrationDamage?: Readonly<{ channelRadiusScale: number }>;
  /** Small surface chip, independent of the stop crater and penetration channel. */
  readonly ricochetDamage?: ImpactDefinition['terrainDamage'];
}
