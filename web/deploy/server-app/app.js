// Entry point for DirectAdmin's Node.js Selector (Passenger runs this file, not `npm start`).
// tsx's loader runs the TypeScript sources directly, so the host needs no build step.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("tsx/esm", pathToFileURL("./"));
await import("./server/index.ts");
