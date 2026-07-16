import "server-only";

import { createPrivilegedDatabaseClient } from "@lumen/database/server";

export async function ensureApplicationAccount(accountId: string): Promise<void> {
  const { error } = await createPrivilegedDatabaseClient().rpc("admin_ensure_account", {
    p_actor_account_id: accountId,
  });
  if (error) throw new Error("ACCOUNT_PROVISIONING_FAILED");
}
