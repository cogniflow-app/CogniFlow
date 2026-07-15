import "server-only";

import {
  deriveServerCapabilities,
  sanitizeCapabilities,
  type PublicCapabilities,
  type ServerCapabilities,
} from "./capabilities";
import { getServerEnvironment } from "./server-env";

export function getServerCapabilities(): ServerCapabilities {
  return deriveServerCapabilities(getServerEnvironment());
}

export function getPublicCapabilities(): PublicCapabilities {
  return sanitizeCapabilities(getServerCapabilities());
}
