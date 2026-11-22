import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

const mark = 'NULLPAD_PLANT_RUN'

export const markThisRun = (): void => {
  process.env[mark] = `${process.pid}-${randomBytes(4).toString('hex')}`
}

const read = (path: string): string => {
  try {
    return readFileSync(path, 'latin1')
  } catch {
    return ''
  }
}

const processes = (): ReadonlyArray<
  Readonly<{ pid: number; parent: number; marks: ReadonlyArray<string> }>
> => {
  try {
    return readdirSync('/proc')
      .map(Number)
      .filter(pid => Number.isInteger(pid) && pid !== process.pid)
      .map(pid => {
        const stat = read(`/proc/${pid}/stat`)
        return {
          pid,
          parent: Number(
            stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1] ?? 0,
          ),
          marks: read(`/proc/${pid}/environ`).split('\0'),
        }
      })
  } catch {
    return []
  }
}

const startedBy = (token: string): ReadonlySet<number> => {
  const all = processes()
  const owned = new Set(
    all
      .filter(({ marks }) => marks.includes(`${mark}=${token}`))
      .map(({ pid }) => pid),
  )
  for (let size = 0; size < owned.size;) {
    size = owned.size
    for (const { pid, parent } of all) {
      if (owned.has(parent)) {
        owned.add(pid)
      }
    }
  }
  return owned
}

const signal = (pid: number, name: NodeJS.Signals): void => {
  try {
    process.kill(pid, name)
  } catch {}
}

export const reapThisRun = (): void => {
  const token = process.env[mark]
  if (token === undefined) {
    return
  }
  const stopped = new Set<number>()
  for (
    let found = [...startedBy(token)].filter(pid => !stopped.has(pid));
    found.length > 0;
    found = [...startedBy(token)].filter(pid => !stopped.has(pid))
  ) {
    for (const pid of found) {
      signal(pid, 'SIGSTOP')
      stopped.add(pid)
    }
  }
  for (const pid of stopped) {
    signal(pid, 'SIGKILL')
  }
}
