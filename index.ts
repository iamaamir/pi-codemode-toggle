import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const TOOL_NAME = "codemode";
const STATUS_KEY = "codemode-toggle";

type Action = "toggle" | "on" | "off" | "status";

export type Scope = "project" | "global";

type EditMode = "enable" | "disable";

/** Whether one settings file's content turns the codemode default on. Malformed content counts as "no". */
export function isCodemodePersisted(file: string | undefined): boolean {
  const tools = safeParse(file)?.defaultTools;
  if (!Array.isArray(tools)) return false;
  return (tools as string[]).includes("codemode") || (tools as string[]).includes("+codemode");
}

function safeParse(file: string | undefined): Record<string, unknown> | undefined {
  if (file === undefined || file.trim() === "") return undefined;
  try {
    const parsed = JSON.parse(file);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/** Which settings layers currently persist codemode, project first — mirrors how Pi applies them. */
export function persistedScopes(project: string | undefined, global: string | undefined): Scope[] {
  const scopes: Scope[] = [];

  if (isCodemodePersisted(project)) scopes.push("project");
  if (isCodemodePersisted(global)) scopes.push("global");

  return scopes;
}

/**
 * Human-readable description of what codemode persistence means for
 * future sessions, used by /codemode status output.
 *
 * - Empty array            → new sessions won't have codemode on
 * - One scope            → new sessions in that scope start with codemode on
 * - Multiple scopes      → new sessions start with codemode on in both
 *
 * Always mentions the command to opt in (the flag, not just "persist").
 */
export function describePersisted(scopes: Scope[]): string {
  if (scopes.length === 0) {
    return "codemode is off; use /codemode on -l or /codemode on -g to enable";
  }
  if (scopes.length === 1 && scopes[0] === "project") {
    return `codemode is on; use /codemode off -l to clear`;
  }
  if (scopes.length === 1 && scopes[0] === "global") {
    return `codemode is on globally; use /codemode off -g to clear`;
  }
  // both project and global
  const flagL = "-l";
  const flagG = "-g";
  return `codemode is on; use /codemode off ${flagL} or /codemode off ${flagG} to clear`;
}

interface LockRelease {
  (): void;
}

/**
 * Read/write access to the two settings layers, using the same files and the
 * same lock convention Pi's own SettingsManager uses, so concurrent writes
 * from Pi processes and this extension stay serialized.
 */
export class ScopedSettingsStore {
  private readonly paths: Record<Scope, string>;

  constructor(cwd: string, agentDir: string) {
    this.paths = {
      project: join(cwd, CONFIG_DIR_NAME, "settings.json"),
      global: join(agentDir, "settings.json"),
    };
  }

  read(scope: Scope): string | undefined {
    const path = this.paths[scope];
    return existsSync(path) ? readFileSync(path, "utf-8") : undefined;
  }

  persistedScopes(): Scope[] {
    return persistedScopes(this.read("project"), this.read("global"));
  }

  persist(scope: Scope, mode: EditMode): void {
    const path = this.paths[scope];
    const existed = existsSync(path);
    let release: LockRelease | undefined;

    try {
      // A first-ever write must create the layer's directory before the lock,
      // which targets `<settings path>.lock` next to the file.
      if (!existed && mode === "enable") {
        mkdirSync(dirname(path), { recursive: true });
      }

      if (existed) release = lockfile.lockSync(path, { realpath: false });

      const next = editCodemodeDefault(existed ? this.read(scope) : undefined, mode);

      if (next === undefined) return;

      // The layer became empty: the file must go, so `status` never reports a
      // key that is no longer there.
      if (next === null) {
        if (existed) unlinkSync(path);
        return;
      }

      if (release === undefined) release = lockfile.lockSync(path, { realpath: false });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, next, "utf-8");
    } finally {
      release?.();
    }
  }
}

/**
 * Apply the persisted-codemode change to one settings file's content.
 *
 * Pi reads `defaultTools` with `+name`/`-name` modifiers on top of its builtin
 * default tool set, so "on" means appending `+codemode` and "off" means
 * removing it (dropping the key entirely once it holds nothing else).
 *
 * Returns the next file content; `null` when the layer becomes empty and the
 * file should stop existing; `undefined` when nothing needs changing at all.
 * Throws on malformed files — never silently rewrites a file it can't parse.
 */
export function editCodemodeDefault(
  current: string | undefined,
  mode: EditMode,
): string | null | undefined {
  const settings =
    current === undefined || current.trim() === ""
      ? undefined
      : (JSON.parse(current) as { defaultTools?: unknown });
  const next = { ...settings };

  const tools = Array.isArray(settings?.defaultTools)
    ? [...(settings.defaultTools as string[])]
    : undefined;

  if (settings?.defaultTools !== undefined && tools === undefined) {
    throw new Error("defaultTools in this settings file is not a list");
  }

  if (mode === "enable") {
    if (tools?.includes("+codemode") ?? false) return undefined;
    next.defaultTools = [...(tools ?? []), "+codemode"];
    return JSON.stringify(next, null, 2);
  }

  if (!tools?.includes("+codemode")) return undefined;
  const remaining = tools.filter((tool) => tool !== "+codemode");
  if (remaining.length > 0) next.defaultTools = remaining;
  else delete next.defaultTools;

  if (JSON.stringify(next) === JSON.stringify({})) return null;
  return JSON.stringify(next, null, 2);
}

export type ParsedCommand =
  | { ok: true; action: Action; scopes: Scope[] }
  | { ok: false; error: string };

export function parseCommand(args: string): ParsedCommand {
  const words = args
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const unknown = words.find(
    (word) => !word.startsWith("-") && !["toggle", "on", "off", "status"].includes(word),
  );
  if (unknown) return { ok: false, error: `Unknown argument: ${unknown}` };

  const scopes: Scope[] = [];
  for (const word of words) {
    if (!word.startsWith("-")) continue;
    if (word === "-l") scopes.push("project");
    else if (word === "-g") scopes.push("global");
    else return { ok: false, error: `Unknown flag: ${word}` };
  }

  const actionWord = words.find((word) => !word.startsWith("-")) ?? "";
  const action: Action = actionWord === "" ? "toggle" : (actionWord as Action);

  return {
    ok: true,
    action,
    scopes: [...new Set(action === "status" ? [] : scopes)],
  };
}

/** Structurally compatible with Pi's AutocompleteItem, without importing pi-tui. */
interface CompletionItem {
  value: string;
  label: string;
  description?: string;
}

/**
 * The completion menu is where users discover that persisting exists.
 *
 * Pi hands us the whole argument text after `/codemode ` and replaces that
 * region wholesale when a suggestion is picked, so items are complete
 * command forms (`on -l`) rather than bare flags — the user sees exactly
 * what they are about to run.
 */
export function completionItems(prefix: string): CompletionItem[] {
  const catalog: CompletionItem[] = [
    { value: "on", label: "on", description: "enable codemode for this session" },
    {
      value: "on -l",
      label: "on -l",
      description: "enable now + persist for this project (.pi/settings.json)",
    },
    {
      value: "on -g",
      label: "on -g",
      description: "enable now + persist globally (agent settings.json)",
    },
    { value: "off", label: "off", description: "disable codemode for this session" },
    {
      value: "off -l",
      label: "off -l",
      description: "disable now + clear the project's saved default",
    },
    {
      value: "off -g",
      label: "off -g",
      description: "disable now + clear the global saved default",
    },
    { value: "toggle", label: "toggle", description: "flip codemode for this session" },
    {
      value: "status",
      label: "status",
      description: "show codemode state and where it is persisted",
    },
  ];

  const needle = prefix.toLowerCase().replace(/\s+/g, " ").trimEnd();
  return catalog.filter((item) => item.value.startsWith(needle));
}

export default function codemodeToggle(pi: ExtensionAPI): void {
  function isAvailable(): boolean {
    return pi.getAllTools().some((tool) => tool.name === TOOL_NAME);
  }

  function isEnabled(): boolean {
    return pi.getActiveTools().includes(TOOL_NAME);
  }

  function setEnabled(enabled: boolean): void {
    const activeTools = pi.getActiveTools();

    if (enabled) {
      if (activeTools.includes(TOOL_NAME)) {
        return;
      }

      pi.setActiveTools([...activeTools, TOOL_NAME]);
      return;
    }

    if (!activeTools.includes(TOOL_NAME)) {
      return;
    }

    pi.setActiveTools(activeTools.filter((tool) => tool !== TOOL_NAME));
  }

  function updateStatus(ctx: ExtensionContext): void {
    const enabled = isEnabled();

    ctx.ui.setStatus(
      STATUS_KEY,
      ctx.ui.theme.fg(enabled ? "success" : "muted", enabled ? "codemode:on" : "codemode:off"),
    );

    // ctx.ui.setWidget(STATUS_KEY, [ctx.ui.theme.fg("success", "[ Codemode ON ]")], { placement: "belowEditor", });
  }

  function persistedHint(store: ScopedSettingsStore): string {
    const scopes = store.persistedScopes();
    if (scopes.length === 0) return "";
    return ` · persisted for ${scopes.join(", ")}`;
  }

  pi.registerCommand("codemode", {
    description:
      "Toggle Pi's native Codemode tool · add -l (this project) or -g (all projects) to persist it",

    getArgumentCompletions: (prefix) => completionItems(prefix),

    handler: async (args, ctx) => {
      if (!isAvailable()) {
        ctx.ui.notify(
          "Native Codemode is not available. Make sure builtin:codemode is enabled.",
          "error",
        );
        return;
      }

      const parsed = parseCommand(args);

      if (!parsed.ok) {
        ctx.ui.notify(
          `${parsed.error}. Usage: /codemode [on|off|status|toggle] [-l] [-g]`,
          "error",
        );
        return;
      }

      const store = new ScopedSettingsStore(ctx.cwd, getAgentDir());

      if (parsed.action === "status") {
        const removed = store.persistedScopes();
        ctx.ui.notify(`Codemode is ${isEnabled() ? "enabled" : "disabled"}`, "info");
        ctx.ui.notify(describePersisted(removed), "info");
        updateStatus(ctx);
        return;
      }

      if (parsed.action === "toggle") {
        setEnabled(!isEnabled());
      } else {
        setEnabled(parsed.action === "on");
      }

      // Persisting is explicit: a bare toggle never writes anything. The
      // final (post-toggle) state becomes the startup default.
      for (const scope of parsed.scopes) {
        if (scope === "project" && !ctx.isProjectTrusted()) {
          ctx.ui.notify("This project is untrusted; refusing to write .pi/settings.json.", "error");
          continue;
        }

        const mode: EditMode = isEnabled() ? "enable" : "disable";

        try {
          store.persist(scope, mode);
        } catch (error) {
          ctx.ui.notify(
            `Failed to update ${scope === "project" ? "project" : "global"} settings: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
      }

      updateStatus(ctx);
      ctx.ui.notify(
        `Codemode is ${isEnabled() ? "enabled" : "disabled"}${persistedHint(store)}`,
        "info",
      );
    },
  });

  // Reflect Codemode state when Pi starts, including when enabled
  // through defaultTools.
  pi.on("session_start", (_event, ctx) => {
    updateStatus(ctx);
  });

  // Re-sync the indicator after navigating the session tree.
  pi.on("session_tree", (_event, ctx) => {
    updateStatus(ctx);
  });
}
