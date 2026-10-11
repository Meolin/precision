import type { BuildingAnimationPreview } from '../../game/buildings/BuildingAnimationPreview';

const snapshot = <T extends BuildingAnimationPreview>(preview: T): T => structuredClone(preview);

export class AnimationHistory<T extends BuildingAnimationPreview = BuildingAnimationPreview> {
  readonly undo: T[] = [];
  readonly redo: T[] = [];
  remember(preview: T): void {
    this.undo.push(snapshot(preview));
    if (this.undo.length > 60) this.undo.shift();
    this.redo.length = 0;
  }
  restore(direction: 'undo' | 'redo', current: T): T | undefined {
    const next = this[direction].pop();
    if (!next) return undefined;
    this[direction === 'undo' ? 'redo' : 'undo'].push(snapshot(current));
    return { ...next, sourceRevision: current.sourceRevision + 1 };
  }
}
