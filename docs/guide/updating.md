# Update and diagnose

Shibbo ships new tells and new model measurements in each release. Each install path gets a release in its own way.

## Check your install

```bash
npx shibbo doctor
```

```text
shibbo 0.1.1 from the npx cache (/Users/you/.npm/_npx/2074…/node_modules/shibbo)

Install
  warn  0.2.0 is on npm; this is 0.1.1
        → npx shibbo@latest doctor
  ok    Node 22.11.0
  ok    data loads: 374 tells, 28 measured models
  ok    checker works: 3 hits in the sample sentence

Project
  warn  CLAUDE.md: rules block written by 0.1.0; this is 0.1.1
        → npx shibbo init claude
  ok    .mcp.json: MCP server
  ok    .claude/settings.json: hooks

Settings
  note  SHIBBO_LOG is not set, so no record of hook runs exists
        → set SHIBBO_LOG to a file path to record each check

0 failures, 2 warnings
```

Run it in the project you set up. Each warning comes with the command that fixes it. The [command reference](/reference/cli#doctor) lists every check.

## Update each install path

| You installed with | Update with | Updates by itself |
|---|---|---|
| `npx shibbo …`, which `init` writes into hooks and MCP config | Nothing; see below | Yes, on current npm |
| `npm install shibbo` in a project | `npm install shibbo@latest` | No |
| `npm install -g shibbo` | `npm install -g shibbo@latest` | No |
| The Claude Code plugin | `claude plugin update shibbo@shibbo` | Only if you turn it on |

### npx

npx asks the registry for the newest version on each run and replaces an older cached copy. We tested this with npm 10.8. If `doctor` still reports an old version, run `npx shibbo@latest doctor` once, or delete the `_npx` folder inside the folder that `npm config get cache` prints.

A project that lists shibbo in its own `package.json` is different: npx runs that pinned copy first. Update it with `npm install shibbo@latest`. While shibbo's version starts with 0, `npm update` stays inside one minor version, so it moves 0.1.1 to 0.1.4 but never to 0.2.0.

### The Claude Code plugin

Claude Code updates Anthropic's own marketplaces by default and leaves all others alone, shibbo's included. To turn updates on:

1. Run `/plugin` and open the Marketplaces tab.
2. Select `shibbo`, then "Enable auto-update".

Claude Code then fetches a new release when a session starts, and the next session loads it. To update once by hand, run `claude plugin update shibbo@shibbo` in your shell, or pick "Update now" on the Installed tab. Run `/reload-plugins` to load the new version into a session that is already open.

## Refresh the written rules

`init` writes a rule block into your instructions file (`CLAUDE.md`, `AGENTS.md` and the like). That block is a copy made on the day you ran `init`, and a new release doesn't change it. Run `init` again to replace it:

```bash
npx shibbo init claude --model <id>
```

The block's first line records the version that wrote it, as in `<!-- shibbo:start v0.1.1 -->`, and `doctor` warns when that version is older than the one you run. A second run replaces the block in place and leaves the rest of the file alone. Pass the same `--model` you used the first time.

Hooks and the plugin need no refresh. They read the installed data on every run.

## When nothing seems to happen

A hook that fails stays silent, so that a broken hook can never stop your session. If the agent gets no feedback after an edit, work down this list:

1. Run `npx shibbo doctor`. A missing hooks file, `SHIBBO_EDIT=off` or a failed data load shows up here.
2. Set `SHIBBO_LOG` to a file path and edit a Markdown file with the agent. Each check adds one line to that file. No new line means the harness never called the hook. See [Settings](/reference/settings#log-each-check).
3. In Claude Code, run `claude plugin list`, and open the Errors tab in `/plugin`.
4. Check that the file is one shibbo reads. Plain source files are skipped; docs, pages, stylesheets and components are checked.
