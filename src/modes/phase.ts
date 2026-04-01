import { createOpenAI } from "@ai-sdk/openai";
import { collectContext } from "../context";
import {
  Phase,
  PhaseBreakdown,
  PhaseQuery,
  PhaseStatus,
  ProjectType,
} from "../types";
import {
  clackConfirm,
  clackSelect,
  clackText,
  divider,
  renderMarkdown,
  step,
} from "../ui";
import * as p from "@clack/prompts";
import { generateText, streamText } from "ai";
import {
  buildIntentClarificationSystemPrompt,
  buildPhaseBreakdownSystemPrompt,
  buildPhaseBreakdownUserPrompt,
  buildPhasePlanSystemPrompt,
  buildPhasePlanUserPrompt,
} from "../prompts";
import chalk from "chalk";
import { writeFileSync } from "fs";

const COMPLEXITY_BADGE: Record<string, string> = {
  low: chalk.bgGreen.black(" LOW "),
  medium: chalk.bgYellow.black(" MEDIUM "),
  high: chalk.bgRed.white(" HIGH "),
};

export async function runPhaseMode(): Promise<void> {
  step(1, "User Query");
  p.log.info(
    "Describe your complex goal — Traycer will break it into iterative phases."
  );
  console.log();

  const goal = await clackText({
    message: "What are you building?",
    validate: (v) =>
      (v?.trim().length ?? 0) > 5 ? undefined : "Please describe your goal",
  });

  const expectedOutcome = await clackText({
    message: "Expected outcome — what does the finished product look like?",
    validate: (v) =>
      (v?.trim().length ?? 0) > 3 ? undefined : "Describe the outcome",
  });

  const constraints = await clackText({
    message: "Constraints (optional):",
    placeholder: 'e.g. "must be serverless", "no paid services"',
  });

  const stack = await clackText({
    message: "Tech stack (leave blank for AI to decide):",
    placeholder: "e.g. Next.js, Prisma, Tailwind",
  });

  const type = await clackSelect<ProjectType>({
    message: "Project type:",
    options: [
      { label: "Full-Stack Web App", value: "fullstack" },
      { label: "Frontend Only", value: "web" },
      { label: "Backend API", value: "api" },
      { label: "CLI Tool", value: "cli" },
      { label: "Mobile App", value: "mobile" },
      { label: "Library / Package", value: "library" },
    ],
  });

  const addContext = await clackConfirm({
    message: "Attach context? (existing code, docs, etc.)",
    initialValue: false,
  });

  const context = addContext ? await collectContext() : [];
  const query: PhaseQuery = {
    goal,
    expectedOutcome,
    constraints,
    stack,
    type,
    context,
  };

  await runIntentClarification(query);
}

async function runIntentClarification(query: PhaseQuery): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    p.log.error("Missing API key. Run: mewoo config");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const spin = p.spinner();
  spin.start("Analyzing goal and forming clarifying questions…");

  let questions: string[] = [];
  try {
    const { text } = await generateText({
      model: openai(model),
      system: buildIntentClarificationSystemPrompt(),
      prompt: `Goal: ${query.goal}\nOutcome: ${query.expectedOutcome}\nStack: ${query.stack || "not specified"}\nType: ${query.type}\nConstraints: ${query.constraints || "none"}`,
      maxOutputTokens: 512,
    });

    // Parse JSON array of questions
    const cleaned = text.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    questions = match ? (JSON.parse(match[0]) as string[]) : [];
  } catch {
    // Non-fatal — skip clarification if it fails
    questions = [];
  }

  spin.stop("");

  // If no questions or user skips, go straight to phase generation
  if (questions.length === 0) {
    await generatePhases(query);
    return;
  }

  console.log();
  divider();
  step(2, "Intent Clarification");
  divider();
  console.log();
  p.log.info(
    "Traycer has a few strategic questions to better understand the scope:"
  );
  console.log();

  // Collect answers for each question
  const answers: string[] = [];
  for (let i = 0; i < questions.length; i++) {
    const answer = await clackText({
      message: `${i + 1}. ${questions[i]}`,
      placeholder: "Leave blank to skip",
    });
    answers.push(answer);
  }

  // Enrich query with clarification answers
  const clarifications = questions
    .map((q, i) => (answers[i] ? `Q: ${q}\nA: ${answers[i]}` : null))
    .filter(Boolean)
    .join("\n\n");

  const enrichedQuery: PhaseQuery = {
    ...query,
    constraints: [query.constraints, clarifications].filter(Boolean).join("\n"),
  };

  await generatePhases(enrichedQuery);
}

