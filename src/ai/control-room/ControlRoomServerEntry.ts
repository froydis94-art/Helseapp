/**
 * Control Room server entry — lightweight pure re-exports for the Vercel API.
 *
 * GET unlock must boot without loading the heavy service / runtime graph.
 * This file re-exports only listControlRoomScenarios from ControlRoomFixtures
 * (no barrel, no service class, no provider coupling).
 */

export { listControlRoomScenarios } from "./ControlRoomFixtures";
