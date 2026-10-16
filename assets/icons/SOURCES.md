# Brand icon sources

Every logo here is the vendor's own artwork. Only its size changes, plus the
rounded-corner mask that every app-icon tile in this folder shares. The
copies under `landing/public/assets/icons/` are resized from the same files.
The logos are trademarks of their owners and are used only to name the tool or
service that anotifier works with. Checked 2026-10-10.

| File | Brand | Source |
| --- | --- | --- |
| `claude.png` | Claude (Anthropic) | Anthropic's Claude mark (clay on cream). The original download was not recorded. |
| `codex.png` | Codex (OpenAI) | The Codex app logo (a gradient cloud with `>_`) on a white tile. It matches `webview/assets/codex-app-ga-logo-*.png` in OpenAI's VS Code extension `openai.chatgpt`. |
| `cursor.png` | Cursor (Anysphere) | `App Icons/PNG/APP_ICON_3D_DARK.png` from the brand kit on https://cursor.com/brand (https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/brand/cursor-brand-assets.zip), resized from 1024 px to 512 px |
| `gemini.png` | Gemini CLI (Google) | Byte-for-byte the same image as `packages/vscode-ide-companion/assets/icon.png` in https://github.com/google-gemini/gemini-cli (Apache-2.0) |
| `vscode.png` | Visual Studio Code (Microsoft) | The VS Code product icon, https://code.visualstudio.com/brand |

Marks used only on the site (`landing/`):

| File | Brand | Source |
| --- | --- | --- |
| `landing/public/assets/icons/slack.svg` | Slack | Slack's own mark file from slack.com's navigation, https://a.slack-edge.com/9cc0056/marketing/img/nav/logo.svg, unmodified |
| `landing/public/assets/icons/telegram.svg` | Telegram | https://telegram.org/img/t_logo.svg, unmodified |
| `landing/components/GitHubIcon.tsx` | GitHub | simple-icons 16.34.0 `github` (CC0), https://cdn.jsdelivr.net/npm/simple-icons@16.34.0/icons/github.svg |
| `landing/components/DiscordIcon.tsx` | Discord | simple-icons `discord` (CC0) |

Home-page UI icons (`landing/components/home/BrandIcon.tsx`):
[Heroicons](https://github.com/tailwindlabs/heroicons) v2.2.0 (repository
commit `616b7a4dbbf3d011760af8066262cd5c6b3868f3`), by Tailwind Labs, MIT
licence. The full licence text is in `assets/icons/LICENSE-heroicons.txt`. The
paths are the unmodified `optimized/24/outline` SVGs; the page draws them with
`currentColor` (brand green `#59d499`) at a 1.5 stroke. No third-party paid
assets are in this repository.

| Name in `BrandIcon.tsx` | Heroicons glyph | Used for |
| --- | --- | --- |
| `desktop` | `computer-desktop` | desktop toasts |
| `phone` | `device-phone-mobile` | phone push |
| `link` | `link` | webhooks |
| `terminal` | `command-line` | terminal bell |
| `lines` | `bars-3-bottom-left` | rich content |
| `approval` | `hand-raised` | approval alerts |
| `focus` | `cursor-arrow-rays` | click-to-focus |
| `cube` | `cube` | zero dependencies, the npm install row |
| `bell` | `bell-alert` | closing call to action |