async function generatePhases(query: PhaseQuery): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    p.log.error("Missing API key. Run: mewoo config");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const spin = p.spinner();
  spin.start("Structuring work into phases…");

  let rawJson = "";
  try {
    const { text } = await generateText({
      model: openai(model),
      system: buildPhaseBreakdownSystemPrompt(),
      prompt: buildPhaseBreakdownUserPrompt(query),
      maxOutputTokens: 2048,
    });
    rawJson = text;
  } catch (err) {
    spin.stop("");
    p.log.error(`AI error: ${(err as Error).message}`);
    process.exit(1);
  }

  spin.stop("Phases generated:");

  let phases: Phase[] = [];
  try {
    const cleaned = rawJson.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = match
      ? (JSON.parse(match[0]) as { phases: Omit<Phase, "status">[] })
      : { phases: [] };
    phases = parsed.phases.map((ph) => ({
      ...ph,
      status: "pending" as PhaseStatus,
    }));
  } catch {
    p.log.error("Could not parse phase breakdown.");
    console.log(chalk.dim(rawJson.slice(0, 400)));
    return;
  }

  if (phases.length === 0) {
    p.log.error("No phases generated. Try again with a clearer goal.");
    return;
  }

  const breakdown: PhaseBreakdown = {
    id: Date.now(),
    date: new Date().toISOString(),
    query,
    phases,
    rawMarkdown: rawJson,
  };

  renderPhaseOverview(phases, query);
  await phaseOverviewMenu(breakdown);
}

function renderPhaseOverview(phases: Phase[], query: PhaseQuery): void {
  console.log();
  divider();
  step(3, "Phase Generation");
  divider();
  console.log();
  p.log.info(`Goal: ${chalk.white(query.goal)}`);
  console.log();

  phases.forEach((phase) => {
    const badge =
      COMPLEXITY_BADGE[phase.estimatedComplexity] ??
      chalk.dim(`[${phase.estimatedComplexity}]`);
    const deps =
      phase.dependencies.length > 0
        ? chalk.dim(`  (needs: Phase ${phase.dependencies.join(", ")})`)
        : "";
    const statusIcon =
      phase.status === "done"
        ? chalk.green("✓")
        : phase.status === "skipped"
          ? chalk.dim("–")
          : chalk.dim("○");

    console.log(
      `  ${statusIcon}  ` +
        chalk.cyan.bold(`Phase ${phase.number}: ${phase.title}`) +
        "  " +
        badge +
        deps
    );
    console.log(chalk.dim(`       ${phase.goal}`));

    if (phase.steps.length > 0) {
      phase.steps
        .slice(0, 3)
        .forEach((s) => console.log(chalk.dim(`       • ${s}`)));
      if (phase.steps.length > 3)
        console.log(chalk.dim(`       • …and ${phase.steps.length - 3} more`));
    }

    if (phase.validationCriteria.length > 0) {
      console.log(
        chalk.dim("       ✓ Done when: ") +
          chalk.white(phase.validationCriteria[0])
      );
    }
    console.log();
  });

  divider();
}

async function phaseOverviewMenu(breakdown: PhaseBreakdown): Promise<void> {
  console.log();

  const action = await clackSelect<string>({
    message: "What would you like to do?",
    options: [
      { label: "▶   Start         — begin with Phase 1", value: "start" },
      { label: "✏️   Edit phases   — add, remove, or reorder", value: "edit" },
      { label: "🔄  Regenerate    — re-run phase breakdown", value: "regen" },
      {
        label: "💾  Export        — save phase overview to file",
        value: "export",
      },
      { label: "    Done", value: "done" },
    ],
  });

  if (action === "start") {
    await workThroughPhases(breakdown);
  } else if (action === "edit") {
    await editPhasesMenu(breakdown);
  } else if (action === "regen") {
    p.log.info('Re-generating phase breakdown…');
    await generatePhases(breakdown.query);
  } else if (action === "export") {
    const filename = await clackText({ message: 'Filename:', placeholder: `phases-${breakdown.id}.md` });
    const out = filename.trim() || `phases-${breakdown.id}.md`;
    writeFileSync(out, buildPhasesMarkdown(breakdown), 'utf8');
    p.log.success(`Saved to ${out}`);
    await phaseOverviewMenu(breakdown);
  }
}

