import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";

import type { Database } from "./database.types";

export type DatabaseClient = SupabaseClient<Database>;

export interface DatabaseCookie {
  readonly name: string;
  readonly value: string;
}

export type DatabaseCookieOptions = CookieOptions;

export interface DatabaseCookieMutation extends DatabaseCookie {
  readonly options: DatabaseCookieOptions;
}

export type DatabaseResponseHeaders = Readonly<Record<string, string>>;

export interface ServerCookieStore {
  getAll(): readonly DatabaseCookie[];
  setAll?(
    cookies: readonly DatabaseCookieMutation[],
    responseHeaders: DatabaseResponseHeaders,
  ): void | Promise<void>;
}

export interface MutableServerCookieStore extends ServerCookieStore {
  setAll(
    cookies: readonly DatabaseCookieMutation[],
    responseHeaders: DatabaseResponseHeaders,
  ): void | Promise<void>;
}
