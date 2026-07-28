/**
 * Generates the published JSON Schema from the Zod single source of truth.
 * Output: packages/schema/json-schema/conversation.v1.json
 *
 * Run: pnpm --filter @ace/schema run build:json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Conversation, SCHEMA_VERSION } from "../src/conversation.js";

const jsonSchema = zodToJsonSchema(Conversation, {
  name: "Conversation",
  $refStrategy: "root",
});

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "json-schema");
mkdirSync(outDir, { recursive: true });

const outFile = join(outDir, `conversation.v${SCHEMA_VERSION}.json`);
writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + "\n", "utf8");

console.log(`Wrote ${outFile}`);
