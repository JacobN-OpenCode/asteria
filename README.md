# Asteria

Asteria is a cloneable personal channel companion bot for Slack. It is designed so that anyone can copy this repository, configure their own Slack app and personal channel, and run an independent instance that keeps daily updates, daily questions, welcome messages, and reminder state in SQLite.

## What Is Asteria?

Asteria manages one specific Slack channel: your personal channel. The owner writes a Daily Update in App Home, optionally adds a song and an event, and sends it into the channel with a single button press. The update posts under the owner's name and avatar. Asteria can also generate a daily question with Hack Club AI, ping a Slack user group in the Daily Update, remind the owner if they have not posted by the deadline, and welcome people who join the channel.

Asteria is built for real deployment on a Debian-based server such as Hack Club Nest. It uses Slack Socket Mode, so it does not need a public HTTPS endpoint for event delivery.

## Features

- Daily Updates sent manually from App Home.
- Daily Updates appear in the personal channel under the owner's own name and avatar.
- Markdown-friendly update text with links, mentions, bullets, and line breaks.
- Optional Song of the Day and Event of the Day fields.
- Slack user group mentions for the Daily Update ping.
- Optional thread starter reply after posting the Daily Update.
- AI-powered Daily Question generation with Hack Club AI.
- Daily Question scheduling in the owner’s timezone.
- Optional inclusion of the Daily Question inside the Daily Update.
- Daily Update reminder DM if the owner has not posted by the deadline.
- Welcomer messages when people join the configured personal channel.
- Optional rules Canvas link in welcome messages.
- App Home configuration with Daily Update, Daily Question, Welcomer, and Settings tabs.
- Owner-only configuration access with restricted views for everyone else.
- SQLite persistence for settings, drafts, send history, question history, reminder state, and welcome deduplication.
- Socket Mode operation with no public webhook server.

## Requirements

- Node.js 20 or newer.
- A Slack workspace where you can create and install apps.
- A Slack app created from the manifest in this repository.
- A Slack Bot User OAuth Token.
- A Slack App-Level Token with the `connections:write` scope.
- A Hack Club AI API key.
- A valid Hack Club AI model name, such as `qwen/qwen3-32b`.
- A Debian-based server if you plan to run Asteria remotely.

## Installation

```sh
git clone <your-repository-url>
cd asteria
npm install
cp .env.example .env
```

Edit `.env` and fill in the required values before starting the app.

## Slack App Setup

1. Open the Slack app manifest flow at https://api.slack.com/apps and create a new app from a manifest.
2. Paste the contents of [manifest.json](manifest.json) into the manifest editor.
3. Create the app in your workspace.
4. Open the app’s Basic Information page and enable Socket Mode.
5. Create an App-Level Token with the `connections:write` scope and copy it into `SLACK_APP_TOKEN`.
6. Install the app to your workspace and copy the Bot User OAuth Token into `SLACK_BOT_TOKEN`.
7. Copy your Slack user ID into `PERSONAL_CHANNEL_OWNER_ID`.
8. Copy your personal channel ID into `PERSONAL_CHANNEL_ID`.
9. Create or choose a Slack user group for the Daily Update ping and select it later in App Home.
10. Start Asteria.

If you change scopes in the manifest later, reinstall the app in Slack so the new scopes take effect.

## Environment Variables

| Variable                        | Required | Purpose                                                   | Default                            |
| ------------------------------- | -------- | --------------------------------------------------------- | ---------------------------------- |
| `SLACK_BOT_TOKEN`               | Yes      | Bot token used for Web API calls and message posting.     | None                               |
| `SLACK_APP_TOKEN`               | Yes      | App-level token used for Socket Mode.                     | None                               |
| `SLACK_SIGNING_SECRET`          | Yes      | Loaded for Bolt configuration consistency.                | None                               |
| `PERSONAL_CHANNEL_OWNER_ID`     | Yes      | Slack user ID of the only person allowed to edit Asteria. | None                               |
| `PERSONAL_CHANNEL_ID`           | Yes      | The Slack channel Asteria manages.                        | None                               |
| `HACKCLUB_AI_KEY`               | Yes      | Hack Club AI API key.                                     | None                               |
| `HACKCLUB_AI_MODEL`             | No       | Hack Club AI model to use for Daily Questions.            | `qwen/qwen3-32b`                   |
| `HACKCLUB_AI_BASE_URL`          | No       | OpenAI-compatible Hack Club AI base URL.                  | `https://ai.hackclub.com/proxy/v1` |
| `ASTERIA_DB_PATH`               | No       | Path to the SQLite database file.                         | `./data/asteria.sqlite`            |
| `ASTERIA_LOG_LEVEL`             | No       | Bolt log level.                                           | `info`                             |
| `ASTERIA_POLL_INTERVAL_SECONDS` | No       | How often the scheduler checks for due jobs.              | `60`                               |

## Running Locally

```sh
npm start
```

Asteria starts in Socket Mode and keeps running as a long-lived Node.js process.

