# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (uses Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Reset database
npm run db:reset

# Regenerate Prisma client after schema changes
npx prisma generate
```

## Architecture

This is an AI-powered React component generator with live preview. Users describe components in a chat interface, and Claude generates code that renders in real-time.

### Core Data Flow

1. **Chat API** (`src/app/api/chat/route.ts`): Streams responses from Claude using Vercel AI SDK. Provides two tools to the AI:
   - `str_replace_editor`: Create/edit files using string replacement
   - `file_manager`: Rename/delete files

2. **VirtualFileSystem** (`src/lib/file-system.ts`): In-memory file system that stores generated code. Never writes to disk. Supports serialization for persistence.

3. **JSX Transformer** (`src/lib/transform/jsx-transformer.ts`): Transforms JSX/TSX files using Babel in the browser. Creates blob URLs and an import map for the preview iframe.

4. **Preview Frame** (`src/components/preview/PreviewFrame.tsx`): Sandboxed iframe that renders the generated React components. Uses ES modules via import map with esm.sh for third-party packages.

### Context Providers

The app uses React Context for state management:
- `FileSystemProvider`: Manages the virtual file system state and handles tool calls from AI
- `ChatProvider`: Wraps Vercel AI SDK's `useChat` hook, syncs file system state with chat API

### Project Structure

- `/App.jsx` is the required entry point for generated components
- Files use `@/` import alias resolved to virtual filesystem root
- CSS files are collected and injected into preview iframe
- Third-party packages are loaded from esm.sh

### Database

SQLite via Prisma. The database schema is defined in `prisma/schema.prisma` - reference it anytime you need to understand the structure of data stored in the database.

### Code Style

- Use comments sparingly. Only comment complex code.

### Key Patterns

- The AI generates code incrementally via tool calls that modify the VirtualFileSystem
- Tool results trigger UI refresh through `refreshTrigger` counter in FileSystemContext
- Anonymous users can work without signing up; work is tracked in localStorage
- Mock provider returns static code when `ANTHROPIC_API_KEY` is not set
