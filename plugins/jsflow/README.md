# jsflow: an Agent Skill for coding agents

This plugin gives your coding agent one skill, `jsflow`. It teaches the agent to build with [jsflow](https://jsflow.com) (rooms of browsers that exchange messages directly, through the `jsflow-sdk`) and to manage a jsflow account through the `jsflow` command line: apps, origins, keys, usage, logs, live rooms, join tickets and removing users from rooms.

## What the skill runs

- `npx jsflow-cli@<version> …`, the jsflow command line, pinned to one released version (and `jsflow …` when it is installed). The CLI has no dependencies and needs Node.js 20 or newer.
- Only the commands you ask for. Anything that spends money, deletes, or creates access (payment, the plan, the spend cap, deleting an app or the account, members, new access tokens) is refused by the service for a coding agent: the CLI exits with "needs a person" and the skill tells the agent to hand you the link.
- Secret keys are written to a file with mode 0600 and are never printed to the conversation.

## What it sends and fetches

- **Sends**, to `api.jsflow.com` (HTTPS): the CLI's requests for your jsflow account, with an access token that **you** approved on a jsflow page in your browser (`jsflow signup` or `jsflow login`). The token is stored in `~/.config/jsflow/credentials.json`, readable only by you, and is never shown to the agent. Each request names the agent in the account's audit log ("you via <agent>").
- **Fetches**: the `jsflow-cli` package from the npm registry, and, only when asked for, documentation pages from `jsflow.com`.
- Nothing else is sent anywhere, and the skill collects no telemetry.

## No account yet?

Run `npx jsflow-cli@<version> signup`. It opens a page in your browser where you create your jsflow account (GitHub, Google or an email link) and approve the login: that is the only step a person must do. jsflow is in early access, by invitation: without one, the command ends with a link to the waitlist, https://jsflow.com/waitlist/.

## Privacy, support, licence

How jsflow handles personal data: https://jsflow.com/privacy-policy/. Questions, problems and security reports: support@jsflow.com, or the issues of this repository. MIT licence (see [LICENSE](LICENSE)); the jsflow SDK and service have their own terms at https://jsflow.com/terms/.
