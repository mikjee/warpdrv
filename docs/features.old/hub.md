# Hub

Browse, search, and download GGUF models from HuggingFace.

## Overview

The Hub page connects to the HuggingFace API to browse and download GGUF models directly into your configured model directories. It provides a full model discovery and download experience without leaving WarpCore.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Search bar | Search across model names and authors on HuggingFace |
| Sort dropdown | Sort results by downloads, likes, recently updated, or recently created |
| Param filter | Min/max parameter count filter (in billions) |
| Model cards | Grid/list of models showing name, user, download count, likes, quant types |
| Model detail panel | Full model info: stats, tags, GGUF file list, rendered README |
| Download button | Download a selected GGUF file |
| Dir picker | Choose which model directory to save to (shown when multiple model roots are configured) |
| Download manager | Progress bars, speed, ETA, pause/resume/cancel controls |
| Checkmark badge | Green checkmark on already-downloaded files (checked across all model roots) |
| Status badge | Blue dot for active download, green dot for completed download |

## Search

### Fuzzy Search

Search the HuggingFace model catalog using fuzzy matching across model names and authors. Enter any part of a model name or author name to find relevant models.

### Sort Options

| Sort | Description |
|------|-------------|
| Downloads | Most downloaded first |
| Likes | Most liked first |
| Recently Updated | Most recently updated first |
| Recently Created | Most recently created first |

### Param Range Filter

Filter results by parameter count:
- **Min**: Show models with at least this many billions of parameters
- **Max**: Show models with at most this many billions of parameters

### Results Display

Each model card shows:
- Model name and author
- Download count and like count
- Quantization types available
- Tags (language, license, etc.)

## Model Details

### Info Panel

Clicking a model opens a detail panel showing:

| Section | Content |
|---------|---------|
| Stats | Download count, likes, last modified |
| Tags | Model tags (language, license, framework, etc.) |
| GGUF File List | All available GGUF files with quant type, size, and download status |
| README | Rendered markdown README from the repository |

### Download Status

- **Checkmark badge**: File is already downloaded (checked across all configured model roots)
- **No badge**: File is not downloaded
- **Blue dot**: Active download in progress
- **Green dot**: Download completed

### GGUF Files

Each GGUF file entry shows:
- Filename (including quant type)
- File size
- Already-downloaded status
- Download button (if not already downloaded)

## Downloads

### Starting a Download

1. Select a GGUF file from the model detail panel
2. Click "Download"
3. If multiple model directories are configured, a dir picker appears
4. Choose the destination directory and confirm

### Dir Picker

When multiple model directories are configured in Settings, the dir picker:
- Shows all configured directories with their paths
- Hints which directory already has files from the same repository
- Allows selecting the desired download destination

### Download Manager

| Control | Description |
|---------|-------------|
| Progress bar | Visual progress indicator with percentage |
| Speed | Current download speed (MB/s) |
| ETA | Estimated time remaining |
| Pause | Pause the download (resume later) |
| Resume | Resume a paused download |
| Cancel | Cancel and delete the download |
| Completed | Mark as completed (for manually downloaded files) |

### Active & Completed Downloads

- **Active count**: Number of downloads currently in progress (shown as badge on Hub nav item)
- **Completed count**: Number of completed downloads (shown as green badge)
- **Clear history**: Clear completed download history from the download manager

### Download Persistence

Downloads persist across app restarts. If WarpCore crashes or is closed mid-download, the download state is preserved and can be resumed on next launch.

## Key Settings

| Setting | Description |
|---------|-------------|
| Model directories | Download destinations — configured in Settings page |
| Active downloads | Managed in the Hub page download manager |

## Key Behaviors

- **Fuzzy search**: Matches across model name and author, not just exact name matches
- **Multi-root awareness**: When multiple model directories exist, the dir picker hints which root already has files from the same repo
- **Already-downloaded detection**: Files are checked across all model roots, not just the selected destination
- **Auto-created folders**: Download folders are created automatically in the `user/model` layout (HuggingFace convention)
- **Pause/resume**: Downloads support pause and resume — partial downloads are preserved
- **Checkmark persistence**: Download status persists across sessions, not just for the current session
- **README rendering**: Model READMEs are rendered as markdown in the detail panel using markdown-to-jsx + DOMPurify
- **Guard screen**: If no model directories are configured, the Hub shows a guard screen prompting the user to add directories in Settings
