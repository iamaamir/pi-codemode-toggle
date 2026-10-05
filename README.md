# pi-codemode-toggle

A tiny Pi extension to toggle Pi's native `codemode` tool at runtime without editing settings or restarting Pi.


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

Pi ships a native Codemode tool (`builtin:codemode`) that lets the model emit a small Javascript
program instead of one tool call per step.
Enabling or disabling it previously meant editing config and restarting the session.
This extension calls `setActiveTools` at runtime, so the change applies to the very next model turn.
