import type {
  BuildingAnimationKeyframe,
  BuildingAnimationTrackProperty,
} from '../../game/buildings/BuildingAnimationConfig';

export type SelectedAnimationKey = {
  stageId: string;
  property: BuildingAnimationTrackProperty;
  id: string;
};
export type AnimationClipboardKey = Omit<BuildingAnimationKeyframe, 'id' | 'time'> & {
  stageId: string;
  property: BuildingAnimationTrackProperty;
  offset: number;
};

export interface AnimationTimelineView {
  property: BuildingAnimationTrackProperty;
  selectedKeys: SelectedAnimationKey[];
  expanded: string[];
  animatedOnly: boolean;
  graphMode: boolean;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  selectedLayerIds: string[];
  audioSelectedId: string | null;
  audioZoom: number;
}

/** Local editor context survives panel remounts; it is never part of exported game data. */
export class AnimationEditorSession {
  clipboard: AnimationClipboardKey[] = [];
  private readonly views = new Map<string, AnimationTimelineView>();

  view(animationId: string): AnimationTimelineView {
    let view = this.views.get(animationId);
    if (!view) {
      view = {
        property: 'x',
        selectedKeys: [],
        expanded: [],
        animatedOnly: false,
        graphMode: false,
        zoom: 1,
        scrollLeft: 0,
        scrollTop: 0,
        selectedLayerIds: [],
        audioSelectedId: null,
        audioZoom: 1,
      };
      this.views.set(animationId, view);
    }
    return view;
  }
}
