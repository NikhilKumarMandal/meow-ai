import * as p from "@clack/prompts";
import chalk from "chalk";
import { clackSelect, clackText } from "./ui";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { ContextItem } from "./types";

export async function collectContext(): Promise<ContextItem[]> {
  const items: ContextItem[] = [];

  p.log.info("Attach context (optional — files, folders, git diffs)");

  while (true) {
    const action = await clackSelect<string>({
      message: "Add context:",
      options: [
        { label: "File      — attach a source file", value: "file" },
        { label: "Folder    — list files in a directory", value: "folder" },
        { label: "Git diff  — uncommitted changes", value: "git-uncommitted" },
        { label: "Git diff  — vs main branch", value: "git-main" },
        { label: "Git diff  — vs a specific branch", value: "git-branch" },
        { label: "Git diff  — vs a specific commit", value: "git-commit" },
        { label: chalk.dim("Done — no more context"), value: "done" },
      ],
    });

    if (action === "done") break;

    const item = await collectOne(action);
    if (item) {
      items.push(item);
      p.log.success(`Added: ${item.label}`);
    }
  }

  return items;
}

async function collectOne(action: string): Promise<ContextItem | null> {
  if (action === "file") {
    const path = await clackText({ message: "File path:" });
    if (!existsSync(path)) {
      p.log.error(`File not found: ${path}`);
      return null;
    }
    return { type: "file", label: path, content: readFileSync(path, "utf8") };
  }

  if (action === "folder") {
    const dir = await clackText({ message: "Folder path:" });
    if (!existsSync(dir)) {
      p.log.error(`Folder not found: ${dir}`);
      return null;
    }
    try {
      const tree = execSync(`find "${dir}" -type f | head -80`, {
        encoding: "utf8",
      });
      return { type: "folder", label: dir, content: tree };
    } catch {
      return { type: "folder", label: dir, content: "(could not list)" };
    }
  }

  if (action === "git-uncommitted")
    return gitDiff("git diff", "uncommitted changes");
  if (action === "git-main") return gitDiff("git diff main", "vs main");

  if (action === "git-branch") {
    const branch = await clackText({ message: "Branch name:" });
    return gitDiff(`git diff ${branch}`, `vs ${branch}`);
  }

  if (action === "git-commit") {
    const commit = await clackText({ message: "Commit hash or ref:" });
    return gitDiff(`git diff ${commit}`, `vs ${commit}`);
  }

  return null;
}

function gitDiff(cmd: string, label: string): ContextItem | null {
  try {
    const content = execSync(cmd, { encoding: "utf8" });
    return {
      type: "git-diff",
      label: `git diff ${label}`,
      content: content || "(no changes)",
    };
  } catch {
    p.log.error(`Git error running: ${cmd}`);
    return null;
  }
}
