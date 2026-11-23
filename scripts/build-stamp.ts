import { createHash } from 'node:crypto'
import {
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

export const stampPath = (dist: string): string => join(dist, 'build-stamp')

export const stampOf = (indexHtml: string | Uint8Array): string =>
  createHash('sha256').update(indexHtml).digest('hex').slice(0, 12)

export const readStamp = (dist: string): string | null => {
  try {
    return readFileSync(stampPath(dist), 'utf8')
  } catch {
    return null
  }
}

export const modified = (path: string): number =>
  statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0

export const newestSource = (repo: string): number =>
  [
    'index.html',
    'vite.config.ts',
    'src',
    ...readdirSync(join(repo, 'src'), {
      recursive: true,
      encoding: 'utf8',
    }).map(path => join('src', path)),
  ].reduce((newest, path) => Math.max(newest, modified(join(repo, path))), 0)

export const buildStamp = (): Plugin => ({
  name: 'nullpad:build-stamp',
  apply: 'build',
  writeBundle({ dir }, bundle) {
    const html = bundle['index.html']
    if (dir === undefined || html?.type !== 'asset') {
      this.error('no index.html to stamp the build with')
    }
    const unfinished = `${stampPath(dir)}.part`
    writeFileSync(unfinished, stampOf(html.source))
    renameSync(unfinished, stampPath(dir))
  },
})
