# Epic Rust

> **The modern, high-performance Rust Dedicated Server Launcher & Management Suite.**  
> Built with Rust, Tauri v2, React, and Tailwind CSS.

---

## ⚡ Overview

**Epic Rust** is an all-in-one desktop launcher and management tool engineered for Rust dedicated server operators. It gives you full control over your server lifecycle, mod installations, wipe scheduling, admin roles, and live player interactions—all wrapped in a sleek, hardware-accelerated desktop interface.

---

## ✨ Features

- **🚀 Server Lifecycle Management**
  - One-click server initialization, start, stop, and clean shutdown.
  - Automatic SteamCMD dedicated server download, verification, and branch switching (Release / Staging).
  - Multi-profile management: Run and swap between multiple server configurations effortlessly.

- **🎮 Steamworks Integration**
  - Live Steam friends list with online status.
  - 1-Click invite buttons and "Invite All Online Friends" to your server.
  - Instant Steam chat opening and direct join link sharing.

- **🛠️ Mod & Plugin Ecosystem**
  - Native support for **Vanilla**, **Oxide (uMod)**, and **Carbon** frameworks.
  - Integrated uMod marketplace browser: search and install plugins directly inside the app.
  - Easy plugin enabling/disabling, updates, and configuration management.

- **⏰ Automated Scheduler & Wipe Manager**
  - Schedule automated restarts and server wipes (weekly, bi-weekly, monthly).
  - In-game countdown broadcasts warning players before restarts.
  - Automatic procedural seed rotation and save cleanup on wipe.

- **💾 Save States & Backups**
  - Instant backup creation and one-click save restoration.
  - Map file tracking with visual map details.

- **📡 Real-Time RCON Console & Telemetry**
  - Low-latency interactive RCON console with command history.
  - Live player counts, FPS counters, entity counts, memory usage, and network diagnostics.
  - Player kick, ban, and global broadcast tools.

- **🛡️ Server Rules & Admin Management**
  - Graphical toggles for Rust gameplay rules (radiation, events, upkeep, decay, NPC behavior).
  - Easy SteamID64 admin/owner management with synchronized `users.cfg`.

- **🎨 Modern Tactical UI**
  - Sleek frameless dark aesthetic inspired by Rust's post-apocalyptic identity.
  - Custom glowing ember emblem, smooth tab animations, and zero AI clutter.
  - System tray minimization and auto-start options.

---

## 📥 Download & Quick Start

1. Go to the [**Releases**](https://github.com/your-username/epic-rust-server-launcher/releases) page.
2. Download the latest `EpicRust.exe` (or `EpicRust-Windows-x64.zip`).
3. Place `EpicRust.exe` and `steam_api64.dll` in your preferred folder.
4. Launch `EpicRust.exe`. The launcher will guide you through creating your first server profile!

---

## 🛠️ Building from Source

### Prerequisites

- **Windows 10 / 11 (64-bit)**
- **Rust Toolchain**: [rustup.rs](https://rustup.rs/) (Stable channel)
- **Node.js**: v18 or v20+ ([nodejs.org](https://nodejs.org/))
- **C++ Build Tools**: Visual Studio C++ Build Tools or LLVM/MinGW

### Build Instructions

```bash
# 1. Clone the repository
git clone https://github.com/your-username/epic-rust-server-launcher.git
cd epic-rust-server-launcher

# 2. Install Node dependencies
npm install

# 3. Run in Development Mode
npm run tauri dev

# 4. Compile Production Release
npm run update-launcher
```

The compiled standalone executable will be generated at `./EpicRust.exe`.

---

## 🔄 Release & Auto-Update Pipeline

This project includes an automated GitHub Actions release pipeline (`.github/workflows/release.yml`):

1. **Tag a Release**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. **Automated Build**: GitHub Actions automatically compiles the optimized release binary, packages it into a ZIP archive, and publishes a new GitHub Release with release notes.
3. **Distribution**: Users can download the update directly from the Releases tab or update through the in-app auto-update system.

---

## 📂 Project Architecture

```
epic-rust-server-launcher/
├── frontend/             # React 18 + Vite + Tailwind CSS User Interface
│   ├── src/
│   │   ├── components/   # UI components (TopBar, RustLogo, Modals, etc.)
│   │   ├── pages/        # Main views (Dashboard, Server, Scheduler, Mods, Settings)
│   │   └── services/     # Tauri IPC bridge & API services
├── src/                  # Core Rust engine logic
│   ├── config.rs         # Server and launcher configuration models
│   ├── process.rs        # Dedicated server process supervisor
│   ├── steam.rs          # Steamworks API integration
│   ├── steamcmd.rs       # SteamCMD installer and validator
│   ├── scheduler.rs      # Restart & wipe automated scheduler
│   └── ...
├── src-tauri/            # Tauri v2 native desktop wrapper
│   ├── src/main.rs       # IPC command handlers & window lifecycle
│   ├── tauri.conf.json   # Tauri v2 configuration
│   └── icons/            # High-resolution multi-size app icons (.ico, .png)
├── .github/workflows/    # CI/CD automated release workflow
└── launcher_config.json  # Default server configuration template
```

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