## Running On Debian Or Nest

1. Copy the repository to the server.
2. Install Node.js 20 or newer.
3. Create a dedicated user for the service.
4. Place the `.env` file somewhere safe and readable by that user.
5. Install dependencies with `npm install`.
6. Start the app with `npm start` or the systemd service below.

The SQLite database persists on disk at the path in `ASTERIA_DB_PATH`, so restarts do not wipe settings, drafts, or history.

## systemd

This repository includes an example unit file at [deploy/asteria.service](deploy/asteria.service).

Typical deployment steps:

1. Copy the unit file to `/etc/systemd/system/asteria.service`.
2. Edit `WorkingDirectory`, `EnvironmentFile`, `ExecStart`, `User`, and `Group` so they match your server.
3. Reload systemd with `systemctl daemon-reload`.
4. Enable and start the service with `systemctl enable --now asteria`.

The example unit is configured to restart automatically if the bot crashes.

## App Home Setup

Open Asteria’s App Home as the owner. The default tab is Daily Update.

### Daily Update

- Write the day's update in the main text field.
- Optionally add a Song of the Day.
- Optionally add an Event of the Day.
- Optionally enable a thread starter reply and edit its text.
- Press Send Daily Update to post to the configured personal channel.
- The update is posted under the owner's Slack display name and avatar using Slack's `chat.postMessage`/`chat:write.customize` behaviour.

### Daily Question

- Enable or disable the generated Daily Question.
- Pick one or more built-in topics.
- Add extra custom topics as comma-separated text.
- Adjust the tone and custom instructions.
- Choose whether the question should also appear inside the Daily Update.
- Set the approximate send time in the owner’s timezone.

### Welcomer

- Enable or disable welcome messages.
- Edit the welcome text.
- Use `{user}` where the new member mention should appear.
- Add an optional rules Canvas URL.

### Settings

- Set the timezone using a valid IANA timezone such as `Europe/London` or `America/New_York`.
- Configure the Daily Update reminder deadline.
- Pick the personal channel.
- Pick the Slack user group that the Daily Update should mention.

Only the Slack user ID in `PERSONAL_CHANNEL_OWNER_ID` can save these settings. Everyone else sees a restricted App Home view.

## Usage

1. Open Asteria’s App Home.
2. Write the Daily Update.
3. Add an optional song and event.
4. Press Send Daily Update.
5. Asteria posts the message to your personal channel under your name and avatar and, if enabled, adds a thread reply.
6. Asteria posts the Daily Question separately on its own schedule.
7. If you have not posted by the reminder deadline, Asteria sends you a DM reminder.
8. If someone joins your personal channel, Asteria sends the configured welcome message.

When Daily Question inclusion is enabled, the question is also included inside the Daily Update, but it is still posted separately as its own Slack message.

## Slack Permissions

Asteria only requests the scopes it actually uses:

- `chat:write` for posting Daily Updates, Daily Questions, reminders, and welcome messages.
- `chat:write.customize` for posting the Daily Update with the owner's name and avatar.
- `users.profile:read` for reading the owner's display name and avatar so the Daily Update can appear as the owner.
- `channels:read` and `groups:read` for loading the personal channel picker in App Home.
- `im:write` for opening a DM channel to the owner and sending reminder DMs.
- `usergroups:read` for loading Slack user groups into the App Home selector.

If you change the manifest scopes, reinstall the Slack app in your workspace.

## Hack Club AI

Asteria uses the OpenAI-compatible Hack Club AI endpoint at `https://ai.hackclub.com/proxy/v1` by default.

- The API key comes from `HACKCLUB_AI_KEY`.
- The model comes from `HACKCLUB_AI_MODEL`.
- The Daily Question generator is the only AI feature in Asteria.
- Song of the Day, Event of the Day, and welcome text are always manually configured.

## Troubleshooting

- Socket Mode not connecting: confirm `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and `SLACK_SIGNING_SECRET` are set, and make sure the app has Socket Mode enabled.
- Bot not responding: confirm the bot was installed to the workspace and has the right scopes.
- Daily Question not sending: check `daily_question_enabled`, the send time, the timezone, and the Hack Club AI key/model.
- User group not pinging: verify the selected Slack user group still exists and reinstall the app if scopes changed.
- Welcome message not firing: confirm the bot is in the personal channel and `welcomer_enabled` is on.
- Owner sees the restricted view: verify `PERSONAL_CHANNEL_OWNER_ID` matches the Slack user who is opening App Home.
- AI errors: verify `HACKCLUB_AI_KEY` and `HACKCLUB_AI_MODEL`, and check the server logs for the request failure.
- Timezone issues: use a valid IANA timezone and save the setting again.
- Permissions or scope errors: reinstall the app after changing the manifest.

## Files Of Interest

- [manifest.json](manifest.json)
- [.env.example](.env.example)
- [deploy/asteria.service](deploy/asteria.service)
- [app.js](app.js)
