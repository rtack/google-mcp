# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile TypeScript → dist/
pnpm dev              # Run with hot reload (tsx watch)
pnpm test             # Run all tests (watch mode)
pnpm test:coverage    # Run tests with coverage report
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
```

Run a single test file:
```bash
pnpm vitest run src/__tests__/gmail.test.ts
```

Run a single test by name:
```bash
pnpm vitest run --reporter=verbose -t "should get user profile"
```

## Architecture

### Entry & Server

`src/index.ts` → `src/server.ts` (`GoogleWorkspaceMCPServer`) is the single MCP server. It registers all tools in two handlers:
- `ListToolsRequestSchema` — returns tool definitions with Zod-derived JSON schemas
- `CallToolRequestSchema` — dispatches tool name → service method call

Services are lazily initialized in `initializeServices()`, called only after OAuth is confirmed ready via `ensureAuthenticated()`.

### Auth

`src/auth/oauth.ts` exports a singleton `oauth` instance (`GoogleOAuth`). It handles:
- Reading `credentials.json` from platform-specific config dirs (`~/Library/Application Support/google-mcp/` on macOS)
- Storing/refreshing tokens at the same location as `tokens.json`
- Starting a local HTTP callback server on ports 3000–3100 for OAuth redirect

### Services

Each file in `src/services/` wraps one Google API. Services take an `Auth.OAuth2Client` in the constructor and call `googleapis` directly. There is no shared base class.

| File | Google API |
|------|-----------|
| `calendar.ts` | Calendar v3 |
| `gmail.ts` | Gmail v1 |
| `drive.ts` | Drive v3 |
| `docs.ts` | Docs v1 |
| `sheets.ts` | Sheets v4 |
| `slides.ts` | Slides v1 |
| `forms.ts` | Forms v1 |
| `chat.ts` | Chat v1 |
| `meet.ts` | Meet v2 |
| `people.ts` | People v1 (Contacts) |
| `tasks.ts` | Tasks v1 |
| `youtube.ts` | YouTube Data v3 |
| `photos.ts` | Photos Library v1 upload — raw HTTP, no typed googleapis client exists |

### Types / Zod Schemas

`src/types/index.ts` defines Zod schemas used for input validation in tool handlers. New schemas go here and are imported into `server.ts`.

### Adding a New Tool

1. Add the method to the relevant service in `src/services/`
2. If the tool needs input params beyond primitives, add a Zod schema to `src/types/index.ts`
3. Register the tool in `server.ts`: add it to the `ListToolsRequestSchema` handler and add a `case` in the `CallToolRequestSchema` switch
4. Add test coverage in `src/__tests__/<service>.test.ts`

## Testing

Tests use **vitest** and mock `googleapis` at the module level. The mock must be declared before the service import because vitest hoists `vi.mock()` calls.

Pattern for each test file:
```ts
const mockSomeMethod = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    serviceName: () => ({ resource: { method: mockSomeMethod } }),
  },
}));

