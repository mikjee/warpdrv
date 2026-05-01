# Attachments

Image and file attachments in chat — drag-and-drop, preview, and multi-modal message support.

## Overview

Attachments let you include images and files in your chat messages. Files are read, converted to base64, and sent with the completion request. The llama-server receives them as part of the message payload and handles multi-modal interpretation.

## Supported File Types

### Allowed MIME Types

| Category | Patterns |
|----------|----------|
| Images | `image/*` |
| PDFs | `application/pdf` |
| Text | `text/*` |
| JSON | `application/json` |
| Other | `application/*` |

### Blocked Extensions

Executables, archives, and system binaries are blocked:

`.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.py`, `.js`, `.pl`, `.rb`, `.com`, `.app`, `.msi`, `.dmg`, `.pkg`, `.deb`, `.rpm`, `.bin`, `.iso`, `.img`, `.vhd`, `.vhdx`, `.ova`, `.ovf`, `.tar`, `.gz`, `.zip`, `.rar`, `.7z`, `.bz2`, `.xz`, `.apk`, `.elf`, `.so`, `.dll`

### Code Files

Code files are allowed despite their extensions: `.js`, `.ts`, `.jsx`, `.tsx`, `.c`, `.cpp`, `.py`, `.rs`, `.go`, `.java`, `.md`, `.json`, `.yaml`, `.csv`, etc.

### Size Limit

**10 MB** per file. Files exceeding this limit are rejected.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Add Attachment button | "+" button in the composer that triggers native file picker |
| Attachment tiles | Thumbnail/preview tiles shown in the composer before sending |
| Image preview dialog | Full-size image view, opens on click, up to 80vh max |
| User message attachments | Tiles displayed at end of user messages (right-aligned) |
| Remove button | X icon on composer-only attachments to remove before sending |

## How It Works

1. **Attach files**: Click the "+" button in the chat composer or drag-and-drop files. Images and documents are shown as tiles in the composer.
2. **Preview images**: Click on any image attachment tile to open the full-size preview dialog.
3. **Send with message**: Attachments are sent automatically when you send the message. Each file is base64-encoded and included in the message payload.
4. **View sent attachments**: Sent images are displayed as thumbnails in the message. Non-image attachments show as file icon tiles.

## Settings

No additional settings required. Attachments are handled entirely client-side.

## Key Behaviors

- **Client-side only**: No server-side file processing. Files are base64-encoded and sent inline with the completion request
- **No file persistence**: Files are stored as base64 in message history, not saved to disk or object storage
- **Image preview**: Images get thumbnail tiles with full-size dialog preview. Non-image files show as generic file icon tiles
- **Dual validation**: Both MIME type and file extension are checked
- **Code files allowed**: Despite having extensions like `.js`, `.py`, etc. that appear in the blocked list, code files are explicitly whitelisted
- **PDF support**: PDFs can be extracted for text content via pdfjs-dist, but the raw file is also sent with the message
- **10MB limit**: Enforced at read time before any base64 encoding
