export type AppMode = "plan" | "review" | "phase";
export type ProjectType =
  | "fullstack"
  | "web"
  | "api"
  | "cli"
  | "mobile"
  | "library";
export type PlanDepth = "overview" | "standard" | "detailed";

export type ContextType = "file" | "folder" | "git-diff";

export interface ContextItem {
  type: ContextType;
  label: string;
  content: string;
}

export interface PlanQuery {
  goal: string;
  expectedOutcome: string;
  constraints: string;
  stack: string;
  type: ProjectType;
  depth: PlanDepth;
  context: ContextItem[];
}
