# jsflow: an Agent Skill for coding agents

This plugin gives your coding agent one skill, `jsflow`. It teaches the agent to build with [jsflow](https://jsflow.com) (rooms of browsers that exchange messages directly, through the `jsflow-sdk`) and to manage a jsflow account through the `jsflow` command line: apps, origins, keys, usage, logs, live rooms, join tickets and removing users from rooms.

## What the skill runs

- `npx jsflow-cli@<version> …`, the jsflow command line, pinned to one released version (and `jsflow …` when it is installed). The CLI has no dependencies and needs Node.js 20 or newer.
- Only the commands you ask for. Anything that spends money, deletes, or creates access (payment, the plan, the spend cap, deleting an app or the account, members, new access tokens) is refused by the service for a coding agent: the CLI exits with "needs a person" and the skill tells the agent to hand you the link.
- Secret keys are written to a file with mode 0600 and are never printed to the conversation.

## What it sends and fetches

- **Sends**, to `api.jsflow.com` (HTTPS): the CLI's requests for your jsflow account, with an access token that **you** approved on a jsflow page in your browser (`jsflow signup` or `jsflow login`). The token is stored in `~/.config/jsflow/credentials.json`, readable only by you, and is never shown to the agent. Each request names the agent in the account's audit log ("you via <agent>"). If `JSFLOW_TOKEN` is set in the environment (an access token a person created in the dashboard, with limited scopes), the CLI uses it instead, and sends it only to `api.jsflow.com`.
- **Fetches**: the `jsflow-cli` package from the npm registry, and, only when asked for, documentation pages from `jsflow.com`.
- Nothing else is sent anywhere, and the skill collects no telemetry.

## No account yet?

Run `npx jsflow-cli@<version> signup`. It opens a page in your browser where you create your jsflow account (GitHub, Google or an email link) and approve the login: that is the only step a person must do. jsflow is in early access, by invitation: without one, the command ends with a link to the waitlist, https://jsflow.com/waitlist/.

Without an invitation your agent can still build: it can run on `http://localhost` or `127.0.0.1` with the shared demo app (up to 16 peers a room), whose key is in the [quick start](https://jsflow.com/docs/start/quick-start/). The demo app is shared, so the skill tells the agent to use a random room name. Your own app key, for your own domain, comes with an invitation.

## Example prompts

1. "Build a buzzer game with jsflow: the laptop shows a QR code and the scoreboard, phones join from the link and press a buzzer, and the laptop decides who was first. Let me test it in browser tabs on localhost."
2. "Add a shared drawing board to my app with Yjs and y-jsflow: everyone's drawing and cursors, and edits made offline merge when the device is back online."
3. "Create a jsflow app for https://app.example.com, allow http://localhost:5173 too, and put the publishable key in my .env."
4. "Joins to my jsflow app were refused in the last 7 days. Find out why and fix it."
5. "How many peer-minutes and relayed gigabytes did my jsflow app use this month?"
6. "Add join tickets: my Node server signs a ticket for the signed-in user and the room, and the page joins with it. Keep the secret key out of the code."

The login asks which scopes to approve. Prompt 5 needs only the `read` preset; prompts 3 and 4 need `dev`; prompt 6 creates a secret key, so it needs `full`. Approve the least that covers what you ask.

## Troubleshooting

- `jsflow whoami` shows whether there is a login and for which account. Exit code 3 means there is none: run `jsflow login` (or `jsflow signup`), which opens a page in your browser.
- Every error has a code, and `jsflow errors <code>` explains it offline; the same list is at https://jsflow.com/docs/reference/errors/.
- "needs a person" (exit code 4) means the action is yours to approve: open the link the command printed.
- Node.js 20 or newer is required for the command line. Without it, create an access token in the dashboard and use the server API, https://jsflow.com/docs/reference/server-api/.

## Privacy, support, licence

How jsflow handles personal data: https://jsflow.com/privacy-policy/. Questions, problems and security reports: support@jsflow.com, or the issues of this repository. MIT licence (see [LICENSE](LICENSE)); the jsflow SDK and service have their own terms at https://jsflow.com/terms/. jsflow and the jsflow logo are trademarks of Precisit AB and are not covered by the MIT licence.
