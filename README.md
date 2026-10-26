# pi-codemode-toggle

A tiny Pi extension to toggle Pi's native `codemode` tool at runtime without editing settings or restarting Pi.


```bash
pi install npm:pi-codemode-toggle
```

```text
/codemode              # toggle (this session only, nothing is saved)
/codemode on
/codemode off
/codemode status
```


## Persisting across sessions

Toggling only changes the current session — Pi resets active tools on every
startup, which keeps things minimal by default. If you want your choice to
survive new sessions, persist it explicitly with `-l` (this project) or `-g`
(all projects):

```text
/codemode on -l        # enable now + persist for this project   (.pi/settings.json)
/codemode off -l       # disable now + clear the project's saved default
/codemode on -g        # enable now + persist globally            (agent settings.json)
/codemode off -g       # disable now + clear the global saved default
```

Persisting works through Pi's own `defaultTools` setting (a `+codemode`
modifier), so the saved state lives in the same settings files Pi itself
manages and hand edits stay in sync. `/codemode status` reports both the
active state and where it is currently persisted.

## Demo
https://github.com/user-attachments/assets/b4861e7c-d3ed-4bdc-a663-2461c196fb5a




## Why

Pi ships a native Codemode tool (`builtin:codemode`) that lets the model emit a small Javascript
program instead of one tool call per step.
Enabling or disabling it previously meant editing config and restarting the session.
This extension calls `setActiveTools` at runtime, so the change applies to the very next model turn.

## License

[MIT](./LICENSE)
