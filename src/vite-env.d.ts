/// <reference types="vite/client" />

declare const __TERRAIN_ROCK_TEXTURE_ASSETS__: readonly {
  readonly id: string;
  readonly label: string;
  readonly assetUrl: string;
  readonly alphaAssetUrl?: string;
  readonly densityAssetUrl?: string;
  readonly format: 'albedo' | 'albedo-normal-horizontal';
}[];
