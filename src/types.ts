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

export type PhaseStatus = "pending" | "active" | "done" | "skipped";

export interface Phase {
  number: number;
  title: string;
  goal: string;
  steps: string[];
  validationCriteria: string[];
  dependencies: string[]; // phase numbers this depends on
  estimatedComplexity: "low" | "medium" | "high";
  status: PhaseStatus;
  plan?: string; // detailed plan markdown for this phase
}

export interface PhaseQuery {
  goal: string;
  expectedOutcome: string;
  constraints: string;
  stack: string;
  type: ProjectType;
  context: ContextItem[];
}

export interface PhaseBreakdown {
  id: number;
  date: string;
  query: PhaseQuery;
  phases: Phase[];
  rawMarkdown: string;
}
