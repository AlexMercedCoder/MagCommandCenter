import {
  Bell,
  Bug,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Gauge,
  ListTodo,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Search,
  Sun,
  TerminalSquare,
  UserRoundCog,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  allDestinations,
  libraryDestinations,
  primaryDestinations,
  projectTools,
  sectionOf,
  systemDestinations,
  type Destination,
} from "../lib/navigation";
import type { ChatSession, ExecutionTask, Theme, View } from "../lib/types";

export { libraryDestinations, primaryDestinations } from "../lib/navigation";

function RailLink(props: {
  item: Destination;
  active: boolean;
  badge?: number;
  shortcut?: string;
  onNavigate: (view: View) => void;
}) {
  const Icon = props.item.icon;
  return (
    <button
      className={props.active ? "rail-link active" : "rail-link"}
      onClick={() => props.onNavigate(props.item.id)}
      title={
        props.shortcut
          ? `${props.item.label} (${props.shortcut.replace("Mod", modLabel)})`
          : props.item.label
      }
      aria-current={props.active ? "page" : undefined}
      type="button"
    >
      <Icon />
      <span>{props.item.label}</span>
      {props.badge ? (
        <b className="rail-badge" aria-label={`${props.badge} need attention`}>
          {props.badge}
        </b>
      ) : null}
    </button>
  );
}

const modLabel =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

export function AppRail(props: {
  view: View;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (view: View) => void;
  onToggle: () => void;
  onMobileClose: () => void;
  /** Runs needing attention, shown as a badge on Runs. */
  attention?: number;
  shortcuts?: Partial<Record<string, string>>;
}) {
  const section = sectionOf(props.view);
  const shortcutFor: Record<string, string | undefined> = {
    chat: props.shortcuts?.chat,
    runs: props.shortcuts?.runs,
    dashboard: props.shortcuts?.projects,
    config: props.shortcuts?.settings,
    docs: props.shortcuts?.help,
  };
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
        {primaryDestinations.map((item) => (
          <RailLink
            key={item.id}
            item={item}
            active={
              (item.id === "chat" && section === "chat") ||
              (item.id === "runs" && section === "runs") ||
              (item.id === "dashboard" && section === "projects")
            }
            badge={item.id === "runs" ? props.attention : undefined}
            shortcut={shortcutFor[item.id]}
            onNavigate={props.onNavigate}
          />
        ))}
      </nav>
      <nav aria-label="App" className="rail-nav rail-system">
        {systemDestinations.map((item) => (
          <RailLink
            key={item.id}
            item={item}
            active={props.view === item.id}
            shortcut={shortcutFor[item.id]}
            onNavigate={props.onNavigate}
          />
        ))}
      </nav>
      <button className="rail-collapse" onClick={props.onToggle} type="button">
        {props.collapsed ? <ChevronRight /> : <ChevronLeft />}
        <span>{props.collapsed ? "Expand" : "Collapse"}</span>
      </button>
    </aside>
  );
}

function ContextLinks(props: {
  items: Destination[];
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="context-list">
      {props.items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className={
              props.view === item.id ? "context-item active" : "context-item"
            }
            aria-current={props.view === item.id ? "page" : undefined}
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
  );
}

const projectOverview: Destination = {
  id: "dashboard",
  label: "Overview",
  description: "Health, readiness, and recent projects",
  icon: Gauge,
};

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
  onNewSession?: () => void;
}) {
  const projectName =
    props.project.split(/[\\/]/).filter(Boolean).pop() || "No project";
  const attention = props.tasks.filter((task) =>
    ["waiting", "awaiting_human", "blocked", "failed"].includes(task.state),
  );
  const active = props.tasks.filter((task) =>
    ["queued", "planning", "ready", "running", "validating"].includes(
      task.state,
    ),
  );
  const section = sectionOf(props.view);
  return (
    <aside className="context-sidebar" aria-label="Section navigation">
      <div className="context-project">
        <p className="eyebrow">Active project</p>
        <h2 title={props.project || undefined}>{projectName}</h2>
        <p title={props.project}>{props.project || "Open a folder to start"}</p>
        <div className="quiet-actions">
          <button onClick={props.onProject} type="button">
            <FolderOpen />
            Open
          </button>
          {props.project && (
            <button onClick={props.onPin} type="button">
              {props.pinned ? "★ Pinned" : "☆ Pin"}
            </button>
          )}
        </div>
      </div>
      <div className="context-scroll">
        {section === "chat" && (
          <>
            <div className="context-section-heading">
              <span>Sessions</span>
              {props.onNewSession && (
                <button
                  className="context-heading-action"
                  onClick={props.onNewSession}
                  type="button"
                  aria-label="New chat session"
                  title="New chat session"
                >
                  <Plus />
                </button>
              )}
            </div>
            <div className="context-list">
              {props.sessions.slice(0, 12).map((session) => (
                <button
                  className={
                    session.id === props.activeSession
                      ? "context-item active"
                      : "context-item"
                  }
                  aria-current={
                    session.id === props.activeSession ? "true" : undefined
                  }
                  onClick={() => props.onSession(session.id)}
                  type="button"
                  key={session.id}
                >
                  <MessageSquareText />
                  <span>
                    <strong>{session.name}</strong>
                    <small>
                      {session.summary ||
                        session.agentProfile ||
                        "Project agent"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="context-section-heading">
              <span>Context</span>
            </div>
            <ContextLinks
              items={projectTools.slice(0, 1)}
              view={props.view}
              onNavigate={props.onNavigate}
            />
          </>
        )}
        {section === "runs" && (
          <>
            <div className="context-section-heading">
              <span>Execution</span>
            </div>
            <div className="context-list">
              <div className="context-note">
                <ListTodo />
                <span>
                  <strong>{active.length} active</strong>
                  <small>Running and queued work</small>
                </span>
              </div>
              <div
                className={
                  attention.length ? "context-note attention" : "context-note"
                }
              >
                <Bell />
                <span>
                  <strong>{attention.length} need attention</strong>
                  <small>Approvals, blocks, failures</small>
                </span>
              </div>
            </div>
            <div className="context-section-heading">
              <span>Related</span>
            </div>
            <ContextLinks
              items={projectTools.slice(1, 2)}
              view={props.view}
              onNavigate={props.onNavigate}
            />
          </>
        )}
        {section === "projects" && (
          <>
            <div className="context-section-heading">
              <span>Project</span>
            </div>
            <ContextLinks
              items={[projectOverview, ...projectTools]}
              view={props.view}
              onNavigate={props.onNavigate}
            />
            <div className="context-section-heading">
              <span>Library</span>
            </div>
            <ContextLinks
              items={libraryDestinations}
              view={props.view}
              onNavigate={props.onNavigate}
            />
          </>
        )}
        {section === "settings" && (
          <>
            <div className="context-section-heading">
              <span>App</span>
            </div>
            <ContextLinks
              items={[
                ...systemDestinations,
                allDestinations.find((item) => item.id === "setup")!,
              ]}
              view={props.view}
              onNavigate={props.onNavigate}
            />
          </>
        )}
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
          title="Notifications"
          aria-label="Notifications"
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
        ...allDestinations
          .filter((item) => item.id !== "library")
          .map((item) => ({
            label: `Open ${item.label}`,
            // Also match the view's title and description ("workspace", "diff", ...).
            keywords: `${item.title ?? ""} ${item.keywords ?? ""} ${item.description}`,
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
        `${item.label} ${"keywords" in item ? item.keywords : ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
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
