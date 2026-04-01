import { Phase, PhaseBreakdown, PhaseQuery } from "../types";
import { clackSelect, clackText, divider, step } from "../ui";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { phaseOverviewMenu } from "../modes/phase";

export const COMPLEXITY_BADGE: Record<string, string> = {
  low: chalk.bgGreen.black(" LOW "),
  medium: chalk.bgYellow.black(" MEDIUM "),
  high: chalk.bgRed.white(" HIGH "),
};

export function renderPhaseOverview(phases: Phase[], query: PhaseQuery): void {
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

export async function editPhasesMenu(breakdown: PhaseBreakdown): Promise<void> {
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

export async function addPhase(breakdown: PhaseBreakdown): Promise<void> {
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

export async function removePhase(breakdown: PhaseBreakdown): Promise<void> {
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

export async function reorderPhases(breakdown: PhaseBreakdown): Promise<void> {
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

export async function mergePhases(breakdown: PhaseBreakdown): Promise<void> {
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
