import type { WorldMap } from '@plaza/shared';
import type * as Phaser from 'phaser';

import { reportError } from '@/shared/lib/sentry';

import type { ThemeAssets } from '../../api/assets';
import type { EventBus } from '../../bridge/event-bus';
import type { OfficeStore } from '../../store/office-store';
import { deskCenter, deskDrawings } from './desk-drawings';
import { DeskLayer, type DeskProbe } from './DeskLayer';
import { PhaserThemeBackend, type PhaserTheme } from './phaser-theme-backend';
import { ThemeLoader } from './theme-loader';

/** Pan of "Ir a su escritorio". */
const DESK_PAN_MS = 450;

/** Personalization of the office as the development probe sees it (E2E tests). */
export interface OfficeProbe {
  /** Style currently drawn. */
  readonly themeId: string;
  /** Completed style changes. */
  readonly swaps: number;
  /** Style textures alive in the scene (the styles loaded ahead stay loaded). */
  readonly styleTextures: readonly string[];
  /** Styles loaded ahead, ready to be shown without loading. */
  readonly preloaded: readonly string[];
  readonly desks: readonly DeskProbe[];
}

export interface OfficeDeps {
  readonly map: WorldMap;
  /** Style the scene was created with, and its images already in the scene. */
  readonly theme: ThemeAssets;
  readonly drawn: PhaserTheme;
  readonly office: OfficeStore;
  readonly events: EventBus;
  readonly resolveTheme: (themeId: string) => Promise<ThemeAssets>;
  readonly decorUrlOf: (itemId: string) => string;
  /** Style ids of the template: loaded ahead, so a later change only cross-fades (< 2 s). */
  readonly listThemes?: () => Promise<readonly string[]>;
}

export interface OfficeAttachment {
  readonly probe: () => OfficeProbe;
  readonly dispose: () => void;
}

/**
 * Personalization of the office inside the world scene (E9): live style changes
 * (`ThemeLoader`), desk names and decoration (`DeskLayer`) and "Ir a su escritorio"
 * (`camera:desk`). Follows the {@link OfficeStore}; `dispose` removes everything it registered.
 */
export function attachOffice(scene: Phaser.Scene, deps: OfficeDeps): OfficeAttachment {
  const { map, office, events } = deps;
  const loader = new ThemeLoader<PhaserTheme>({
    initial: { assets: deps.theme, textures: deps.drawn },
    backend: new PhaserThemeBackend(scene),
    resolve: deps.resolveTheme,
    onError: (error) => {
      reportError(error);
    },
  });
  const layer = new DeskLayer(scene, deps.decorUrlOf);
  const drawDesks = () => {
    const { desks, preview } = office.getState();
    layer.sync(deskDrawings(map.desks, desks, preview));
  };
  const applyTheme = (themeId: string | null) => {
    if (themeId !== null) void loader.apply(themeId);
  };

  drawDesks();
  applyTheme(office.getState().themeId);
  deps
    .listThemes?.()
    .then((themeIds) => loader.preload(themeIds))
    .catch((error: unknown) => {
      reportError(error);
    });
  const cleanups = [
    office.subscribe((state, previous) => {
      if (state.desks !== previous.desks || state.preview !== previous.preview) drawDesks();
      if (state.themeId !== previous.themeId) applyTheme(state.themeId);
    }),
    events.on('camera:desk', ({ deskId }) => {
      const area = map.desks.find((desk) => desk.deskId === deskId);
      if (area === undefined) return;
      const { x, y } = deskCenter(area);
      const camera = scene.cameras.main;
      camera.stopFollow();
      camera.pan(x, y, DESK_PAN_MS, 'Sine.easeInOut');
    }),
  ];

  return {
    probe: () => ({
      themeId: loader.themeId,
      swaps: loader.swaps,
      styleTextures: scene.textures.getTextureKeys().filter((key) => key.startsWith('theme')),
      preloaded: loader.preloaded,
      desks: layer.probe(),
    }),
    dispose: () => {
      for (const dispose of cleanups.splice(0)) dispose();
      loader.dispose();
      layer.destroy();
    },
  };
}
