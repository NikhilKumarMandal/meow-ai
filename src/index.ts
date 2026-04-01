#!/usr/bin/env node

import * as p from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { clackSelect, showBanner } from "./ui";
import { AppMode } from "./types";
import { config } from "dotenv";
import { runPlanMode } from "./modes/plan";
import { runPhaseMode } from "./modes/phase";

config();

const program = new Command();

program
  .name("mewoo")
  .description("AI-powered dev workflow: Plan · Review · Phases")
  .version("1.0.0")
  .action(async () => {
    await runInteractiveMenu();
  });

program
  .command("plan")
  .description("Plan mode — generate a file-level implementation plan")
  .action(async () => {
    showBanner();
    await runPlanMode();
  });

program.parse();

async function runInteractiveMenu(): Promise<void> {
  showBanner();
  p.intro(chalk.cyan("What would you like to do?"));
  console.log();

  type MenuChoice = AppMode | "history" | "config";

  const mode = await clackSelect<MenuChoice>({
    message: "Select a mode:",
    options: [
      {
        label: chalk.bold("1.  Plan Mode"),
        hint: "Direct step-by-step plan for a single PR",
        value: "plan",
      },
      {
        label: chalk.bold("2.  Review Mode"),
        hint: "Agentic code review — Bug · Security · Performance · Clarity",
        value: "review",
      },
      {
        label: chalk.bold("3.  Phase Mode"),
        hint: "Break a complex goal into iterative, validated phases",
        value: "phase",
      },
    ],
  });

  console.log();

  if (mode === "plan") await runPlanMode();
  else if (mode === "phase") await runPhaseMode();

  p.outro(chalk.dim("Done · run Mewoo again to continue"));
}
