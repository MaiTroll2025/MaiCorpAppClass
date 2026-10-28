# Student setup: VS Code and Kilo

Mai Corp App Class provides courses and lesson instructions. Students use Visual Studio Code for development and may use Kilo Code as an optional coding assistant. Kilo is a separate extension; provider/model availability and usage limits depend on the student's selected account and can change. Do not enter an instructor's credentials.

## Get started

1. Install Visual Studio Code from the [official VS Code download page](https://code.visualstudio.com/).
2. In VS Code, open Extensions (`Ctrl+Shift+X`) and install **Kilo Code** from the [official Marketplace listing](https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code). Follow its current in-product setup instructions.
3. Open a project folder with **File → Open Folder**. Use Explorer for files, the editor for code, Terminal for commands, and Source Control to inspect changes.
4. Open your lesson in Mai Corp App Class. Copy its exercise prompt (or use **Mai Corp: Copy Lesson Prompt** in the companion extension) and paste it into Kilo's supported interface yourself.
5. Ask Kilo to inspect the project before making edits. Review each proposed change, run the lesson's tests/build, inspect the Git diff, and save a checkpoint.

Kilo's private chat and model requests are not controlled by the companion. Never assume a model/provider is free or paste instructor-owned API keys.

## Environment and Supabase safety

- Keep real local configuration out of Git. `.env.example` should contain variable names and safe placeholders only.
- Framework rules differ. Vite exposes `VITE_*` values to browser code; do not put server-only secrets under that prefix.
- A Supabase publishable/anon key may be used in browser code only with appropriate RLS policies. Service-role/secret keys and database passwords are server-only.
- Learn with your own development project or safe placeholders. Do not connect lesson work to production or run destructive SQL without explicit review and authorization.
- A scan is heuristic: it cannot guarantee all secrets are detected or removed.

## Instructor screen-sharing checklist

Use a dedicated teaching workspace/window with synthetic values. Scan the selected workspace and Git changes, review any warnings, close unrelated apps and terminals, disable notifications, and check the actual shared screen. VS Code extensions cannot mask the whole desktop or guarantee secrets are hidden from Kilo, external terminals, browsers, or recording software.