async function editPhasesMenu(breakdown: PhaseBreakdown): Promise<void> {
  console.log();

  const action = await clackSelect<string>({
    message: "Edit phases:",
    options: [
      { label: "➕  Add phase     — insert a new phase", value: "add" },
      { label: "🗑️   Remove phase  — delete a phase", value: "remove" },
      { label: "↕️   Reorder       — change phase sequence", value: "reorder" },
      {
        label: "🔀  Merge         — combine two phases into one",
        value: "merge",
      },
      { label: "    Back", value: "back" },
    ],
  });

  if (action === "add") {
    await addPhase(breakdown);
    renderPhaseOverview(breakdown.phases, breakdown.query);
    await editPhasesMenu(breakdown);
  } else if (action === "remove") {
    await removePhase(breakdown);
    renderPhaseOverview(breakdown.phases, breakdown.query);
    await editPhasesMenu(breakdown);
  } else if (action === "reorder") {
    await reorderPhases(breakdown);
    renderPhaseOverview(breakdown.phases, breakdown.query);
    await editPhasesMenu(breakdown);
  } else if (action === "merge") {
    await mergePhases(breakdown);
    renderPhaseOverview(breakdown.phases, breakdown.query);
    await editPhasesMenu(breakdown);
  } else {
    await phaseOverviewMenu(breakdown);
  }
}

async function addPhase(breakdown: PhaseBreakdown): Promise<void> {
  const title = await clackText({ message: "New phase title:" });
  const goal = await clackText({ message: "Phase goal:" });
  const afterStr = await clackText({
    message: `Insert after which phase? (1–${breakdown.phases.length}, or 0 for beginning):`,
    placeholder: String(breakdown.phases.length),
  });
  const after = parseInt(afterStr) || breakdown.phases.length;

  const newPhase: Phase = {
    number: 0, // renumbered below
    title,
    goal,
    steps: [],
    validationCriteria: [],
    dependencies: [],
    estimatedComplexity: "medium",
    status: "pending",
  };

  breakdown.phases.splice(after, 0, newPhase);
  // Renumber
  breakdown.phases.forEach((ph, i) => {
    ph.number = i + 1;
  });
  p.log.success(`Phase added after Phase ${after}.`);
}

async function removePhase(breakdown: PhaseBreakdown): Promise<void> {
  if (breakdown.phases.length <= 1) {
    p.log.warn("Cannot remove the only phase.");
    return;
  }

  const idStr = await clackSelect<string>({
    message: "Which phase to remove?",
    options: breakdown.phases.map((ph) => ({
      label: `Phase ${ph.number}: ${ph.title}`,
      value: String(ph.number),
    })),
  });

  const id = parseInt(idStr);
  breakdown.phases = breakdown.phases.filter((ph) => ph.number !== id);
  breakdown.phases.forEach((ph, i) => {
    ph.number = i + 1;
  });
  p.log.success(`Phase ${id} removed.`);
}

async function reorderPhases(breakdown: PhaseBreakdown): Promise<void> {
  const fromStr = await clackSelect<string>({
    message: "Move which phase?",
    options: breakdown.phases.map((ph) => ({
      label: `Phase ${ph.number}: ${ph.title}`,
      value: String(ph.number),
    })),
  });
  const toStr = await clackText({
    message: `Move to position (1–${breakdown.phases.length}):`,
  });
  const from = parseInt(fromStr);
  const to = Math.max(
    1,
    Math.min(breakdown.phases.length, parseInt(toStr) || 1)
  );
  const fromIdx = breakdown.phases.findIndex((ph) => ph.number === from);
  const [moved] = breakdown.phases.splice(fromIdx, 1);
  breakdown.phases.splice(to - 1, 0, moved);
  breakdown.phases.forEach((ph, i) => {
    ph.number = i + 1;
  });
  p.log.success(`Phase moved to position ${to}.`);
}

async function mergePhases(breakdown: PhaseBreakdown): Promise<void> {
  if (breakdown.phases.length < 2) {
    p.log.warn("Need at least 2 phases to merge.");
    return;
  }

  const aStr = await clackSelect<string>({
    message: "First phase:",
    options: breakdown.phases.map((ph) => ({
      label: `Phase ${ph.number}: ${ph.title}`,
      value: String(ph.number),
    })),
  });
  const a = parseInt(aStr);

  const bStr = await clackSelect<string>({
    message: "Second phase (will be merged into first):",
    options: breakdown.phases
      .filter((ph) => ph.number !== a)
      .map((ph) => ({
        label: `Phase ${ph.number}: ${ph.title}`,
        value: String(ph.number),
      })),
  });
  const b = parseInt(bStr);

  const phA = breakdown.phases.find((ph) => ph.number === a)!;
  const phB = breakdown.phases.find((ph) => ph.number === b)!;

  phA.title = `${phA.title} + ${phB.title}`;
  phA.goal = `${phA.goal}; ${phB.goal}`;
  phA.steps = [...phA.steps, ...phB.steps];
  phA.validationCriteria = [
    ...phA.validationCriteria,
    ...phB.validationCriteria,
  ];
  phA.estimatedComplexity = "high";

  breakdown.phases = breakdown.phases.filter((ph) => ph.number !== b);
  breakdown.phases.forEach((ph, i) => {
    ph.number = i + 1;
  });
  p.log.success(`Phases ${a} and ${b} merged.`);
}

