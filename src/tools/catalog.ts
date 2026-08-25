import { PSA_TOOL_SPECS } from "./psa.js";
import { AUTOMATE_TOOL_SPECS } from "./automate.js";
import { CONTROL_TOOL_SPECS } from "./screenconnect.js";
import { catalogEntry, type CatalogEntry, type ToolSpec } from "./spec.js";

/**
 * Every tool this server can register, in registration order, independent of any
 * configuration. The generated docs and the MCPB manifest are built from this, and CI
 * compares it against what an actually-constructed server registers — so the catalog
 * cannot describe a tool surface the server does not have.
 */
export const TOOL_SPECS: ToolSpec[] = [
  ...PSA_TOOL_SPECS,
  ...AUTOMATE_TOOL_SPECS,
  ...CONTROL_TOOL_SPECS,
];

export const TOOL_CATALOG: CatalogEntry[] = TOOL_SPECS.map(catalogEntry);
