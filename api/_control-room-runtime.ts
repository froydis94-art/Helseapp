/**
 * Control Room runtime bridge (PATCH 016F).
 *
 * Re-exports only the AI OS Control Room surface needed by the API handler.
 * AI OS remains the source of truth — this file does not duplicate logic.
 *
 * Vercel compiles this TypeScript module (and its src/ai graph) into the
 * serverless function bundle. The HTTP handler must never runtime-require
 * raw ../src/ai/control-room/index TypeScript.
 *
 * Underscore prefix: not a product endpoint. Default export always 404s if
 * this file is ever addressed as its own serverless entry.
 */

import {
  ControlRoomService,
  ControlRoomServiceError,
  listControlRoomScenarios,
} from "../src/ai/control-room/index";

export {
  ControlRoomService,
  ControlRoomServiceError,
  listControlRoomScenarios,
};

export function createControlRoomService(): InstanceType<
  typeof ControlRoomService
> {
  return new ControlRoomService();
}

export default function controlRoomRuntimeBridgeNotAnEndpoint(
  _req: unknown,
  res: { status: (code: number) => { end: () => void } }
): void {
  res.status(404).end();
}
