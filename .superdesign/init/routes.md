# Routes

The Vite app has one root entry and no routing dependency.

| URL | Entry                              | Layout      |
| --- | ---------------------------------- | ----------- |
| `/` | `src/main.tsx` → `src/app/App.tsx` | `App` shell |

`src/main.tsx` constructs one long-lived `GameRuntime` and mounts `<App runtime={runtime} />`. New developer tooling should remain inside this root rather than introducing a second app or route infrastructure.
