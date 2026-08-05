/**
 * Control Room server entry — pure re-exports for the Vercel API bundle.
 *
 * Keeps the API handler on one statically traced graph without importing the
 * control-room barrel (index) or any api/ sibling.
 */

export { listControlRoomScenarios } from "./ControlRoomFixtures";
export {
  ControlRoomService,
  ControlRoomServiceError,
} from "./ControlRoomService";
