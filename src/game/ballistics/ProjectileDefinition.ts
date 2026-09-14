import type { ImpactDefinitionId } from '../impacts/ImpactDefinition';

export type ProjectileDefinitionId = 'basicShell' | 'mortarShell';

export interface ProjectileDefinition {
  readonly id: ProjectileDefinitionId;
  readonly name: string;
  readonly massKg: number;
  readonly radiusMeters: number;
  readonly gravityScale: number;
  readonly windInfluence: number;
  /** Multiplier for the world's linear air drag; 1 preserves MVP physics. */
  readonly dragCoefficient: number;
  readonly maxLifetimeSeconds: number;
  readonly impactDefinitionId: ImpactDefinitionId;
}
