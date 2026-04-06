// GSD-2 — Regression test for #3615: unstructured "continue" must inject task context
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Bug #3615: When a user types "continue" (or any bare text) to resume
 * an in-progress session, buildGuidedExecuteContextInjection() only
 * matched two hardcoded regex patterns (auto-dispatch and guided-resume).
 * The function returned null for any other input, so no task context was
 * injected — causing the agent to rebuild everything from scratch and
 * burn ~86k tokens.
 *
 * This test verifies the structural properties of the fix:
 *   1. buildGuidedExecuteContextInjection has a deriveState fallback
 *      that fires when neither regex matches
 *   2. The fallback is phase-gated to "executing" only
 *   3. The fallback checks for activeTask + activeMilestone + activeSlice
 *   4. The fallback calls buildTaskExecutionContextInjection with derived state
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemContextSource = readFileSync(
  join(__dirname, "..", "bootstrap", "system-context.ts"),
  "utf-8",
);

describe("#3615 — unstructured prompts must inject task context when work is active", () => {
  // Extract the buildGuidedExecuteContextInjection function body
  const fnStart = systemContextSource.indexOf("async function buildGuidedExecuteContextInjection(");
  assert.ok(fnStart >= 0, "should find buildGuidedExecuteContextInjection");
  // Find the closing brace — scan for the next top-level "async function" or end of file
  const fnEnd = systemContextSource.indexOf("\nasync function ", fnStart + 1);
  const fnBody = fnEnd >= 0
    ? systemContextSource.slice(fnStart, fnEnd)
    : systemContextSource.slice(fnStart);

  test("has a deriveState fallback after the two regex branches", () => {
    // The function should call deriveState outside of the resumeMatch block
    // Count deriveState calls — should be at least 2 (one in resumeMatch, one in fallback)
    const deriveStateCalls = fnBody.match(/deriveState\(basePath\)/g);
    assert.ok(
      deriveStateCalls && deriveStateCalls.length >= 2,
      `expected >=2 deriveState(basePath) calls in buildGuidedExecuteContextInjection, got ${deriveStateCalls?.length ?? 0}`,
    );
  });

  test("fallback is phase-gated to executing only", () => {
    // The fallback must check state.phase === "executing" to avoid misrouting
    // during replanning, gate evaluation, or other non-execution phases
    const afterFallbackComment = fnBody.indexOf("// Fallback:");
    assert.ok(afterFallbackComment >= 0, "should have a fallback comment after the regex branches");

    const fallbackSection = fnBody.slice(afterFallbackComment);
    assert.ok(
      fallbackSection.includes('state.phase === "executing"'),
      'fallback must be gated on state.phase === "executing" to prevent misrouting in non-execution phases',
    );
  });

  test("fallback checks for activeTask, activeMilestone, and activeSlice", () => {
    const afterFallbackComment = fnBody.indexOf("// Fallback:");
    const fallbackSection = fnBody.slice(afterFallbackComment);
    assert.ok(
      fallbackSection.includes("state.activeTask") &&
      fallbackSection.includes("state.activeMilestone") &&
      fallbackSection.includes("state.activeSlice"),
      "fallback must check all three state properties before injecting context",
    );
  });

  test("fallback calls buildTaskExecutionContextInjection with derived state", () => {
    const afterFallbackComment = fnBody.indexOf("// Fallback:");
    assert.ok(afterFallbackComment >= 0, "should have a fallback comment after the regex branches");

    const fallbackSection = fnBody.slice(afterFallbackComment);
    assert.ok(
      fallbackSection.includes("buildTaskExecutionContextInjection"),
      "fallback section must call buildTaskExecutionContextInjection",
    );
    assert.ok(
      fallbackSection.includes("state.activeMilestone.id") &&
      fallbackSection.includes("state.activeSlice.id") &&
      fallbackSection.includes("state.activeTask.id"),
      "fallback must pass state-derived IDs to buildTaskExecutionContextInjection",
    );
  });

  test("function does NOT return null before the fallback", () => {
    // There should be exactly one "return null" at the very end, after the fallback
    const returnNulls = fnBody.match(/return null;/g);
    assert.ok(
      returnNulls && returnNulls.length === 1,
      `expected exactly 1 'return null' (at end after fallback), got ${returnNulls?.length ?? 0}`,
    );
  });
});