async function workThroughPhases(breakdown: PhaseBreakdown): Promise<void> {
  const { phases, query } = breakdown;

  // Find first non-done, non-skipped phase
  let currentIdx = phases.findIndex(
    (ph) => ph.status === "pending" || ph.status === "active"
  );
  if (currentIdx === -1) currentIdx = 0;

  while (currentIdx < phases.length) {
    const phase = phases[currentIdx];
    const donePrev = phases
      .slice(0, currentIdx)
      .filter((ph) => ph.status === "done");

    console.log();
    divider();
    const progress = phases
      .map((ph, i) =>
        i < currentIdx
          ? chalk.green("●")
          : i === currentIdx
            ? chalk.cyan("●")
            : chalk.dim("○")
      )
      .join(" ");
    console.log(`  ${progress}`);
    console.log(
      chalk.bold.cyan(
        `  Phase ${phase.number} of ${phases.length}: ${phase.title}`
      )
    );
    console.log(chalk.dim(`  ${phase.goal}`));
    divider();
    console.log();

    // ── Step 4: Phase Planning — only runs ONCE per phase ───────────────────
    phase.status = "active";
    const planMarkdown = await generatePhasePlan(phase, query, donePrev);

    // ── Step 5: Hand off to Agent ────────────────────────────────────────────
    divider();
    step(5, "Hand off to Agent");
    console.log();
    p.log.info("Run this plan with your preferred coding agent:");
    console.log(
      chalk.dim("    • ") +
        chalk.white("Claude Code") +
        chalk.dim("  (claude code)")
    );
    console.log(chalk.dim("    • ") + chalk.white("Cursor"));
    console.log(chalk.dim("    • ") + chalk.white("Cline / Roo"));
    console.log();
    console.log(chalk.dim("  Verify after implementing:"));

    divider();
    console.log();

    // ── Phase action menu — loops WITHOUT re-generating plan ─────────────────
    // Uses an inner loop so export/verify/done-rejected all re-show the menu
    // without going back to the top of the outer while (which regenerates the plan).
    let advance = false; // true  → move to next phase
    let regenerate = false; // true  → re-generate this phase's plan
    let stopped = false; // true  → user chose Stop

    while (true) {
      const action = await clackSelect<string>({
        message: `Phase ${phase.number} — what next?`,
        options: [
          {
            label: "✅  Mark done     — validate and move to next phase",
            value: "done",
          },
          {
            label: "🔍  Verify        — compare implementation vs plan",
            value: "verify",
          },
          { label: "🔄  Regenerate    — re-plan this phase", value: "regen" },
          { label: "⏭   Skip          — skip this phase", value: "skip" },
          {
            label: "💾  Export        — save this phase plan to file",
            value: "export",
          },
          { label: "⏹   Stop          — exit phase mode", value: "stop" },
        ],
      });

      if (action === "done") {
        // ── Step 6: Validation checklist ──────────────────────────────────────
        if (phase.validationCriteria.length > 0) {
          console.log();
          divider();
          step(6, "Verification Checklist");
          divider();
          console.log();
          p.log.info("Confirm these before marking done:");
          phase.validationCriteria.forEach((c) =>
            console.log(chalk.dim("    ○ ") + chalk.white(c))
          );
          console.log();
          const confirmed = await clackConfirm({
            message: "All criteria met?",
            initialValue: false,
          });
          if (!confirmed) {
            p.log.warn(
              "Complete the remaining criteria first — returning to menu."
            );
            continue; // back to inner menu, no re-generation
          }
        }

        phase.status = "done";
        phase.plan = planMarkdown;
        p.log.success(`Phase ${phase.number} complete!`);
        advance = true;
        break;
      } else if (action === "regen") {
        p.log.info(`Re-generating plan for Phase ${phase.number}…`);
        phase.status = "pending";
        regenerate = true;
        break; // break inner, outer while will re-generate
      } else if (action === "skip") {
        phase.status = "skipped";
        p.log.warn(`Phase ${phase.number} skipped.`);
        advance = true;
        break;
      } else if (action === "export") {
        // Export and stay on the menu — no re-generation, no advance
        const filename = await clackText({
          message: "Filename:",
          placeholder: `phase-${phase.number}-${breakdown.id}.md`,
        });
        const out =
          filename.trim() || `phase-${phase.number}-${breakdown.id}.md`;
        writeFileSync(
          out,
          `# Phase ${phase.number}: ${phase.title}\n\n${planMarkdown}\n`,
          "utf8"
        );
        p.log.success(`Saved to ${out}`);
        // continue inner loop — menu re-appears, plan is NOT re-generated
        continue;
      } else if (action === "stop") {
        p.log.info("Phase mode paused. Resume with: traycer phase");
        stopped = true;
        break;
      }
    }

    if (stopped) break;
    if (regenerate) continue; // outer while — re-runs plan generation for same phase

    // Advance to next phase
    if (advance) {
      currentIdx++;

      // ── Step 7: Next Phase ─────────────────────────────────────────────────
      if (currentIdx < phases.length) {
        console.log();
        divider();
        step(7, "Next Phase");
        divider();
        console.log();
        const next = phases[currentIdx];
        p.log.info(
          `Advancing to Phase ${next.number}: ${chalk.white(next.title)}`
        );
        p.log.info(`Goal: ${chalk.white(next.goal)}`);
        p.log.info(`Carrying forward context from Phase ${phase.number}`);
        console.log();
      }
    }
  }

  // All phases complete?
  const done = phases.filter((ph) => ph.status === "done").length;
  const skipped = phases.filter((ph) => ph.status === "skipped").length;
  const allDone = done + skipped === phases.length;

  if (allDone) {
    console.log();
    divider();
    p.log.step(chalk.bold.green("All Phases Complete!"));
    divider();
    console.log();
    p.log.success(
      `${done} phase${done !== 1 ? "s" : ""} done${skipped > 0 ? `, ${skipped} skipped` : ""} — ready to ship!`
    );
    console.log();
    console.log(chalk.dim("  Next steps:"));
    console.log(chalk.dim("    1. ") + chalk.white("git add ."));
    console.log(
      chalk.dim("    2. ") + chalk.white('git commit -m "feat: <your feature>"')
    );
    console.log(chalk.dim("    3. ") + chalk.white("git push && open PR"));
    console.log();
    divider();
  }
}

