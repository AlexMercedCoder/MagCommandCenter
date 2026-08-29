import {
  Bell,
  BookOpen,
  Brain,
  Bug,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderOpen,
  Files,
  Gauge,
  GitFork,
  Library,
  ListTodo,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Plug,
  Search,
  Settings2,
  Sun,
  TerminalSquare,
  UserRoundCog,
  Wand2,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatSession, ExecutionTask, Theme, View } from "../lib/types";

export const primaryDestinations: Array<{
  id: View;
  label: string;
  icon: typeof Gauge;
}> = [
  { id: "dashboard", label: "Home", icon: Gauge },
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "workspace", label: "Workspace", icon: Files },
  { id: "graphs", label: "Graphs", icon: GitFork },
  { id: "runs", label: "Runs", icon: ListTodo },
  { id: "library", label: "Library", icon: Library },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "config", label: "Settings", icon: Settings2 },
];

const libraryDestinations: Array<{
  id: View;
  label: string;
  description: string;
  icon: typeof Gauge;
}> = [
  {
    id: "agents",
    label: "Agents",
    description: "Profiles, authority, and crews",
    icon: UserRoundCog,
  },
  {
    id: "workbench",
    label: "Workbench",
    description: "Recipes and graph tools",
    icon: Workflow,
  },
  {
    id: "research",
    label: "Research",
    description: "Evidence-backed exploration",
    icon: Search,
  },
  {
    id: "memory",
    label: "Memory",
    description: "MagGraph knowledge and review",
    icon: Brain,
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
    description: "Trusted extensions and imports",
    icon: Plug,
  },
];

