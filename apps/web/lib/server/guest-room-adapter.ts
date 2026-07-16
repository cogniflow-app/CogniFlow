import "server-only";

import type { GuestRoomAdapter } from "@lumen/auth/guests";

/**
 * Phase 01 deliberately has no production game-room repository. A later game
 * phase replaces this adapter; test rooms stay in test code and can never be
 * discovered by a deployed application.
 */
export const productionGuestRoomAdapter: GuestRoomAdapter = Object.freeze({
  async findByJoinCode() {
    return null;
  },
});
