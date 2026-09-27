/**
 * Navigation model (C-12). Chat, Runs, and Projects are the primary destinations; every
 * other view is reached from the context sidebar of the section it belongs to, the
 * command palette, or a keyboard shortcut.
 */
import {
  BookOpen,
  Brain,
  Database,
  Files,
  FolderKanban,
  GitFork,
  ListTodo,
  MessageSquareText,
  Plug,
  Search,
  Settings2,
  UserRoundCog,
  Wand2,
  Workflow,
  Wrench,
} from "lucide-react";
import type { View } from "./types";

export type Destination = {
  id: View;
  label: string;
  /** Header title when it differs from the label. */
  title?: string;
  description: string;
  icon: typeof Files;
};

export type Section = "chat" | "runs" | "projects" | "settings";

export const primaryDestinations: Destination[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Talk to your agent in a project",
    icon: MessageSquareText,
  },
  {
    id: "runs",
    label: "Runs",
    description: "Tasks, graph runs, and schedules",
    icon: ListTodo,
  },
  {
    id: "dashboard",
    label: "Projects",
    description: "Open a project and its tools",
    icon: FolderKanban,
  },
];

export const systemDestinations: Destination[] = [
  {
    id: "config",
    label: "Settings",
    description: "Providers, appearance, notifications",
    icon: Settings2,
  },
  {
    id: "docs",
    label: "Help",
    description: "How each part of the app works",
    icon: BookOpen,
  },
];

/** Tools that act on the active project, shown in the Projects context. */
export const projectTools: Destination[] = [
  {
    id: "workspace",
    label: "Files and Git",
    title: "Workspace",
    description: "Browse, diff, and run commands",
    icon: Files,
  },
  {
    id: "graphs",
    label: "Graph Board",
    description: "Author and run agentic graphs",
    icon: GitFork,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Profiles, authority, and crews",
    icon: UserRoundCog,
  },
];

/** The MagAgent library: shared across projects. */
export const libraryDestinations: Destination[] = [
  {
    id: "memory",
    label: "Memory",
    description: "MagGraph knowledge and review",
    icon: Brain,
  },
  {
    id: "research",
    label: "Research",
    description: "Evidence-backed exploration",
    icon: Search,
  },
  {
    id: "workbench",
    label: "Workbench",
    description: "Recipes and checkpoints",
    icon: Workflow,
  },
  {
    id: "sqlite",
    label: "SQLite",
    description: "Inspect local durable data",
    icon: Database,
  },
  {
    id: "plugins",
    label: "Plugins",
    description: "Skills, plugins, and imports",
    icon: Plug,
  },
  {
    id: "tools",
    label: "Tools and extensions",
    description: "Readiness, MCP, and WebMCP",
    icon: Wrench,
  },
];

const setupDestination: Destination = {
  id: "setup",
  label: "Setup",
  description: "Install MagAgent and connect a model",
  icon: Wand2,
};

export const allDestinations: Destination[] = [
  ...primaryDestinations,
  ...projectTools,
  ...libraryDestinations,
  ...systemDestinations,
  setupDestination,
  {
    id: "library",
    label: "Library",
    description: "Memory, research, data, and plugins",
    icon: Brain,
  },
];

/** Which primary section a view belongs to (drives rail highlight and sidebar). */
export function sectionOf(view: View): Section {
  if (view === "chat") return "chat";
  if (view === "runs") return "runs";
  if (view === "config" || view === "docs" || view === "setup")
    return "settings";
  return "projects";
}

export function viewTitle(view: View): string {
  const destination = allDestinations.find((item) => item.id === view);
  return destination?.title ?? destination?.label ?? "Projects";
}
