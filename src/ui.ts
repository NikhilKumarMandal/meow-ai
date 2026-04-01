import * as p from "@clack/prompts";
import chalk from "chalk";
import figlet from "figlet";
import gradient from "gradient-string";

export function showBanner() {
  const art = figlet.textSync("Mewoo", { font: "Slant" });
  console.log("\n" + gradient.pastel.multiline(art));
  console.log(
    chalk.dim("  Spec-driven development · Plan · Review · Phases  ") +
      chalk.cyan("v1.0.0")
  );
}

export function step(n: number | 0, title: string): void {
  if (n === 0) {
    p.log.step(chalk.bold(title));
  } else {
    p.log.step(chalk.bold(`Step ${n} · ${title}`));
  }
}

export function divider(): void {
  console.log(chalk.dim("─".repeat(60)));
}

export function renderMarkdown(text: string): string {
  return text
    .replace(/^(#{1,3} .+)$/gm, (m) => chalk.cyan.bold(m))
    .replace(/^(#{4,6} .+)$/gm, (m) => chalk.cyan(m))
    .replace(/\*\*(.+?)\*\*/g, (_, t: string) => chalk.bold(t))
    .replace(/`([^`\n]+)`/g, (_, t: string) => chalk.yellow(t))
    .replace(/^(- |\* )/gm, () => chalk.cyan("  • "))
    .replace(/^(\d+\. )/gm, (m) => chalk.cyan(m))
    .replace(/^(- \[[ x]\])/gm, (m) => chalk.cyan(m))
    .replace(/^(>.*)/gm, (m) => chalk.dim(m));
}

export function handleCancel(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }
}

export async function clackSelect<T extends string>(
  opts: Parameters<typeof p.select<T>>[0]
): Promise<T> {
  const val = await p.select<T>(opts);
  handleCancel(val);
  return val as T;
}

export async function clackText(
  opts: Parameters<typeof p.text>[0]
): Promise<string> {
  const val = await p.text(opts);
  handleCancel(val);
  return val as string;
}

export async function clackConfirm(
  opts: Parameters<typeof p.confirm>[0]
): Promise<boolean> {
  const val = await p.confirm(opts);
  handleCancel(val);
  return val as boolean;
}
