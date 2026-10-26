# pi-codemode-toggle

A tiny Pi extension to toggle Pi's native `codemode` tool at runtime

```bash
pi install npm:pi-codemode-toggle
```

```bash
/codemode              # toggle (this session only, nothing is saved)
/codemode on
/codemode off
/codemode status
```

## Persisting across sessions

Toggling only changes the current session — Pi resets active tools on every
startup, which keeps things minimal by default. If you want your choice to
survive new sessions, persist it explicitly with `-l` (local to project) or `-g`
(all projects):

```bash
/codemode on -l        # enable now + persist for this project   (.pi/settings.json)
/codemode off -l       # disable now + clear the project's saved default
/codemode on -g        # enable now + persist globally            (agent settings.json)
/codemode off -g       # disable now + clear the global saved default
```

## Demo

https://github.com/user-attachments/assets/b4861e7c-d3ed-4bdc-a663-2461c196fb5a

## Why

Pi ships a native Codemode tool (`builtin:codemode`) that lets the model emit a small Javascript
program instead of one tool call per step.
Enabling or disabling it previously meant editing config and restarting the session.

## Related work

Other Pi extensions by the same author:

- **[pi-bifrost](https://iamaamir.github.io/pi-bifrost/)** — configuration-first model router. Routes each prompt to a model
  by task tier, cost, speed, or context length.

  ```bash
  pi install npm:pi-bifrost
  ```

- **[system-one](https://iamaamir.github.io/system-one/pi/)** — provider-neutral System One runtime for TypeScript
  and Pi. Calibrated `choice`, `noul`, and `score` decisions via Jev, Reflex, or your own provider.

  ```bash
  pi install npm:pi-system-one
  ```

## License

[MIT](./LICENSE)
