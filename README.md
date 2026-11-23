# jsflow community

The public home for **questions, bug reports, ideas and runnable examples** for [jsflow](https://jsflow.com): rooms of
browsers (and other clients) that exchange messages directly. The service, its dashboard and the SDK's source are developed
elsewhere; this repository is where you talk to us and to each other.

| you want to | go to |
|---|---|
| learn jsflow | the documentation: https://jsflow.com/docs/ |
| ask how to do something, or share what you built | **Discussions** in this repository |
| report a bug in the SDK, the service or the docs | **Issues** in this repository (use the form) |
| suggest a feature | **Discussions**, category Ideas |
| see whether jsflow is up | https://status.jsflow.com |
| get an answer by email (Pro and Scale plans), ask about billing or privacy | support@jsflow.com |
| report a security problem | see [SECURITY.md](SECURITY.md) |

## Examples

[`examples/`](examples/) has small, complete pages that use the SDK, one folder each, with no build step: hello, presence,
shared state, reliable chat, and join-ticket backends in Node, Python and Go. They use the shared demo key, which works on
`http://localhost` only; use your own app's key from the dashboard for anything else.

Everything in this repository is **copied here from our main repository** with every release, so pull requests cannot be merged:
tell us in an issue or a discussion what to change, and we change it at the source.

## Use jsflow with your agent

An Agent Skill teaches a coding agent to build with jsflow and to manage a jsflow account safely through the `jsflow` command line (a person approves anything that spends money, deletes or creates access). It lives in this repository, in [`plugins/jsflow`](plugins/jsflow/); its [README](plugins/jsflow/README.md) says what it runs, sends and fetches.

- **Claude Code:** `/plugin marketplace add precisit/jsflow-community`, then `/plugin install jsflow@jsflow`.
- **Other agents** (Cursor, Codex, Gemini CLI and more): `npx skills add precisit/jsflow-community`.
- **GitHub CLI:** `gh skill install precisit/jsflow-community jsflow`.

No jsflow account yet? `npx jsflow-cli signup` opens a page where a person creates one and approves the login. jsflow is in early access, by invitation: [join the waitlist](https://jsflow.com/waitlist/).

## Licence

The files in this repository (the examples, the templates, the text) are under the [MIT licence](LICENSE). The jsflow SDK and
the service are **not** MIT: the SDK is source-visible and free to use with the service, under its own licence, and the service
is covered by the terms at https://jsflow.com. Using an example does not change that. jsflow and the jsflow logo are trademarks of Precisit AB and are not covered by the MIT licence.

## Please

- Never post a secret key (`sk_…`) or a signed join ticket. If you did, revoke the key in the dashboard now.
- Follow the [code of conduct](CODE_OF_CONDUCT.md).
