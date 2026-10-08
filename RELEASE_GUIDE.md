# GitHub & Release Guide: Epic Rust

This guide explains:
1. How to push this repository to GitHub for the first time.
2. How to create releases so anyone can download and use the app on their desktop.
3. How to push updates to users who have **Auto-Update** enabled.

---

## 1. Initial Push to GitHub (Manual Setup)

Run these commands in your project terminal:

```bash
# 1. Stage all clean project files
git add .

# 2. Make your initial commit
git commit -m "feat: initial commit for Epic Rust Dedicated Server Launcher v1.0.0"

# 3. Create your repository on GitHub (via github.com or GitHub Desktop/CLI)
# 4. Link your remote repository (replace with your actual GitHub repo URL):
git remote add origin https://github.com/<YOUR_USERNAME>/epic-rust-server-launcher.git

# 5. Push to GitHub
git branch -M main
git push -u origin main
```

---

## 2. How to Publish a Release for Everyone to Download

There are **two ways** to create a release:

### Option A: Automated via GitHub Actions (Recommended)
We created a pre-configured release workflow in [`.github/workflows/release.yml`](.github/workflows/release.yml).

Whenever you want to release a new version:
1. Tag your commit with a version tag (e.g., `v1.0.0`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Actions will automatically:
   - Compile the Windows binary in a clean environment.
   - Package `EpicRust.exe` and `steam_api64.dll` into `EpicRust-Windows-x64.zip`.
   - Publish a new public release on your GitHub repository under the **Releases** tab.
3. Anyone can then go to your GitHub repository -> **Releases**, download `EpicRust.exe` or `EpicRust-Windows-x64.zip`, and run it immediately!

### Option B: Manual Release via GitHub Website
1. Build the production binary locally on your PC:
   ```bash
   npm run update-launcher
   ```
2. In your project folder, you will find `EpicRust.exe` and `steam_api64.dll`.
3. Create a ZIP file containing `EpicRust.exe` and `steam_api64.dll`.
4. Go to your GitHub repository on `github.com` -> click **Releases** (on the right sidebar) -> **Draft a new release**.
5. Set the tag version (e.g. `v1.0.0`) and title (e.g. `Epic Rust v1.0.0`).
6. Drag and drop your `EpicRust.exe` and ZIP archive into the release asset box.
7. Click **Publish release**.

---

## 3. How Auto-Update Works for Users

When users toggle **"Auto-update launcher & server"** ON in the app Settings:

### How Tauri Delivers Updates
1. The app periodically checks an update manifest file (`latest.json`) hosted on GitHub Releases:
   `https://github.com/<YOUR_USERNAME>/epic-rust-server-launcher/releases/latest/download/latest.json`
2. If `latest.json` specifies a version higher than the user's current version (e.g., `1.0.1` vs `1.0.0`), the app alerts the user or automatically downloads and swaps the executable in the background.

### Manifest Format (`latest.json`)
When releasing an update (e.g., version `1.0.1`), you can upload a `latest.json` file to the GitHub Release with the following structure:

```json
{
  "version": "1.0.1",
  "notes": "Added new features and bug fixes for Rust server operators.",
  "pub_date": "2026-10-07T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/<YOUR_USERNAME>/epic-rust-server-launcher/releases/download/v1.0.1/EpicRust.exe"
    }
  }
}
```

### Steps to Push an Update:
1. Update `"version"` in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) and [`package.json`](package.json) (e.g., `1.0.1`).
2. Commit your changes:
   ```bash
   git add .
   git commit -m "release: bump version to 1.0.1"
   ```
3. Create and push the new version tag:
   ```bash
   git tag v1.0.1
   git push origin main --tags
   ```
4. GitHub Actions builds the new release and publishes it.
5. All users running the app will see the new version and update automatically.
