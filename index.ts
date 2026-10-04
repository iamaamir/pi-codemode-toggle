import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const TOOL_NAME = "codemode";
const STATUS_KEY = "codemode-toggle";

type Action = "toggle" | "on" | "off" | "status";

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

  function notifyStatus(ctx: ExtensionContext): void {
    ctx.ui.notify(`Codemode is ${isEnabled() ? "enabled" : "disabled"}`, "info");
  }

  function parseAction(args: string): Action | undefined {
    const value = args.trim().toLowerCase();

    if (value === "") return "toggle";
    if (value === "toggle") return "toggle";
    if (value === "on") return "on";
    if (value === "off") return "off";
    if (value === "status") return "status";

    return undefined;
  }

  pi.registerCommand("codemode", {
    description: "Toggle Pi's native Codemode tool",

    getArgumentCompletions: (prefix) => {
      const actions = ["on", "off", "status", "toggle"];

      const matches = actions
        .filter((action) => action.startsWith(prefix.toLowerCase()))
        .map((action) => ({
          value: action,
          label: action,
        }));

      return matches.length > 0 ? matches : null;
    },

    handler: async (args, ctx) => {
      if (!isAvailable()) {
        ctx.ui.notify(
          "Native Codemode is not available. Make sure builtin:codemode is enabled.",
          "error",
        );
        return;
      }

      const action = parseAction(args);

      if (!action) {
        ctx.ui.notify("Usage: /codemode [on|off|status|toggle]", "error");
        return;
      }

      if (action === "status") {
        notifyStatus(ctx);
        updateStatus(ctx);
        return;
      }

      if (action === "toggle") {
        setEnabled(!isEnabled());
      } else {
        setEnabled(action === "on");
      }

      updateStatus(ctx);
      notifyStatus(ctx);
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
