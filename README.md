<p align="center">
  <img src="resources/icon.png" alt="Light Cloud" width="128" height="128">
</p>

<h1 align="center">Light Cloud</h1>

<p align="center">
  <strong>Deploy web applications in seconds with <code>@lightcloud</code> in GitHub Copilot Chat</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=lightcloud.lightcloud-copilot">
    <img src="https://img.shields.io/visual-studio-marketplace/v/lightcloud.lightcloud-copilot?style=flat-square&label=VS%20Code%20Marketplace" alt="VS Code Marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=lightcloud.lightcloud-copilot">
    <img src="https://img.shields.io/visual-studio-marketplace/i/lightcloud.lightcloud-copilot?style=flat-square" alt="Installs">
  </a>
  <a href="https://github.com/light-cloud-com/vsc-copilot/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  </a>
</p>

---

## Quick Start

1. **Install** this extension
2. **Open** GitHub Copilot Chat (`Cmd+Shift+I` / `Ctrl+Shift+I`)
3. **Type** `@lightcloud /deploy` and hit Enter

That's it! Your app will be live in seconds.

---

## Features

| Feature | Description |
|---------|-------------|
| **One-Command Deploy** | Deploy any project with just `@lightcloud /deploy` |
| **GitHub Integration** | Auto-detect your repo and deploy on push |
| **Local Upload** | Deploy projects without Git - just upload |
| **Auto Framework Detection** | React, Next.js, Vue, Angular, Python, Node.js, Go, and more |
| **Instant URLs** | Get your deployment URL and dashboard link directly in chat |
| **Environment Variables** | Automatically parse `.env` files |

---

## Commands

```
@lightcloud /deploy     Deploy current project
@lightcloud /redeploy   Redeploy current environment
@lightcloud /status     Check application health
@lightcloud /list       List all your applications
@lightcloud /plan       Preview deployment config
@lightcloud /destroy    Delete an application
@lightcloud /login      Sign in to Light Cloud
@lightcloud /logout     Sign out
```

---

## Supported Frameworks

### Frontend / Static Sites
React, Next.js, Vue.js, Angular, Svelte, Astro, SolidJS, HTML/CSS/JS

### Backend / Containers
Node.js, Python, Go, Java, Ruby, PHP, .NET, Rust, Custom Dockerfile

---

## Example

```
You: @lightcloud /deploy

Light Cloud: Analyzing project...
  Framework: React (Vite)
  Build: npm run build
  Output: dist/

Deployment Started!
  URL: https://my-app.light-cloud.io
  Dashboard: https://console.light-cloud.com/apps/my-app
```

---

## Requirements

- VS Code 1.93.0+
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) extension
- Light Cloud account ([sign up free](https://console.light-cloud.com/signup))

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `lightcloud.autoDetectFramework` | Auto-detect project framework | `true` |
| `lightcloud.showBuildLogs` | Show build logs in chat | `true` |
| `lightcloud.uploadMaxSizeMB` | Max upload size (MB) | `100` |

---

## Links

- [Light Cloud Console](https://console.light-cloud.com)
- [Documentation](https://light-cloud.com)
- [Report Issues](https://github.com/light-cloud-com/vsc-copilot/issues)

---

<p align="center">
  <sub>Made with care by <a href="https://light-cloud.com">Light Cloud</a></sub>
</p>