import { MyService } from "../services/my-service.js";
```

`src/server.ts` is intentionally excluded from coverage — it's considered e2e integration territory. Coverage thresholds: statements 80%, branches 65%, functions 85%, lines 80%.

## Testing

Always write tests when adding new functionality. New MCP tools, service methods, or handler branches must include corresponding test cases in `src/__tests__/` in the same commit.

## Branching & terminology: MR vs PR

Three-branch model (local to this checkout):

- **`main`** — normally a pure mirror of `upstream/main` (`quinnjr/google-mcp`); doc-only exceptions may land here directly when explicitly instructed. All feature branches start here: `git checkout -b feat/<name> main`.
- **`local-dev`** — the integration branch actually built and run as the live MCP server (`node dist/index.js`). This is Raphael's local dev environment — the whole point is to run in-progress features here before they're ever submitted anywhere.
- **`feat/<name>`** — one per feature/fix, pushed to `origin` (the fork, `rtack/google-mcp`) once ready.

Two distinct actions, two distinct terms — do not use them interchangeably:

- **MR** = merging a `feat/<name>` branch into **`local-dev`** (Raphael's own fork/repo). A plain `git merge`, not a GitHub pull request object. **Gate: live-verified only** (a real MCP tool call against real Google APIs/data — green tests are necessary but not sufficient, see the Photos-feature history below). **No code review required** — it's Raphael's own local integration branch, reviewing your own local merge adds no value.
- **PR** = a GitHub pull request opened against **`quinnjr/google-mcp`** (the external upstream repo). **Gate: everything MR requires, plus**: `README.md`'s tool table updated, and **code-reviewed** (e.g. `/code-review` on the branch diff, findings addressed or explicitly accepted) — this one matters because it's headed to someone else's repo for their review.

**Merging (MR) is approval-gated, not Claude-forbidden.** Claude may run `git merge` into `local-dev` — but only after: (1) the MR gate below is satisfied, (2) Claude has explicitly proposed *that specific merge* and stated the gate is satisfied, and (3) the owner has explicitly approved *that specific proposal* (approve/decline, not inferred from an earlier, related instruction). Never merge preemptively "since tests pass" or because a merge seems like the obvious next step — always propose first and wait. Opening a PR follows the same propose-then-approve pattern, at the PR gate.

Before an **MR** (merge into `local-dev`), confirm, then propose and wait for approval:
- [ ] Tests written in the same commit, `pnpm test` and `pnpm lint` clean
- [ ] Live-verified against the real API
- [ ] Explicit, in-the-moment approval for *that specific merge*

Before a **PR** (against `quinnjr/google-mcp`), confirm all of the above, plus:
- [ ] `README.md`'s per-domain tool table updated if a tool was added/changed/removed
- [ ] Code-reviewed (e.g. `/code-review` on the branch diff) — findings addressed or explicitly noted as accepted, not silently skipped
- [ ] PR targets `quinnjr/google-mcp` (upstream), not the fork's own `main`, unless explicitly told otherwise
- [ ] Explicit, in-the-moment approval for opening (not inferred from a related request)

## MR/PR Gates Require Evidence, Not Just a Checked Box

A checklist item above is satisfied only when its evidence is pasted into that turn — not recalled from memory or asserted in passing. "Tests pass" and "☑" are not evidence; the actual output is.

- **Tests written in the same commit** — name the test file(s) and how many cases were added/changed (e.g. "`calendar.test.ts` +8 cases, `calendar-presets.test.ts` new file, 8 cases").
- **`pnpm test` / `pnpm lint` clean** — paste the real summary line from the run (e.g. "Test Files 14 passed (14), Tests 276 passed (276)"; "0 errors, 200 warnings"), not a claim that it passed.
- **Live-verified against the real API** — state the exact tool call made and its result. "Deferred" is not evidence of anything except that this item is unmet — say so plainly if it's the case, don't dress it up as satisfied.
- **Explicit, in-the-moment approval** — quote the user's literal words that gave it; a paraphrase or an inference from an earlier, related turn doesn't count.
- **(PR only) README table updated** — name the section/rows changed.
- **(PR only) Code-reviewed** — name the method used (e.g. `/code-review` on the branch diff) and state findings addressed vs. explicitly accepted.

This doesn't replace the checklists above — it's how each line gets satisfied. An item with no evidence blocks the merge/PR exactly like an unchecked one.

**Don't propose the merge/PR itself until every item has evidence.** A turn that lists which items are met and which aren't is still gate-checking, not a proposal — never frame it as "this message is that request" while an item is still open. If an unmet item can be satisfied directly (e.g. running the live-verification call), do that first and then propose with full evidence. If it needs the owner's input, ask about that specific blocker on its own — not bundled with a merge request that isn't actually ready yet.

## Worktree Isolation Required for All Work

Multiple sessions can work on this repo concurrently. To prevent one session's uncommitted changes from silently landing in another session's shared checkout — as happened when an untracked `setCalendarSelected`/`selected` addition to `calendar.ts` appeared on `feat/calendar-create` without the session working that branch having made it — all work here must happen in an isolated git worktree, never directly in the shared checkout.

- Before editing any file, use `EnterWorktree` (or launch with `--worktree`) to get an isolated copy of the current branch.
- Never assume the working tree is clean or matches what you last left it — a concurrent session may have uncommitted changes sitting in the shared checkout that aren't yours. Worktrees make this a non-issue instead of something to remember to check.

## Live-Verifying a `feat/` Branch Before an MR

The live `google` MCP connection runs `local-dev`'s build, so a `feat/<name>` branch's new tools aren't callable through it until they're merged — but merging is exactly what the live-verify gate has to happen *before*. Requiring the owner to reconnect their session (registering the branch as a second MCP server, `/exit`, `claude --resume`) is not the answer — it's real work handed to them for something Claude can do unattended.

**Do this instead: act as your own MCP client, no session or harness config involved at all.**

1. Build the feature worktree: `pnpm build` inside its worktree directory.
2. `@modelcontextprotocol/sdk` is already a dependency of this repo (used to build the server itself), so it's available in `node_modules` for a client too. Write a small throwaway script (e.g. `verify-live.mjs`, inside the worktree so module resolution finds `node_modules` — never commit it) that:
   - Constructs `new StdioClientTransport({ command: "node", args: ["dist/index.js"] })` and a `new Client({ name, version }, { capabilities: {} })`, then `client.connect(transport)` — this spawns the branch's *own* built server as a subprocess and speaks real MCP to it directly, completely bypassing whatever the harness's live session has loaded.
   - Calls the new tool(s) for real via `client.callTool({ name, arguments })` against real calendar data — prefer a calendar clearly meant for this (e.g. one named `zzz-live-verify-delete-me`, if one exists) and round-trip any state change (flip, verify, flip back) so the account is left exactly as found.
   - Logs each call + raw response — that transcript is the live-verify evidence for the MR proposal.
3. Delete the script afterward; it's a one-off verification tool, not part of the feature (never `git add` it).

No `claude mcp add`/`remove`, no reconnect, no owner action required.
