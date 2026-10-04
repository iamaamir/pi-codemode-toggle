# pi-codemode-toggle

A tiny Pi extension to toggle Pi's native `codemode` tool at runtime without editing settings or restarting Pi.

> **How to enable codemode in Pi:** install the extension, run `/reload`, then type `/codemode`.
> Use `/codemode off` to disable it again, `/codemode status` to query it. The footer indicator
> always shows `codemode:on` or `codemode:off`.

Landing page: <https://iamaamir.github.io/pi-codemode-toggle/>
Pi package: <https://pi.dev/packages/pi-codemode-toggle>

```bash
pi install npm:pi-codemode-toggle
```

```text
/codemode          # toggle
/codemode on
/codemode off
/codemode status
```

## Why

Pi ships a native Codemode tool (`builtin:codemode`) that lets the model emit a small TypeScript
program instead of one tool call per step. Enabling or disabling it previously meant editing config
and restarting the session. This extension calls `setActiveTools` at runtime, so the change applies
to the very next model turn.

## Install scope and project trust

```bash
pi install npm:pi-codemode-toggle          # personal: ~/.pi/agent/settings.json
pi install npm:pi-codemode-toggle -l       # project:  .pi/settings.json
```

The `-l` form writes to the project's `.pi/settings.json`, which Pi only reads **after that folder is
trusted**. If `/codemode` is missing, you are most likely in an untrusted project. Drop the `-l`
flag, or grant trust to the directory.

Verify with `pi list`.

## Requirements

- Pi (`@earendil-works/pi-coding-agent`) with `builtin:codemode` available
- No runtime dependencies; MIT licensed