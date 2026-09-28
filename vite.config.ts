import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

const environmentTextureDirectory = resolve('public/Textures/Environment');
const environmentTextureFiles = readdirSync(environmentTextureDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const environmentTextureByStem = new Map(
  environmentTextureFiles.map((name) => [name.slice(0, -extname(name).length).toLowerCase(), name]),
);
const terrainRockTextures = environmentTextureFiles
  .filter((name) => {
    if (!/\.(?:png|jpe?g|webp|avif)$/i.test(name)) return false;
    const stem = name.slice(0, -extname(name).length);
    return /^stone/i.test(stem) && !/_(?:alpha|normal)$/i.test(stem);
  })
  .map((name) => {
    const id = name.slice(0, -extname(name).length);
    const companionStem = id.replace(/_mixed$/i, '');
    const alphaName = environmentTextureByStem.get(`${companionStem}_alpha`.toLowerCase());
    const mixed = /_mixed$/i.test(id);
    return {
      id,
      label: id
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
        .join(' '),
      assetUrl: `/Textures/Environment/${encodeURIComponent(name)}`,
      ...(alphaName
        ? { alphaAssetUrl: `/Textures/Environment/${encodeURIComponent(alphaName)}` }
        : {}),
      format: mixed ? ('albedo-normal-horizontal' as const) : ('albedo' as const),
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

const settingsPath = resolve('settings.json');
const temporarySettingsPath = resolve('settings.json.tmp');

function settingsMiddleware(): Connect.NextHandleFunction {
  return async (request, response, next) => {
    if (request.url !== '/api/settings') return next();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'GET') {
      if (!existsSync(settingsPath)) return response.end('{}');
      try {
        return response.end(await readFile(settingsPath, 'utf8'));
      } catch {
        response.statusCode = 500;
        return response.end('{"error":"Unable to read settings.json"}');
      }
    }
    if (request.method !== 'PUT') {
      response.statusCode = 405;
      return response.end('{"error":"Method not allowed"}');
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', async () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const parsed: unknown = JSON.parse(body);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('Settings must be a JSON object.');
        await writeFile(temporarySettingsPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
        await rename(temporarySettingsPath, settingsPath);
        response.end('{"saved":true}');
      } catch {
        response.statusCode = 400;
        response.end('{"error":"Invalid settings JSON"}');
      }
    });
  };
}

function settingsFilePlugin(): Plugin {
  return {
    name: 'ballistics-settings-file',
    configureServer(server) {
      server.middlewares.use(settingsMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(settingsMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), settingsFilePlugin()],
  define: {
    __TERRAIN_ROCK_TEXTURE_ASSETS__: JSON.stringify(terrainRockTextures),
  },
  // The app is sometimes embedded by a local preview surface on another localhost origin.
  // Make development and production preview behavior explicit and consistent.
  server: {
    host: '127.0.0.1',
    strictPort: true,
    cors: true,
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    cors: true,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
