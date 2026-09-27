import { z } from 'zod';

import { DecorItemIdSchema, DeskDecorSchema, DeskIdSchema, IdSchema } from './common.js';

/** State of a desk. Free desks have `userId: null`. Also the `desk:updated` payload (E9). */
export const DeskStateSchema = z.object({
  deskId: DeskIdSchema,
  userId: IdSchema.nullable(),
  /** Owner name shown over the desk. */
  displayName: z.string().nullable(),
  decor: DeskDecorSchema.nullable(),
});
export type DeskState = z.infer<typeof DeskStateSchema>;

export const DeskParamsSchema = z.object({ spaceId: IdSchema, deskId: DeskIdSchema });
export type DeskParams = z.infer<typeof DeskParamsSchema>;

/** `GET /api/spaces/:spaceId/desks` (members): occupied desks only. */
export const DesksResponseSchema = z.object({ desks: z.array(DeskStateSchema) });
export type DesksResponse = z.infer<typeof DesksResponseSchema>;

/**
 * `PUT /api/spaces/:spaceId/desks/:deskId`: claim a free desk for myself (frees my previous
 * one, RN-13) or, as owner, assign it to `userId` (RN-14). Taken desk → 409 `DESK_TAKEN`.
 */
export const ClaimDeskBodySchema = z.object({
  userId: IdSchema.optional(),
});
export type ClaimDeskBody = z.infer<typeof ClaimDeskBodySchema>;

export const DeskResponseSchema = z.object({ desk: DeskStateSchema });
export type DeskResponse = z.infer<typeof DeskResponseSchema>;

// `DELETE /api/spaces/:spaceId/desks/:deskId` → 204: its owner or a space owner frees it.

/**
 * `PATCH /api/spaces/:spaceId/desks/:deskId/decor` (desk owner only, 403 otherwise).
 * Items outside the catalog → 400 `UNKNOWN_DECOR_ITEM`; more than 3 → 400 (RN-15).
 */
export const UpdateDeskDecorBodySchema = DeskDecorSchema;
export type UpdateDeskDecorBody = z.infer<typeof UpdateDeskDecorBodySchema>;

/** An object of the decoration catalog (`packages/maps/decor`). */
export const DecorItemDtoSchema = z.object({
  id: DecorItemIdSchema,
  /** Display name (Spanish). The web may override it with the i18n key `catalog:decor.<id>`. */
  name: z.string(),
  spriteUrl: z.string(),
});
export type DecorItemDto = z.infer<typeof DecorItemDtoSchema>;

/** `GET /api/decor`. */
export const DecorCatalogResponseSchema = z.object({ items: z.array(DecorItemDtoSchema) });
export type DecorCatalogResponse = z.infer<typeof DecorCatalogResponseSchema>;
