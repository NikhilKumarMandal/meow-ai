import { createOpenAI } from "@ai-sdk/openai";
import { collectContext } from "../context";
import { PlanDepth, PlanQuery, ProjectType } from "../types";
import {
  clackConfirm,
  clackSelect,
  clackText,
  divider,
  renderMarkdown,
  step,
} from "../ui";
import * as p from "@clack/prompts";
import { streamText } from "ai";
import { buildPlanSystemPrompt, buildPlanUserPrompt } from "../prompts";
import { writeFileSync } from "fs";

export async function runPlanMode(): Promise<void> {
  step(1, "User Query");
  p.log.info("State your goal, expected outcome, and constraints.");
  console.log();

  const goal = await clackText({
    message: "What are you building?",
    validate: (v) =>
      (v?.trim().length ?? 0) > 5
        ? undefined
        : "Please describe your goal (min 5 chars)",
  });

  const expectedOutcome = await clackText({
    message: "Expected outcome — what does success look like?",
    validate: (v) =>
      (v?.trim().length ?? 0) > 3 ? undefined : "Describe the expected outcome",
  });

  const constraints = await clackText({
    message: 'Constraints (optional — e.g. "serverless, no DB"):',
    placeholder: "Leave blank if none",
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

  const depth = await clackSelect<PlanDepth>({
    message: "Plan detail level:",
    options: [
      { label: "Overview  — high-level structure", value: "overview" },
      {
        label: "Standard  — files + key symbols",
        value: "standard",
        hint: "recommended",
      },
    ],
    initialValue: "standard",
  });

  const addContext = await clackConfirm({
    message: "Attach context? (files, folders, git diffs)",
    initialValue: false,
  });

  const context = addContext ? await collectContext() : [];

  const query: PlanQuery = {
    goal,
    expectedOutcome,
    constraints,
    stack,
    type,
    depth,
    context,
  };

  await generateAndShowPlan(query);
}

async function generateAndShowPlan(
  query: PlanQuery,
  existingPlanId?: number
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    p.log.error("Missing API key. Run: mewoo config");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const spin = p.spinner();
  spin.start("Generating file-level plan…");

  let markdown = "";

  try {
    const { textStream } = streamText({
      model: openai(model),
      system: buildPlanSystemPrompt(query.depth),
      prompt: buildPlanUserPrompt(query),
      maxOutputTokens: 4096,
    });

    spin.stop("Plan generated:");
    console.log();
    divider();
    step(2, "File-Level Plan with Symbol References");
    divider();
    console.log();

    for await (const chunk of textStream) {
      markdown += chunk;
      process.stdout.write(renderMarkdown(chunk));
    }

    console.log();
    divider();
    console.log();
  } catch (err) {
    spin.stop("");
    p.log.error(`AI error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!markdown.trim()) {
    p.log.error("Empty response from model. Try again.");
    process.exit(1);
  }

  await planActionMenu(existingPlanId ?? Date.now(), markdown, query);
}

async function planActionMenu(
  planId: number,
  markdown: string,
  query: PlanQuery
): Promise<void> {
  divider();
  step(3, "Execute in Agent");
  console.log();
  p.log.info("Copy this plan into your preferred coding agent:");

  const action = await clackSelect<string>({
    message: "What next?",
    options: [
      { label: "✏️  Iterate   — refine this plan", value: "refine" },
      { label: "💾  Export    — save to markdown file", value: "export" },
      { label: "    Done", value: "done" },
    ],
  });

  if (action === "refine") {
    const refinement = await clackText({
      message: "What would you like to change or add?",
      validate: (v) =>
        (v?.trim().length ?? 0) > 3 ? undefined : "Describe the change",
    });
    const refined = await refineExistingPlan(markdown, refinement);
    if (refined.trim()) {
      await planActionMenu(planId, refined, {
        ...query,
        goal: `[refined] ${query.goal}`,
      });
    }
  } else if (action === "export") {
    const filename = await clackText({
      message: "Filename:",
      placeholder: `plan-${planId}.md`,
    });
    const out = filename?.trim() || `plan-${planId}.md`;
    writeFileSync(
      out,
      `# Implementation Plan\n\n**Generated:** ${new Date().toISOString().split("T")[0]}\n**Goal:** ${query.goal}\n\n---\n\n${markdown}\n`,
      "utf8"
    );
    p.log.success(`Saved to ${out}`);
  }
}

async function refineExistingPlan(
  original: string,
  refinement: string
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    p.log.error("Missing API key. Run: mewoo config");
    process.exit(1);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const spin = p.spinner();
  spin.start("Refining plan…");

  try {
    const { textStream } = streamText({
      model: openai(model),
      system: `You are an expert software architect. The user has an existing implementation plan and wants to refine it.
            Apply the requested changes and return the FULL updated plan using the same exact markdown section structure.`,
      prompt: `EXISTING PLAN:\n${original}\n\nREFINEMENT REQUEST:\n${refinement}`,
      maxOutputTokens: 4096,
    });

    spin.stop("Refined plan:");
    console.log();
    divider();
    step(2, "Refined Plan");
    divider();
    console.log();

    let fullText = "";
    for await (const chunk of textStream) {
      fullText += chunk;
      process.stdout.write(renderMarkdown(chunk));
    }
    console.log();
    divider();
    return fullText;
  } catch (err) {
    spin.stop("Failed");
    p.log.error((err as Error).message);
    return "";
  }
}
