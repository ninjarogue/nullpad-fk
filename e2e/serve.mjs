import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))
const dist = join(repo, 'dist')
const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
}

execFileSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' })

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost')
  const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`)
  try {
    if (!file.startsWith(`${dist}/`)) {
      throw new Error('outside dist')
    }
    const body = await readFile(file)
    response
      .writeHead(200, {
        'content-type':
          contentTypes[extname(file)] ?? 'application/octet-stream',
      })
      .end(body)
  } catch {
    response.writeHead(404).end()
  }
}).listen(Number(process.argv[2]), '127.0.0.1')
