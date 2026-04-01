import { PlanDepth, PlanQuery } from "./types";

const DEPTH_INSTRUCTIONS: Record<PlanDepth, string> = {
  overview: `High-level architectural overview with main modules and responsibilities.`,
  standard: `Detailed file-level plan with:
- Full directory & file structure
- Each file's purpose and key exports
- Main functions/classes with TypeScript signatures
- Data flow between files
- npm dependencies`,
  detailed: `Comprehensive plan with:
- Complete directory & file structure
- Every file's purpose, exports, and imports
- Every function/class with full TypeScript signatures + implementation notes
- Code snippets for non-obvious logic
- ASCII data-flow diagrams
- API contracts and interface definitions
- Database schema (if applicable)
- All environment variables
- Step-by-step build order`,
};

export function buildPlanSystemPrompt(depth: PlanDepth): string {
  return `You are a senior software architect. Generate a detailed, actionable, single-PR implementation plan.

${DEPTH_INSTRUCTIONS[depth]}

Use this EXACT markdown structure:

## Project Overview
[What it does, key features]

## Architecture
[Design decisions, patterns, trade-offs]

## Directory Structure
\`\`\`
[ASCII file tree]
\`\`\`

## File-Level Plan
### \`path/to/file.ts\`
**Purpose:** [one sentence]
**Symbols:**
- \`functionName(param: Type): ReturnType\` — [description]

## Implementation Steps
[Numbered, ordered list of concrete actions]

## Dependencies
[npm install commands]

## Environment Variables
[VAR_NAME=description, one per line]

## PR Checklist
- [ ] [verification item]

Be precise with TypeScript types. Think about edge cases and error handling.`;
}

export function buildPlanUserPrompt(query: PlanQuery): string {
  const parts = [
    `Goal: ${query.goal}`,
    `Expected outcome: ${query.expectedOutcome}`,
  ];
  if (query.constraints) parts.push(`Constraints: ${query.constraints}`);
  if (query.stack) parts.push(`Tech stack: ${query.stack}`);
  parts.push(`Project type: ${query.type}`);
  parts.push(`Detail level: ${query.depth}`);
  if (query.context.length > 0) {
    parts.push("\n--- Attached Context ---");
    for (const ctx of query.context) {
      parts.push(`[${ctx.type.toUpperCase()}] ${ctx.label}:\n${ctx.content}`);
    }
  }
  return parts.join("\n");
}

export function buildIntentClarificationSystemPrompt(): string {
  return `You are a senior software architect scoping a complex project.

Given a user's goal, generate 2–4 strategic clarifying questions that will meaningfully improve the phase breakdown.

Focus on:
- Business goals and user flows that affect architecture
- Integration needs (third-party APIs, existing systems)
- Performance, security, or scalability constraints not mentioned
- Deployment environment or infrastructure requirements

Return ONLY a JSON array of question strings — no markdown, no preamble:
["Question 1?", "Question 2?", "Question 3?"]

Rules:
- Max 4 questions. Fewer is better.
- Only ask if the answer would change the architecture or phase structure.
- Do NOT ask about things already stated in the goal or constraints.
- If the goal is already clear and well-scoped, return an empty array: []`;
}

export function buildPhaseBreakdownSystemPrompt(): string {
  return `You are a senior software architect. Break down a complex goal into iterative, executable phases.

Each phase must be independently deployable or validatable — no phase should require the next one to be testable.

Return ONLY a valid JSON object (no markdown, no preamble):
{
  "phases": [
    {
      "number": 1,
      "title": "Short phase title",
      "goal": "What this phase achieves",
      "steps": ["step 1", "step 2", "..."],
      "validationCriteria": ["How to confirm this phase is done"],
      "dependencies": [],
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ]
}

Rules:
- 3–7 phases maximum. More than 7 means you need to split further.
- Each phase should take 1–3 days of focused work.
- Phase 1 must always be foundational (setup, scaffolding, core models).
- Later phases build progressively on earlier ones.
- validationCriteria must be concrete and testable.
- dependencies is an array of phase numbers (e.g. [1, 2]).`;
}

export function buildPhaseBreakdownUserPrompt(
  query: import("./types.js").PhaseQuery
): string {
  const parts = [
    `Goal: ${query.goal}`,
    `Expected outcome: ${query.expectedOutcome}`,
  ];
  if (query.constraints) parts.push(`Constraints: ${query.constraints}`);
  if (query.stack) parts.push(`Tech stack: ${query.stack}`);
  parts.push(`Project type: ${query.type}`);
  if (query.context.length > 0) {
    parts.push("\n--- Context ---");
    for (const ctx of query.context) {
      parts.push(`[${ctx.type.toUpperCase()}] ${ctx.label}:\n${ctx.content}`);
    }
  }
  return parts.join("\n");
}

export function buildPhasePlanSystemPrompt(): string {
  return `You are a senior software architect. Generate a detailed, actionable implementation plan for a single phase of a larger project.

Use this EXACT markdown structure:

## Phase Goal
[What this phase achieves]

## Directory Structure
\`\`\`
[Files created or modified in this phase only]
\`\`\`

## File-Level Plan
### \`path/to/file.ts\`
**Purpose:** [one sentence]
**Symbols:**
- \`functionName(param: Type): ReturnType\` — [description]

## Implementation Steps
[Numbered, ordered, concrete actions]

## Dependencies
[npm install commands, if any new ones needed]

## Validation Checklist
- [ ] [how to confirm this phase works]

Be precise. Only include what belongs to THIS phase — not future phases.`;
}

export function buildPhasePlanUserPrompt(
  phase: import("./types.js").Phase,
  query: import("./types.js").PhaseQuery,
  previousPhases: import("./types.js").Phase[]
): string {
  const parts = [
    `Overall goal: ${query.goal}`,
    `Tech stack: ${query.stack || "AI to decide"}`,
    `Project type: ${query.type}`,
    `\nPhase ${phase.number}: ${phase.title}`,
    `Phase goal: ${phase.goal}`,
    `Phase steps: ${phase.steps.join(", ")}`,
    `Validation: ${phase.validationCriteria.join(", ")}`,
  ];
  if (previousPhases.length > 0) {
    parts.push("\nCompleted phases (already built):");
    for (const p of previousPhases) {
      parts.push(`  Phase ${p.number}: ${p.title} — ${p.goal}`);
    }
  }
  return parts.join("\n");
}