async function generatePhasePlan(
  phase: Phase,
  query: PhaseQuery,
  previousPhases: Phase[]
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    p.log.error("Missing API key. Run: mewoo config");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const spin = p.spinner();
  spin.start(`Generating Phase ${phase.number} plan…`);

  let markdown = "";
  try {
    const { textStream } = streamText({
      model: openai(model),
      system: buildPhasePlanSystemPrompt(),
      prompt: buildPhasePlanUserPrompt(phase, query, previousPhases),
      maxOutputTokens: 4096,
    });

    spin.stop(`Phase ${phase.number} plan:`);
    console.log();
    divider();
    step(4, `Phase Planning — Phase ${phase.number}: ${phase.title}`);
    divider();
    console.log();

    for await (const chunk of textStream) {
      markdown += chunk;
      process.stdout.write(renderMarkdown(chunk));
    }
    console.log();
    divider();
  } catch (err) {
    spin.stop("");
    p.log.error((err as Error).message);
    process.exit(1);
  }

  return markdown;
}

function buildPhasesMarkdown(breakdown: PhaseBreakdown): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: (string | null)[] = [
    "# Phase Breakdown",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Generated | ${date} |`,
    `| Goal | ${breakdown.query.goal} |`,
    breakdown.query.stack ? `| Stack | ${breakdown.query.stack} |` : null,
    `| Phases | ${breakdown.phases.length} |`,
    "",
    "---",
    "",
  ];

  const sections = breakdown.phases.map((ph) => {
    const block: string[] = [
      `## Phase ${ph.number}: ${ph.title}`,
      "",
      `**Complexity:** ${ph.estimatedComplexity}  `,
      `**Status:** ${ph.status}  `,
      `**Goal:** ${ph.goal}`,
      "",
      "### Steps",
      ...ph.steps.map((s) => `- ${s}`),
      "",
      "### Validation Criteria",
      ...ph.validationCriteria.map((v) => `- [ ] ${v}`),
      "",
    ];
    if (ph.plan) block.push("### Detailed Plan", "", ph.plan, "");
    return block.join("\n");
  });

  return (
    lines.filter((l): l is string => l !== null).join("\n") +
    sections.join("\n---\n\n")
  );
}