export function AppRail(props: {
  view: View;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (view: View) => void;
  onToggle: () => void;
  onMobileClose: () => void;
}) {
  return (
    <aside
      className={`app-rail ${props.collapsed ? "collapsed" : ""} ${props.mobileOpen ? "mobile-open" : ""}`}
    >
      <div className="rail-brand">
        <div className="brand-symbol">M</div>
        {!props.collapsed && (
          <div>
            <strong>Mag</strong>
            <span>Command Center</span>
          </div>
        )}
        <button
          className="rail-mobile-close"
          onClick={props.onMobileClose}
          aria-label="Close navigation"
          type="button"
        >
          <X />
        </button>
      </div>
      <nav aria-label="Primary navigation" className="rail-nav">
        {primaryDestinations.map((item) => {
          const Icon = item.icon;
          const active =
            props.view === item.id ||
            (item.id === "library" &&
              libraryDestinations.some((child) => child.id === props.view));
          return (
            <button
              className={active ? "rail-link active" : "rail-link"}
              onClick={() => props.onNavigate(item.id)}
              title={item.label}
              aria-current={active ? "page" : undefined}
              type="button"
              key={item.id}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button className="rail-collapse" onClick={props.onToggle} type="button">
        {props.collapsed ? <ChevronRight /> : <ChevronLeft />}
        <span>{props.collapsed ? "Expand" : "Collapse"}</span>
      </button>
    </aside>
  );
}

export function ContextSidebar(props: {
  view: View;
  project: string;
  pinned: boolean;
  sessions: ChatSession[];
  activeSession: string;
  tasks: ExecutionTask[];
  onNavigate: (view: View) => void;
  onProject: () => void;
  onPin: () => void;
  onSession: (id: string) => void;
}) {
  const projectName =
    props.project.split(/[\\/]/).filter(Boolean).pop() || "Project";
  const attention = props.tasks.filter((task) =>
    ["waiting", "awaiting_human", "blocked", "failed"].includes(task.state),
  );
  const active = props.tasks.filter((task) =>
    ["queued", "planning", "ready", "running", "validating"].includes(
      task.state,
    ),
  );
  const section =
    props.view === "chat"
      ? "Sessions"
      : props.view === "graphs"
        ? "Graph workspace"
        : props.view === "runs"
          ? "Execution"
          : props.view === "library" ||
              libraryDestinations.some((item) => item.id === props.view)
            ? "Library"
            : "Project";
  return (
    <aside className="context-sidebar" aria-label="Workspace context">
      <div className="context-project">
        <p className="eyebrow">Active project</p>
        <h2>{projectName}</h2>
        <p title={props.project}>{props.project}</p>
        <div className="quiet-actions">
          <button onClick={props.onProject} type="button">
            <FolderOpen />
            Open
          </button>
          <button onClick={props.onPin} type="button">
            {props.pinned ? "★ Pinned" : "☆ Pin"}
          </button>
        </div>
      </div>
      <div className="context-section-heading">
        <span>{section}</span>
      </div>
      {props.view === "chat" && (
        <div className="context-list">
          {props.sessions.slice(0, 12).map((session) => (
            <button
              className={
                session.id === props.activeSession
                  ? "context-item active"
                  : "context-item"
              }
              onClick={() => props.onSession(session.id)}
              type="button"
              key={session.id}
            >
              <MessageSquareText />
              <span>
                <strong>{session.name}</strong>
                <small>{session.agentProfile || "Project agent"}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {(props.view === "runs" || props.view === "dashboard") && (
        <div className="context-list">
          <button
            className="context-item"
            onClick={() => props.onNavigate("runs")}
            type="button"
          >
            <ListTodo />
            <span>
              <strong>{active.length} active</strong>
              <small>Running and queued work</small>
            </span>
          </button>
          <button
            className={
              attention.length ? "context-item attention" : "context-item"
            }
            onClick={() => props.onNavigate("runs")}
            type="button"
          >
            <Bell />
            <span>
              <strong>{attention.length} need attention</strong>
              <small>Approvals, blocks, failures</small>
            </span>
          </button>
        </div>
      )}
      {props.view === "graphs" && (
        <div className="context-list">
          <div className="context-note">
            <GitFork />
            <span>
              <strong>Board · Map · Source</strong>
              <small>Author, validate, and run portable workflows.</small>
            </span>
          </div>
          <button
            className="context-item"
            onClick={() => props.onNavigate("runs")}
            type="button"
          >
            <ListTodo />
            <span>
              <strong>Graph runs</strong>
              <small>{active.length} active across this project</small>
            </span>
          </button>
        </div>
      )}
      {(props.view === "library" ||
        libraryDestinations.some((item) => item.id === props.view)) && (
        <div className="context-list">
          {libraryDestinations.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={
                  props.view === item.id
                    ? "context-item active"
                    : "context-item"
                }
                onClick={() => props.onNavigate(item.id)}
                type="button"
                key={item.id}
              >
                <Icon />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!["chat", "graphs", "runs", "dashboard", "library"].includes(
        props.view,
      ) &&
        !libraryDestinations.some((item) => item.id === props.view) && (
          <div className="context-list">
            <button
              className="context-item"
              onClick={() => props.onNavigate("dashboard")}
              type="button"
            >
              <Gauge />
              <span>
                <strong>Project overview</strong>
                <small>Health and readiness</small>
              </span>
            </button>
          </div>
        )}
      <div className="context-footer">
        <button onClick={() => props.onNavigate("setup")} type="button">
          <Wand2 />
          Setup
        </button>
        <button onClick={() => props.onNavigate("docs")} type="button">
          <BookOpen />
          Help
        </button>
      </div>
    </aside>
  );
}

export function WorkspaceHeader(props: {
  title: string;
  project: string;
  status: string;
  theme: Theme;
  onTheme: () => void;
  onMenu: () => void;
  onPalette: () => void;
  onDetect: () => void;
  onReadiness: () => void;
  onDiagnostics: () => void;
  onNotifications: () => void;
}) {
  const [open, setOpen] = useState(false);
  const projectName =
    props.project.split(/[\\/]/).filter(Boolean).pop() || "Project";
  return (
    <header className="workspace-header">
      <button
        className="mobile-menu"
        onClick={props.onMenu}
        aria-label="Open navigation"
        type="button"
      >
        <Menu />
      </button>
      <div className="workspace-title">
        <div className="breadcrumbs">
          <span>{projectName}</span>
          <span>/</span>
          <span>{props.title}</span>
        </div>
        <h1>{props.title}</h1>
      </div>
      <div className="workspace-header-actions">
        <button
          className="command-trigger"
          onClick={props.onPalette}
          type="button"
        >
          <Search />
          <span>Search or run a command</span>
          <kbd>⌘K</kbd>
        </button>
        <span
          className={`health-pill ${props.status.toLowerCase().replace(/ /g, "-")}`}
        >
          {props.status}
        </span>
        <button
          className="header-icon"
          onClick={props.onNotifications}
          title="Task notifications"
          type="button"
        >
          <Bell />
        </button>
        <div className="status-menu-wrap">
          <button
            className="header-icon"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            title="Workspace controls"
            type="button"
          >
            <MoreHorizontal />
          </button>
          {open && (
            <div className="status-menu">
              <button
                onClick={() => {
                  props.onDetect();
                  setOpen(false);
                }}
                type="button"
              >
                <TerminalSquare />
                Detect MagAgent
              </button>
              <button
                onClick={() => {
                  props.onReadiness();
                  setOpen(false);
                }}
                type="button"
              >
                <Gauge />
                Run readiness
              </button>
              <button
                onClick={() => {
                  props.onDiagnostics();
                  setOpen(false);
                }}
                type="button"
              >
                <Bug />
                Save diagnostics
              </button>
              <button
                onClick={() => {
                  props.onTheme();
                  setOpen(false);
                }}
                type="button"
              >
                {props.theme === "light" ? <Moon /> : <Sun />}
                {props.theme === "light" ? "Dark theme" : "Light theme"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function CommandPalette(props: {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onDetect: () => void;
  onReadiness: () => void;
  projects?: string[];
  sessions?: ChatSession[];
  profiles?: string[];
  tasks?: ExecutionTask[];
  onProject?: (path: string) => void;
  onSession?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (props.open) setQuery("");
  }, [props.open]);
  const actions = useMemo(
    () =>
      [
        ...primaryDestinations.map((item) => ({
          label: `Open ${item.label}`,
          icon: item.icon,
          run: () => props.onNavigate(item.id),
        })),
        ...libraryDestinations.map((item) => ({
          label: `Open ${item.label}`,
          icon: item.icon,
          run: () => props.onNavigate(item.id),
        })),
        { label: "Detect MagAgent", icon: TerminalSquare, run: props.onDetect },
        { label: "Run project readiness", icon: Gauge, run: props.onReadiness },
        ...(props.projects || []).map((path) => ({
          label: `Project · ${path}`,
          icon: FolderOpen,
          run: () => {
            props.onProject?.(path);
            props.onNavigate("dashboard");
          },
        })),
        ...(props.sessions || []).map((session) => ({
          label: `Session · ${session.name}${session.summary ? ` · ${session.summary}` : ""}`,
          icon: MessageSquareText,
          run: () => props.onSession?.(session.id),
        })),
        ...(props.profiles || []).map((profile) => ({
          label: `Agent · ${profile}`,
          icon: UserRoundCog,
          run: () => props.onNavigate("agents"),
        })),
        ...(props.tasks || []).slice(0, 100).map((task) => ({
          label: `Run · ${task.title} · ${task.state}`,
          icon: ListTodo,
          run: () => props.onNavigate("runs"),
        })),
      ].filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, props],
  );
  if (!props.open) return null;
  return (
    <div
      className="command-overlay"
      role="presentation"
      onMouseDown={props.onClose}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label>
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") props.onClose();
            }}
            placeholder="Search workspaces and commands…"
          />
        </label>
        <div className="command-results">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                onClick={() => {
                  item.run();
                  props.onClose();
                }}
                type="button"
                key={item.label}
              >
                <Icon />
                <span>{item.label}</span>
                <kbd>↵</kbd>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function LibraryLanding({
  onNavigate,
}: {
  onNavigate: (view: View) => void;
}) {
  return (
    <section className="library-landing">
      <div className="section-intro">
        <p className="eyebrow">Mag ecosystem</p>
        <h2>Tools that extend every agent run</h2>
        <p>
          Profiles, memory, research, data, plugins, and repeatable workflows
          live here without competing with day-to-day sessions.
        </p>
      </div>
      <div className="library-grid">
        {libraryDestinations.map((item) => {
          const Icon = item.icon;
          return (
            <button
              onClick={() => onNavigate(item.id)}
              type="button"
              key={item.id}
            >
              <span className="library-icon">
                <Icon />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <ChevronRight />
            </button>
          );
        })}
      </div>
    </section>
  );
}
