# Mai Corp App Class Companion (local preview)

This VS Code extension provides local Secret Shield scans, sanitized previews, an environment-variable coach, a local Supabase file inventory, lesson-prompt copying, and teaching checklists. It does not upload project files or environment values.

## Install for local development

1. Open this `vscode-companion` folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a separate project folder in that host and try commands from the Command Palette (`Ctrl+Shift+P`) beginning with `Mai Corp:`.

There is no `.vsix` package yet; this source repository is not a marketplace release. Public publishing is intentionally not performed.

## Kilo workflow

Use the [official Kilo Code Marketplace listing](https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code) and follow its current in-product setup instructions. Availability of models, providers, and usage depends on the student's own provider/account and can change; this project does not promise that model usage is free.

Use **Mai Corp: Copy Lesson Prompt** and paste the prompt into Kilo's supported chat interface yourself. The companion does not access Kilo's private chat, intercept its model requests, control its context, or execute a prompt on the student's behalf. Kilo is optional; local scanning and file-inventory tools do not require it.

## Secret Shield and Demo Mode

- The extension scans open/edited documents and can scan up to 10,000 files in the selected workspace. Values are omitted from diagnostics and scan summaries.
- Detection is heuristic and can miss secrets or flag harmless text. Review findings before sharing.
- `.gitignore` is not a security guarantee. Excluded files are not silently copied or changed.
- Sanitizing a selection writes a redacted copy to the clipboard. Previewing a file opens an untitled sanitized document; original files are not rewritten.
- Demo Mode is a checklist and status indicator, not a way to hide editor tabs or mask a desktop. It cannot inspect or control external applications, screen capture, notifications, terminals, Kilo requests, or other VS Code extensions.
- Use a separate teaching workspace containing placeholders instead of opening private production configuration on a shared screen.

## Commands

Scan current file/workspace/Git changes, review findings, sanitize selected text, preview sanitized text, enable or disable Secret Shield, start/stop Demo Mode, hide and restore selected protected files from Explorer, run a pre-class check, inspect environment-variable names, generate a placeholder-only `.env.example`, inventory local Supabase files, copy an exercise prompt, and preview a command before running it.

Only the command preview workflow is guarded by this extension. Commands invoked independently through Kilo, other terminals, scripts, or external tools are outside its control. Command-risk warnings are heuristic and do not guarantee safety.

## Authentication and course materials

No extension authentication or remote course retrieval is implemented: the existing app has no extension OAuth/device flow or authorized lesson-prompt API. Prompts can be drafted locally and copied; this does not bypass course entitlement controls. Do not paste passwords or tokens into extension settings. No privileged Supabase/OpenRouter credential is bundled.

## Validation

Run the local scanner tests with `npm test` from this folder. This source preview has not been tested inside a VS Code Extension Host or packaged as a `.vsix`.
