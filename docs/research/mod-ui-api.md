# Mod UI API (distilled from mods/types/claude-code.d.ts, CC 2.1.283)

- Elements (terminal): Box, Text, Button, Input, Select, Link, Code, Markdown, Client, Raster, Image. No Icon/Spinner element — use glyphs/emoji in Text.
- Code: `source` (≤10000 chars), `language?`, `path?` (infers language), `startLine?`, `format?: 'source'|'diff'` (diff = unified hunks with gutters + add/remove bg), `wrap?`.
- Markdown: `text`, `dimColor?`, `pressableLinks?`/`onLinkPress`.
- Input: `key`, `label?`, `placeholder?`, `value?`, `submitLabel?`, `autoFocus?`, `onInput?(value,e)`, `onSubmit(value,e)`.
- Button: `key?`, `label?`, `hotkey?`, `action?` (engine keybinding), `plain?`, `dimColor?`, `autoFocus?`, `onPress()`.
- Select: `key`, `label?`, `options:{value,label?}[]`, `value?`, `onSelect(value,e)`.
- Handlers are plain closures captured at render; engine invokes them after the ui.press/ui.input/ui.select chain.
- PaneOpenArgs: `{id (1-64 [A-Za-z0-9_-]), title?, focus?: true, closeOnEscape?: true, holdToasts?: true, rows?, columns?}`. Reopening same id retitles. Multiple ids = tabs; one shown at a time.
- Pane render props: `{title, isFocused, bodyColumns, placement:'dock'|'inline', scroll:{offset, bodyRows}, view:{agentId?}}`; `e.viewport {columns, rows, isFullscreen?}`.
- Dock: fullscreen layout (CLAUDE_CODE_NO_FLICKER=1), ≥110 cols when requested, 144 unrequested; `isPlaced=false` means waiting undrawn.
- Render slots: AskUserQuestion, UserMessage, AssistantMessage, ToolUse, ToolResult, ToolGroup, ToolProgress, CommandOutput, Spinner, TurnDuration, InfoNotice, SessionMode, PromptHint, AbovePrompt, Pane.
- ui.scroll hook input: `{component, requestId, offset, by, bodyRows, contentRows, origin, pointer?}`; return `{}` to own scrolling.
- ui.toast(text,{timeoutMs}), ui.status(text|undefined), ui.log(text,{to:'transcript'|'debug'}), ui.invalidate('ui.render'), ui.panes() → own panes `{id,title,isShown,isFocused,isPlaced}`.
