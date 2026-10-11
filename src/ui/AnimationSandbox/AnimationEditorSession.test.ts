import { describe, expect, it } from 'vitest';
import { AnimationEditorSession } from './AnimationEditorSession';

describe('animation editor session', () => {
  it('restores each animation context independently after mode and document switches', () => {
    const session = new AnimationEditorSession();
    Object.assign(session.view('construction'), {
      graphMode: true,
      expanded: ['anchor'],
      property: 'opacity',
      zoom: 4,
      scrollLeft: 120,
      audioSelectedId: 'impact',
    });
    session.view('idle').expanded.push('complete');
    expect(session.view('construction')).toMatchObject({
      graphMode: true,
      expanded: ['anchor'],
      property: 'opacity',
      zoom: 4,
      scrollLeft: 120,
      audioSelectedId: 'impact',
    });
    expect(session.view('idle').graphMode).toBe(false);
    expect(session.view('idle').expanded).toEqual(['complete']);
  });

  it('retains copied keys while switching views and keeps them out of document data', () => {
    const session = new AnimationEditorSession();
    session.clipboard = [
      {
        stageId: 'anchor',
        property: 'opacity',
        offset: 0,
        value: 0.5,
        interpolation: 'linear',
        bezier: [0.4, 0, 0.2, 1],
      },
    ];
    session.view('construction');
    session.view('destruction');
    expect(session.clipboard[0]?.value).toBe(0.5);
    expect(session.view('destruction')).not.toHaveProperty('clipboard');
  });
});
