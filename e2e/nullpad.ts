import {
  type CDPSession,
  type Page,
  test as base,
  expect,
} from '@playwright/test'

export { expect }

export type Status = Readonly<{
  line: number
  column: number
  lineCount: number
}>

export type ScreenRow = Readonly<{
  lineId: string
  start: number
  number: string | null
  text: string
  top: number
  bottom: number
  left: number
  inkRight: number
}>

export type Cursor = Readonly<{
  row: number
  cell: number
  left: number
  top: number
  width: number
  char: string
  inside: boolean
}>

export type Screen = Readonly<{
  rows: ReadonlyArray<ScreenRow>
  cursor: Cursor | null
  status: Status
  cell: number
  rowHeight: number
  area: Readonly<{ left: number; right: number; top: number; bottom: number }>
}>

export const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>(resolve =>
        setTimeout(() =>
          requestAnimationFrame(() => setTimeout(() => resolve(), 0)),
        ),
      ),
  )

const statusIn = (position: string): Status => {
  const match = /^(\d+):(\d+) (\d+)L$/.exec(position)
  if (match === null) {
    throw new Error(`status position reads "${position}"`)
  }
  return {
    line: Number(match[1]),
    column: Number(match[2]),
    lineCount: Number(match[3]),
  }
}

const readScreen = async (page: Page): Promise<Screen> => {
  const { position, ...screen } = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.surface')
    const position = document.querySelector('.pos')
    if (surface === null || position === null) {
      throw new Error('nullpad is not on screen: no .surface or .pos')
    }
    const style = getComputedStyle(surface)
    const padding = getComputedStyle(surface.querySelector('.sheet') ?? surface)
    const context = document.createElement('canvas').getContext('2d')
    if (context === null) {
      throw new Error('no 2d canvas to measure a cell')
    }
    context.font = `${style.fontSize} ${style.fontFamily}`
    const cell = context.measureText('0').width
    const rowHeight = Number.parseFloat(style.lineHeight)
    const box = surface.getBoundingClientRect()
    const area = {
      left: box.left + Number.parseFloat(padding.paddingLeft),
      right: box.right - Number.parseFloat(padding.paddingRight),
      top: box.top + Number.parseFloat(padding.paddingTop),
      bottom: box.bottom - Number.parseFloat(padding.paddingBottom),
    }
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    })
    const range = document.createRange()
    type Drawn = {
      top: number
      left: number
      right: number
      text: string
      start: number
      ink: boolean
    }
    type Row = {
      lineId: string
      start: number
      number: string | null
      text: string
      top: number
      bottom: number
      left: number
      inkRight: number
      drawn: Array<Drawn>
    }
    const allRows: Array<Row> = []
    for (const line of surface.querySelectorAll<HTMLElement>('.line')) {
      const lineBox = line.getBoundingClientRect()
      const left =
        lineBox.left + Number.parseFloat(getComputedStyle(line).paddingLeft)
      const rowTop = (top: number) =>
        lineBox.top +
        Math.floor((top - lineBox.top + rowHeight / 2) / rowHeight) * rowHeight
      const drawn: Array<Drawn> = []
      let column = 0
      for (const node of line.childNodes) {
        if (node instanceof Text) {
          for (const { segment, index } of segmenter.segment(node.data)) {
            range.setStart(node, index)
            range.setEnd(node, index + segment.length)
            const rect = range.getClientRects()[0]
            if (rect !== undefined) {
              drawn.push({
                top: rowTop(rect.top),
                left: rect.left,
                right: rect.right,
                text: segment,
                start: column + index,
                ink: /\S/u.test(segment),
              })
            }
          }
          column += node.length
        } else if (node instanceof HTMLElement) {
          for (const rect of node.getClientRects()) {
            drawn.push({
              top: rowTop(rect.top),
              left: rect.left,
              right: rect.right,
              text: '',
              start: column,
              ink: false,
            })
          }
        }
      }
      const rows: Array<Row> = []
      for (const item of drawn) {
        const row = rows.find(
          candidate => Math.abs(candidate.top - item.top) < rowHeight / 2,
        )
        if (row === undefined) {
          rows.push({
            lineId: line.dataset['lineId'] ?? '',
            start: item.start,
            number: null,
            text: item.text,
            top: item.top,
            bottom: item.top + rowHeight,
            left,
            inkRight: item.ink ? item.right : left,
            drawn: [item],
          })
        } else {
          row.text += item.text
          row.drawn.push(item)
          if (item.ink) {
            row.inkRight = Math.max(row.inkRight, item.right)
          }
        }
      }
      if (rows.length === 0) {
        rows.push({
          lineId: line.dataset['lineId'] ?? '',
          start: 0,
          number: null,
          text: '',
          top: lineBox.top,
          bottom: lineBox.top + rowHeight,
          left,
          inkRight: left,
          drawn: [],
        })
      }
      rows.sort((a, b) => a.top - b.top)
      const [first] = rows
      if (first !== undefined) {
        first.number = line.dataset['n'] ?? null
      }
      allRows.push(...rows)
    }
    const visible = allRows.filter(
      row => row.top >= area.top - 0.5 && row.bottom <= area.bottom + 0.5,
    )
    const caret = document.getElementById('caret')
    const caretTop = caret?.getBoundingClientRect().top ?? 0
    const cursor =
      caret === null ||
      caret.style.display === 'none' ||
      !visible.some(row => Math.abs(row.top - caretTop) < rowHeight / 2)
        ? null
        : (() => {
            const rect = caret.getBoundingClientRect()
            const rowIndex = visible.findIndex(
              row => Math.abs(row.top - rect.top) < rowHeight / 2,
            )
            const row =
              visible[rowIndex] ??
              allRows.find(
                candidate => Math.abs(candidate.top - rect.top) < rowHeight / 2,
              )
            const under = row?.drawn.find(
              item => item.text !== '' && Math.abs(item.left - rect.left) < 1,
            )
            return {
              row: rowIndex,
              cell:
                Math.round((rect.left - (row?.left ?? area.left)) / cell) || 0,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              char: under?.text ?? ' ',
              inside:
                rect.top >= area.top - 0.5 &&
                rect.bottom <= box.bottom + 0.5 &&
                rect.left >= area.left - 0.5 &&
                rect.right <= area.right + 0.5,
            }
          })()
    return {
      rows: visible.map(({ drawn: _, ...row }) => row),
      cursor,
      position: position.textContent ?? '',
      cell,
      rowHeight,
      area,
    }
  })
  return { ...screen, status: statusIn(position) }
}

export const linesOf = (screen: Screen): ReadonlyArray<string> =>
  screen.rows.reduce<Array<string>>((lines, row, index) => {
    const previous = screen.rows[index - 1]
    if (previous !== undefined && previous.lineId === row.lineId) {
      lines[lines.length - 1] += row.text
    } else {
      lines.push(row.text)
    }
    return lines
  }, [])

export const textOf = (screen: Screen): string => linesOf(screen).join('\n')

export type Nullpad = ReturnType<typeof driver>

export const screenOf = async (page: Page): Promise<Screen> => {
  await settle(page)
  return readScreen(page)
}

export const statusOf = async (page: Page): Promise<Status> => {
  await settle(page)
  return statusIn(
    await page.evaluate(
      () => document.querySelector('.pos')?.textContent ?? '',
    ),
  )
}

export const openTab = async (page: Page): Promise<Nullpad> => {
  const tab = await page.context().newPage()
  await tab.goto('/')
  await tab.locator('#caret').waitFor()
  await tab.evaluate(() => document.fonts.ready.then(() => undefined))
  return driver(tab, await page.context().newCDPSession(tab))
}

export const openFresh = async (page: Page, path = '/'): Promise<void> => {
  const { origin } = new URL(page.url())
  await page.goto('about:blank')
  if (origin !== 'null') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'indexeddb,local_storage',
    })
    await cdp.detach()
  }
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const look = () => {
          const box = document.getElementById('caret')?.getBoundingClientRect()
          if (box !== undefined && box.width > 0 && box.height > 0) {
            resolve()
          } else {
            requestAnimationFrame(look)
          }
        }
        look()
      }),
  )
}

export type JumpLabel = Readonly<{
  label: string
  line: number
  column: number
  from: number
  to: number
  left: number
  top: number
  width: number
  height: number
}>

export type JumpMatch = Readonly<{ line: number; from: number; to: number }>

export type WhichKeyEntry = Readonly<{
  key: string
  text: string
  group: boolean
}>

export type WhichKey = Readonly<{
  pending: string
  entries: ReadonlyArray<WhichKeyEntry>
  more: string | null
  rect: Readonly<{ left: number; top: number; right: number; bottom: number }>
  caret: Readonly<{ left: number; top: number; right: number; bottom: number }>
  surfaceHeight: number
}>

export type FinderRow = Readonly<{
  text: string
  folder: string
  selected: boolean
}>

export type FinderScreen = Readonly<{
  mode: string
  query: string
  count: string
  header: string
  rows: ReadonlyArray<FinderRow>
  folders: ReadonlyArray<Readonly<{ name: string; on: boolean }>>
}>

const readFinder = (page: Page): Promise<FinderScreen | null> =>
  page.evaluate(() => {
    const finder = document.querySelector('.finder')
    if (finder === null) {
      return null
    }
    const text = (selector: string) =>
      finder.querySelector(selector)?.textContent ?? ''
    const query = [...(finder.querySelector('.query')?.childNodes ?? [])]
      .filter(
        node =>
          !(node instanceof HTMLElement) ||
          (!node.classList.contains('fcur') &&
            !node.classList.contains('placeholder')),
      )
      .map(node => node.textContent)
      .join('')
    return {
      mode: text('.prompt .bt'),
      query,
      count: text('.cnt'),
      header: text('.results .bt'),
      rows: [...finder.querySelectorAll('.rl .row')].map(row => ({
        text: row.querySelector('.t')?.textContent ?? '',
        folder: row.querySelector('.fd')?.textContent ?? '',
        selected: row.classList.contains('sel'),
      })),
      folders: [...finder.querySelectorAll('.folders button')].map(button => ({
        name: [...button.childNodes]
          .filter(node => node instanceof Text)
          .map(node => node.textContent)
          .join(''),
        on: button.classList.contains('on'),
      })),
    }
  })

export type ClipboardKind = 'read' | 'write'

/**
 * Headless Chromium keeps one clipboard for the whole browser, so a page of another context reads what this page wrote,
 * and about:blank has no clipboard, so the other page is an empty one of the app's own origin.
 */
const anotherApp = async (page: Page) => {
  const browser = page.context().browser()
  if (browser === null) {
    throw new Error('no browser to open another app in')
  }
  const context = await browser.newContext()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const other = await context.newPage()
  await other.route('**/*', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>another app</title>',
    }),
  )
  await other.goto(new URL(page.url()).origin)
  return {
    copied: () => other.evaluate(() => navigator.clipboard.readText()),
    copy: (text: string) =>
      other.evaluate(value => navigator.clipboard.writeText(value), text),
    close: () => context.close(),
  }
}

const isVimOff = async (page: Page): Promise<boolean> =>
  (await page.locator('.status .mode').innerText()) === 'EDIT'

const sendPaste = async (
  page: Page,
  cdp: CDPSession,
  text: string,
): Promise<void> => {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  const key = (await isVimOff(page))
    ? { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 }
    : { key: 'V', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 10 }
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    ...key,
    commands: ['paste'],
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

const reloadApp = async (page: Page): Promise<void> => {
  await page.reload()
  await page.locator('#caret').waitFor()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

export type Point = Readonly<{ x: number; y: number }>

export type Replacing = Readonly<{ start: number; end: number }>

export type Input =
  | Readonly<{ type: string }>
  | Readonly<{ press: string; times?: number }>
  | Readonly<{ paste: string }>
  | Readonly<{ compose: string; replacing?: Replacing }>
  | Readonly<{ commit: string }>
  | Readonly<{ click: Point }>
  | Readonly<{ wheel: number }>

type Key = Readonly<{
  key: string
  code: string
  keyCode: number
  text: string
  location: number
}>

const modifierBits = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const

type Modifier = keyof typeof modifierBits

const isModifier = (name: string): name is Modifier => name in modifierBits

const modifierKeys: Readonly<Record<Modifier, Key>> = {
  Alt: { key: 'Alt', code: 'AltLeft', keyCode: 18, text: '', location: 1 },
  Control: {
    key: 'Control',
    code: 'ControlLeft',
    keyCode: 17,
    text: '',
    location: 1,
  },
  Meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91, text: '', location: 1 },
  Shift: {
    key: 'Shift',
    code: 'ShiftLeft',
    keyCode: 16,
    text: '',
    location: 1,
  },
}

const namedKeys: ReadonlyMap<string, Key> = new Map(
  (
    [
      ['Backspace', 8],
      ['Tab', 9],
      ['Enter', 13],
      ['Escape', 27],
      ['PageUp', 33],
      ['PageDown', 34],
      ['End', 35],
      ['Home', 36],
      ['ArrowLeft', 37],
      ['ArrowUp', 38],
      ['ArrowRight', 39],
      ['ArrowDown', 40],
      ['Insert', 45],
      ['Delete', 46],
      ...Array.from(
        { length: 12 },
        (_, index) => [`F${index + 1}`, 112 + index] as const,
      ),
    ] as const
  ).map(([name, keyCode]) => [
    name,
    {
      key: name,
      code: name,
      keyCode,
      text: name === 'Enter' ? '\r' : '',
      location: 0,
    },
  ]),
)

const printableRows: ReadonlyArray<
  readonly [code: string, keyCode: number, plain: string, shifted: string]
> = [
  ['Backquote', 192, '`', '~'],
  ['Minus', 189, '-', '_'],
  ['Equal', 187, '=', '+'],
  ['BracketLeft', 219, '[', '{'],
  ['BracketRight', 221, ']', '}'],
  ['Backslash', 220, '\\', '|'],
  ['Semicolon', 186, ';', ':'],
  ['Quote', 222, "'", '"'],
  ['Comma', 188, ',', '<'],
  ['Period', 190, '.', '>'],
  ['Slash', 191, '/', '?'],
  ['Space', 32, ' ', ' '],
  ...[...'0123456789'].map(
    (digit, index) =>
      [
        `Digit${digit}`,
        digit.charCodeAt(0),
        digit,
        ')!@#$%^&*('.charAt(index),
      ] as const,
  ),
  ...[...'abcdefghijklmnopqrstuvwxyz'].map(
    letter =>
      [
        `Key${letter.toUpperCase()}`,
        letter.toUpperCase().charCodeAt(0),
        letter,
        letter.toUpperCase(),
      ] as const,
  ),
]

const printableKeys: ReadonlyArray<Readonly<{ plain: Key; shifted: Key }>> =
  printableRows.map(([code, keyCode, plain, shifted]) => ({
    plain: { key: plain, code, keyCode, text: plain, location: 0 },
    shifted: { key: shifted, code, keyCode, text: shifted, location: 0 },
  }))

const keyFor = (name: string, shift: boolean): Key => {
  if (isModifier(name)) {
    return modifierKeys[name]
  }
  const named = namedKeys.get(name)
  if (named !== undefined) {
    return named
  }
  const printable = printableKeys.find(
    ({ plain, shifted }) =>
      plain.key === name || shifted.key === name || plain.code === name,
  )
  if (printable === undefined) {
    throw new Error(`a burst has no key named ${JSON.stringify(name)}`)
  }
  return printable.shifted.key === name || shift
    ? printable.shifted
    : printable.plain
}

const typedKey = (char: string): Key | undefined =>
  char === '\n' || char === '\r'
    ? namedKeys.get('Enter')
    : printableKeys
        .flatMap(({ plain, shifted }) => [plain, shifted])
        .find(key => key.key === char)

type Sent =
  | Readonly<{
      kind: 'key'
      down: boolean
      key: Key
      modifiers: number
      commands: ReadonlyArray<string>
    }>
  | Readonly<{
      kind: 'mouse'
      type: 'mouseMoved' | 'mousePressed' | 'mouseReleased'
      at: Point
    }>
  | Readonly<{ kind: 'wheel'; at: Point; deltaY: number }>
  | Readonly<{ kind: 'compose'; text: string; replacing?: Replacing }>
  | Readonly<{ kind: 'text'; text: string }>

const chordTokens = (chord: string): ReadonlyArray<string> =>
  [...chord].reduce<Array<string>>(
    (tokens, char) => {
      const building = tokens.at(-1) ?? ''
      return char === '+' && building !== ''
        ? [...tokens, '']
        : [...tokens.slice(0, -1), building + char]
    },
    [''],
  )

const strokes = (
  chord: string,
  commands: ReadonlyArray<string> = [],
): ReadonlyArray<Sent> => {
  const tokens = chordTokens(chord)
  const held = tokens.slice(0, -1).filter(isModifier)
  const mask = (modifiers: ReadonlyArray<Modifier>) =>
    modifiers.reduce((bits, modifier) => bits | modifierBits[modifier], 0)
  const textCleared =
    held.length > 1 || (held.length === 1 && held[0] !== 'Shift')
  const keys = tokens.map(token => {
    const key = keyFor(token, held.includes('Shift'))
    return textCleared && !isModifier(token) ? { ...key, text: '' } : key
  })
  const downs = keys.map((key, index): Sent => ({
    kind: 'key',
    down: true,
    key,
    modifiers: mask(held.slice(0, index + 1)),
    commands: index === keys.length - 1 ? commands : [],
  }))
  const ups = keys.map((key, index): Sent => ({
    kind: 'key',
    down: false,
    key,
    modifiers: mask(held.slice(0, index)),
    commands: [],
  }))
  return [...downs, ...ups.reverse()]
}

const sentOf = (inputs: ReadonlyArray<Input>, pointer: Point) =>
  inputs.reduce<Readonly<{ pointer: Point; sent: ReadonlyArray<Sent> }>>(
    (sofar, input) => {
      const more = (sent: ReadonlyArray<Sent>, at = sofar.pointer) => ({
        pointer: at,
        sent: [...sofar.sent, ...sent],
      })
      if ('type' in input) {
        return more(
          [...input.type].flatMap((char): ReadonlyArray<Sent> => {
            const key = typedKey(char)
            return key === undefined
              ? [{ kind: 'text', text: char }]
              : [true, false].map(down => ({
                  kind: 'key',
                  down,
                  key,
                  modifiers: 0,
                  commands: [],
                }))
          }),
        )
      }
      if ('press' in input) {
        return more(
          Array.from({ length: input.times ?? 1 }, () =>
            strokes(input.press),
          ).flat(),
        )
      }
      if ('paste' in input) {
        return more(strokes('Control+Shift+V', ['paste']))
      }
      if ('compose' in input) {
        return more([
          input.replacing === undefined
            ? { kind: 'compose', text: input.compose }
            : {
                kind: 'compose',
                text: input.compose,
                replacing: input.replacing,
              },
        ])
      }
      if ('commit' in input) {
        return more([{ kind: 'text', text: input.commit }])
      }
      if ('click' in input) {
        return more(
          (['mouseMoved', 'mousePressed', 'mouseReleased'] as const).map(
            type => ({ kind: 'mouse', type, at: input.click }),
          ),
          input.click,
        )
      }
      return more([{ kind: 'wheel', at: sofar.pointer, deltaY: input.wheel }])
    },
    { pointer, sent: [] },
  ).sent

const send = (cdp: CDPSession, sent: Sent): Promise<unknown> => {
  switch (sent.kind) {
    case 'key':
      return cdp.send('Input.dispatchKeyEvent', {
        type: sent.down
          ? sent.key.text === ''
            ? 'rawKeyDown'
            : 'keyDown'
          : 'keyUp',
        modifiers: sent.modifiers,
        windowsVirtualKeyCode: sent.key.keyCode,
        code: sent.key.code,
        key: sent.key.key,
        location: sent.key.location,
        ...(sent.down
          ? {
              text: sent.key.text,
              unmodifiedText: sent.key.text,
              commands: [...sent.commands],
            }
          : {}),
      })
    case 'mouse':
      return cdp.send('Input.dispatchMouseEvent', {
        type: sent.type,
        x: sent.at.x,
        y: sent.at.y,
        button: sent.type === 'mouseMoved' ? 'none' : 'left',
        buttons: sent.type === 'mousePressed' ? 1 : 0,
        clickCount: sent.type === 'mouseMoved' ? 0 : 1,
      })
    case 'wheel':
      return cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: sent.at.x,
        y: sent.at.y,
        deltaX: 0,
        deltaY: sent.deltaY,
      })
    case 'compose':
      return cdp.send('Input.imeSetComposition', {
        text: sent.text,
        selectionStart: sent.text.length,
        selectionEnd: sent.text.length,
        ...(sent.replacing === undefined
          ? {}
          : {
              replacementStart: sent.replacing.start,
              replacementEnd: sent.replacing.end,
            }),
      })
    case 'text':
      return cdp.send('Input.insertText', { text: sent.text })
  }
}

type WindowEvent = 'keydown' | 'pointerdown' | 'wheel'

const windowEventOf = (sent: Sent): WindowEvent | null =>
  sent.kind === 'key' && sent.down
    ? 'keydown'
    : sent.kind === 'mouse' && sent.type === 'mousePressed'
      ? 'pointerdown'
      : sent.kind === 'wheel'
        ? 'wheel'
        : null

export type Frames = ReadonlyArray<ReadonlyArray<Input>>

type Landing = Readonly<{
  type: string
  frame: number
  timeStamp: number
  at: number
}>

type Hold = Readonly<{ from: number; until: number }>

type Watch = {
  landings: Array<Landing>
  holds: Array<Hold>
  frame: number
  counting: boolean
  cancelled: boolean
}

declare global {
  var nullpadBurst: Watch | undefined
}

const holdRequestUrl = 'http://burst.nullpad.invalid/hold'

const leastHoldMs = 50

const gate = () => {
  const opened = { open: () => {} }
  const done = new Promise<void>(resolve => {
    opened.open = resolve
  })
  return { open: () => opened.open(), done }
}

const within = <A>(promise: Promise<A>, why: string): Promise<A> =>
  Promise.race([
    promise,
    new Promise<never>((_, fail) =>
      setTimeout(() => fail(new Error(why)), 10_000),
    ),
  ])

const sum = (numbers: ReadonlyArray<number>) =>
  numbers.reduce((total, each) => total + each, 0)

const landingMisses = (
  sent: ReadonlyArray<ReadonlyArray<Sent>>,
  landings: ReadonlyArray<Landing>,
  holds: ReadonlyArray<Hold>,
): ReadonlyArray<string> => {
  const counts = sent.map(
    group =>
      group.filter(each => {
        const type = windowEventOf(each)
        return type === 'keydown' || type === 'pointerdown'
      }).length,
  )
  const discrete = landings.filter(landing => landing.type !== 'wheel')
  const wheels = landings.filter(landing => landing.type === 'wheel')
  const sentWheels = sent.flat().filter(each => each.kind === 'wheel').length
  const groups = counts.map((count, index) => {
    const start = sum(counts.slice(0, index))
    return discrete.slice(start, start + count)
  })
  const isHeldBy = (hold: Hold | undefined) => (landing: Landing) =>
    hold !== undefined &&
    landing.timeStamp >= hold.from &&
    landing.timeStamp < hold.until &&
    landing.at >= hold.until
  const frames = groups.map(group => {
    const frame = group[0]?.frame
    return frame === undefined || group.some(landing => landing.frame !== frame)
      ? null
      : frame
  })
  return [
    ...(discrete.length === sum(counts)
      ? []
      : [`${discrete.length} keys and clicks landed for ${sum(counts)} sent`]),
    ...(wheels.length === sentWheels
      ? []
      : [`${wheels.length} wheel turns landed for ${sentWheels} sent`]),
    ...groups.flatMap((group, index) =>
      group.every(isHeldBy(holds[index]))
        ? []
        : [
            `frame ${index + 1}: an input was not queued behind its held main thread`,
          ],
    ),
    ...wheels.flatMap(wheel =>
      holds.some(hold => isHeldBy(hold)(wheel))
        ? []
        : ['a wheel turn was not queued behind a held main thread'],
    ),
    ...frames.flatMap((frame, index) => {
      const earlier = frames
        .slice(0, index)
        .flatMap((each, at) => (each === null ? [] : [{ each, at }]))
        .at(-1)
      return (counts[index] ?? 0) > 0 && frame === null
        ? [`frame ${index + 1}: its keys and clicks landed in several frames`]
        : frame !== null &&
            earlier !== undefined &&
            frame - earlier.each !== index - earlier.at
          ? [
              `frame ${index + 1} landed ${frame - earlier.each} frames after frame ${earlier.at + 1}`,
            ]
          : []
    }),
  ]
}

function installWatch() {
  const watch: Watch = globalThis.nullpadBurst ?? {
    landings: [],
    holds: [],
    frame: 0,
    counting: false,
    cancelled: false,
  }
  if (globalThis.nullpadBurst === undefined) {
    for (const type of ['keydown', 'pointerdown', 'wheel']) {
      addEventListener(
        type,
        event =>
          watch.landings.push({
            type: event.type,
            frame: watch.frame,
            timeStamp: event.timeStamp,
            at: performance.now(),
          }),
        { capture: true, passive: true },
      )
    }
    globalThis.nullpadBurst = watch
  }
  watch.landings = []
  watch.holds = []
  watch.cancelled = false
  if (!watch.counting) {
    watch.counting = true
    const tick = () => {
      if (watch.counting) {
        watch.frame += 1
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }
}

function holdMainThreadInNextFrame({
  url,
  left,
}: Readonly<{ url: string; left: number }>) {
  const watch = globalThis.nullpadBurst
  if (watch === undefined || watch.cancelled) {
    return
  }
  const from = performance.now()
  if (left > 1) {
    // a timer set after a long task may run two frames later, an animation frame callback runs in the next
    requestAnimationFrame(() =>
      holdMainThreadInNextFrame({ url, left: left - 1 }),
    )
  }
  const request = new XMLHttpRequest()
  request.open('GET', url, false)
  try {
    request.send()
  } finally {
    watch.holds.push({ from, until: performance.now() })
  }
}

function stopWatching() {
  const watch = globalThis.nullpadBurst
  if (watch !== undefined) {
    watch.counting = false
  }
  return { landings: watch?.landings ?? [], holds: watch?.holds ?? [] }
}

function cancelHolds() {
  const watch = globalThis.nullpadBurst
  if (watch !== undefined) {
    watch.cancelled = true
  }
}

export const burst = async (
  page: Page,
  cdp: CDPSession,
  frames: Frames,
  stall = 0,
): Promise<void> => {
  const pastes = new Set(
    frames.flat().flatMap(input => ('paste' in input ? [input.paste] : [])),
  )
  if (pastes.size > 1) {
    throw new Error(
      'a burst reads the clipboard once, so all its pastes paste one text',
    )
  }
  for (const text of pastes) {
    await page.evaluate(value => navigator.clipboard.writeText(value), text)
  }
  const viewport = page.viewportSize() ?? { width: 1000, height: 600 }
  const centre = { x: viewport.width / 2, y: viewport.height / 2 }
  const sent = frames.map(inputs => sentOf(inputs, centre))
  const gates = frames.map(() => ({ held: gate(), released: gate() }))
  const reached = { holds: 0 }
  await page.route(holdRequestUrl, async route => {
    const reachedGate = gates[reached.holds]
    reached.holds += 1
    reachedGate?.held.open()
    await reachedGate?.released.done
    await route.fulfill({
      body: '',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.evaluate(installWatch)
  const holding = page.evaluate(holdMainThreadInNextFrame, {
    url: holdRequestUrl,
    left: frames.length,
  })
  try {
    const acks: Array<Promise<unknown>> = []
    for (const [index, { held, released }] of gates.entries()) {
      await within(
        held.done,
        `the page never held its main thread for frame ${index + 1}`,
      )
      acks.push(...(sent[index] ?? []).map(each => send(cdp, each)))
      await new Promise(resolve =>
        setTimeout(resolve, Math.max(stall, leastHoldMs)),
      )
      released.open()
    }
    await Promise.all(acks)
  } finally {
    for (const { released } of gates) {
      released.open()
    }
    await page.evaluate(cancelHolds)
    await page.unroute(holdRequestUrl)
    await holding.catch(() => undefined)
  }
  await settle(page)
  await settle(page)
  const { landings, holds } = await page.evaluate(stopWatching)
  const misses = landingMisses(sent, landings, holds)
  if (misses.length > 0) {
    throw new Error(
      `the burst did not land as sent: ${misses.join('; ')}\n${JSON.stringify({ holds, landings })}`,
    )
  }
}

export const driver = (page: Page, cdp: CDPSession) => {
  const screen = () => screenOf(page)
  return {
    page,
    cdp,
    screen,
    title: () => page.title(),
    file: async () => {
      await settle(page)
      return page.locator('.status .file').innerText()
    },
    finder: async () => {
      await settle(page)
      return readFinder(page)
    },
    reload: async () => {
      await reloadApp(page)
      await settle(page)
    },
    text: async () => textOf(await screen()),
    status: () => statusOf(page),
    cursor: async () => (await screen()).cursor,
    type: async (text: string) => {
      await page.keyboard.type(text)
      await settle(page)
    },
    press: async (key: string, times = 1) => {
      for (let i = 0; i < times; i++) {
        await page.keyboard.press(key)
      }
      await settle(page)
    },
    paste: async (text: string) => {
      await sendPaste(page, cdp, text)
      await settle(page)
    },
    compose: async (
      text: string,
      replacing?: Readonly<{ start: number; end: number }>,
    ) => {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
        ...(replacing === undefined
          ? {}
          : {
              replacementStart: replacing.start,
              replacementEnd: replacing.end,
            }),
      })
      await settle(page)
    },
    commit: async (text: string) => {
      await cdp.send('Input.insertText', { text })
      await settle(page)
    },
    resize: async (width: number, height: number) => {
      await page.setViewportSize({ width, height })
      await settle(page)
      await settle(page)
    },
    wheel: async (deltaY: number) => {
      const ended = page.evaluate(
        () =>
          new Promise<void>(resolve => {
            const surface = document.querySelector('.surface')
            const state = { scrolled: false, frames: 0 }
            surface?.addEventListener(
              'scroll',
              () => {
                state.scrolled = true
              },
              { once: true },
            )
            surface?.addEventListener('scrollend', () => resolve(), {
              once: true,
            })
            const tick = () => {
              state.frames += 1
              if (!state.scrolled && state.frames >= 10) {
                resolve()
              } else {
                requestAnimationFrame(tick)
              }
            }
            requestAnimationFrame(tick)
          }),
      )
      await page.mouse.wheel(0, deltaY)
      await ended
      await settle(page)
      await settle(page)
    },
    click: async (x: number, y: number) => {
      await page.mouse.click(x, y)
      await settle(page)
    },
    burst: (frames: Frames, options: { stall?: number } = {}) =>
      burst(page, cdp, frames, options.stall),
    inkIn: async (
      clip: Readonly<{ x: number; y: number; width: number; height: number }>,
    ) => {
      await settle(page)
      const png = await page.screenshot({
        clip,
        animations: 'disabled',
        caret: 'hide',
      })
      return page.evaluate(async base64 => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (context === null) {
          throw new Error('no 2d canvas to read the screenshot')
        }
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data
        const background = (
          getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []
        ).map(Number)
        let ink = 0
        for (let i = 0; i < pixels.length; i += 4) {
          const distance = Math.max(
            Math.abs((pixels[i] ?? 0) - (background[0] ?? 0)),
            Math.abs((pixels[i + 1] ?? 0) - (background[1] ?? 0)),
            Math.abs((pixels[i + 2] ?? 0) - (background[2] ?? 0)),
          )
          if (distance > 8) {
            ink++
          }
        }
        return ink
      }, png.toString('base64'))
    },
    preedit: () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-ghost]:not(#caret)')]
          .map(node => node.textContent)
          .join(''),
      ),
    selection: async (): Promise<string> => {
      await settle(page)
      return page.evaluate(() => {
        const isBlock =
          document.querySelector('#selection')?.getAttribute('data-kind') ===
          'block'
        const placed = [...document.querySelectorAll('#selection > *')]
          .map(element => ({
            rect: element.getBoundingClientRect(),
            isLineBreak: element.hasAttribute('data-break'),
          }))
          .filter(({ rect }) => rect.height > 0)
        const boxes = placed.filter(({ rect }) => rect.width > 0)
        const covers = (isLineBreak: boolean, x: number, y: number) =>
          boxes.some(
            box =>
              box.isLineBreak === isLineBreak &&
              x > box.rect.left - 0.5 &&
              x < box.rect.right + 0.5 &&
              y > box.rect.top &&
              y < box.rect.bottom,
          )
        const segmenter = new Intl.Segmenter(undefined, {
          granularity: 'grapheme',
        })
        const range = document.createRange()
        let selected = ''
        const blockLines: Array<string> = []
        for (const line of document.querySelectorAll('.surface .line')) {
          const lineBox = line.getBoundingClientRect()
          const touched = placed.filter(
            ({ rect }) =>
              rect.top + rect.height / 2 > lineBox.top &&
              rect.top + rect.height / 2 < lineBox.bottom,
          )
          if (touched.length === 0) {
            continue
          }
          const before = selected.length
          for (const node of line.childNodes) {
            if (!(node instanceof Text)) {
              continue
            }
            for (const { segment, index } of segmenter.segment(node.data)) {
              range.setStart(node, index)
              range.setEnd(node, index + segment.length)
              const [rect] = range.getClientRects()
              if (
                rect !== undefined &&
                covers(
                  false,
                  (rect.left + rect.right) / 2,
                  (rect.top + rect.bottom) / 2,
                )
              ) {
                selected += segment
              }
            }
          }
          blockLines.push(selected.slice(before))
          if (touched.some(box => box.isLineBreak)) {
            selected += '\n'
          }
        }
        return isBlock ? blockLines.join('\n') : selected
      })
    },
    whichKey: async (): Promise<WhichKey | null> => {
      await settle(page)
      return page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.which-key')
        if (panel === null) {
          return null
        }
        const box = (element: Element | null) => {
          const rect = element?.getBoundingClientRect()
          return {
            left: rect?.left ?? 0,
            top: rect?.top ?? 0,
            right: rect?.right ?? 0,
            bottom: rect?.bottom ?? 0,
          }
        }
        return {
          pending: panel.dataset['pending'] ?? '',
          entries: [...panel.querySelectorAll<HTMLElement>('[data-key]')].map(
            entry => ({
              key: entry.dataset['key'] ?? '',
              text: (entry.textContent ?? '').trim(),
              group: entry.hasAttribute('data-group'),
            }),
          ),
          more: panel.querySelector('.more')?.textContent?.trim() ?? null,
          rect: box(panel),
          caret: box(document.getElementById('caret')),
          surfaceHeight:
            document.querySelector('.surface')?.getBoundingClientRect()
              .height ?? 0,
        }
      })
    },
    jumpLabels: async (): Promise<ReadonlyArray<JumpLabel>> => {
      await settle(page)
      return page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#jump > [data-label]')].map(
          element => {
            const rect = element.getBoundingClientRect()
            return {
              label: element.textContent ?? '',
              line: Number(element.dataset['line']),
              column: Number(element.dataset['column']),
              from: Number(element.dataset['from']),
              to: Number(element.dataset['to']),
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }
          },
        ),
      )
    },
    jumpMatches: async (): Promise<ReadonlyArray<JumpMatch>> => {
      await settle(page)
      const value = await page.evaluate(
        () =>
          document
            .querySelector('.surface')
            ?.getAttribute('data-jump-matches') ?? '',
      )
      return value === ''
        ? []
        : value.split(';').map(item => {
            const [line, from, to] = item.split(',').map(Number)
            return { line: line ?? NaN, from: from ?? NaN, to: to ?? NaN }
          })
    },
    isJumping: async (): Promise<boolean> => {
      await settle(page)
      return (await page.locator('.surface.jumping').count()) > 0
    },
    notice: async () => {
      await settle(page)
      return page
        .locator('.status .notice')
        .evaluateAll(found =>
          found.map(element => element.textContent).join(''),
        )
    },
    allowClipboard: async (kinds: ReadonlyArray<ClipboardKind>) => {
      await page.context().clearPermissions()
      await page
        .context()
        .grantPermissions(kinds.map(kind => `clipboard-${kind}`))
    },
    holdClipboardReads: () =>
      page.evaluate(() => {
        const { clipboard } = navigator
        const read = clipboard.readText.bind(clipboard)
        const gate = { open: () => {} }
        const opened = new Promise<void>(resolve => {
          gate.open = resolve
        })
        clipboard.readText = () => opened.then(read)
        Reflect.set(globalThis, 'nullpadReleaseClipboard', () => {
          clipboard.readText = read
          gate.open()
        })
      }),
    releaseClipboardReads: async () => {
      await page.evaluate(() => {
        const release: unknown = Reflect.get(
          globalThis,
          'nullpadReleaseClipboard',
        )
        if (typeof release === 'function') {
          release()
        }
      })
      await settle(page)
    },
    outside: () => anotherApp(page),
  }
}

export const expectNumberedLinesIntact = (screen: Screen, label: string) => {
  const numbered = screen.rows.filter(row => row.number !== null)
  expect(numbered.length, `${label}: line numbers on screen`).toBeGreaterThan(0)
  expect(linesOf(screen), `${label}: each line reads as its number`).toEqual(
    numbered.map(row => `line ${row.number}`),
  )
}

export const expectRowsFit = (screen: Screen, label: string) =>
  expect(
    Math.max(...screen.rows.map(row => row.inkRight)),
    `${label}: widest row against the text area's right edge`,
  ).toBeLessThanOrEqual(screen.area.right + 0.5)

export const expectNumbersClearOfText = async (
  nullpad: Nullpad,
  label: string,
) => {
  const screen = await nullpad.screen()
  const textLeft = screen.rows[0]?.left ?? 0
  const top = screen.rows[0]?.top ?? 0
  const height = (screen.rows.at(-1)?.bottom ?? 0) - top
  const gap = {
    x: textLeft - 2 * screen.cell + 1,
    y: top,
    width: 2 * screen.cell - 2,
    height,
  }
  expect(
    await nullpad.inkIn(gap),
    `${label}: the blank cells left of the text stay blank`,
  ).toBe(0)
  const numbers = {
    x: screen.area.left,
    y: top,
    width: gap.x - screen.area.left,
    height,
  }
  expect(
    await nullpad.inkIn(numbers),
    `${label}: line numbers are drawn`,
  ).toBeGreaterThan(0)
}

export const numberedLines = (lines: number, suffix = ''): string =>
  Array.from({ length: lines }, (_, i) => `line ${i + 1}${suffix}`).join('\n')

/**
 * A div outside the app takes the textarea's wrap rules (pre-wrap, break-word), which wraps exactly as a textarea does.
 */
export const textareaRowStarts = (
  page: Page,
  lines: ReadonlyArray<string>,
  columns: number,
  cell: number,
): Promise<ReadonlyArray<ReadonlyArray<number>>> =>
  page.evaluate(
    ({ lines, columns, cell }) => {
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: 'grapheme',
      })
      const mirror = document.createElement('div')
      Object.assign(mirror.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        visibility: 'hidden',
        width: `${columns * cell + 0.5}px`,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        wordBreak: 'normal',
        tabSize: '8',
      })
      document.body.append(mirror)
      const range = document.createRange()
      const starts = lines.map(line => {
        mirror.textContent = line
        const node = mirror.firstChild
        const rowStarts = [0]
        if (node === null) {
          return rowStarts
        }
        let top: number | null = null
        for (const { segment, index } of segmenter.segment(line)) {
          range.setStart(node, index)
          range.setEnd(node, index + segment.length)
          const rect = range.getClientRects()[0]
          if (rect !== undefined) {
            if (top !== null && rect.top > top + cell && index > 0) {
              rowStarts.push(index)
            }
            top = rect.top
          }
        }
        return rowStarts
      })
      mirror.remove()
      return starts
    },
    { lines, columns, cell },
  )

export const rowStartsOf = (
  screen: Screen,
): ReadonlyArray<ReadonlyArray<number>> =>
  screen.rows.reduce<Array<Array<number>>>((lines, row, index) => {
    if (screen.rows[index - 1]?.lineId === row.lineId) {
      lines.at(-1)?.push(row.start)
    } else {
      lines.push([row.start])
    }
    return lines
  }, [])

export const test = base.extend<{
  nullpad: Nullpad
  pageErrors: Array<string>
}>({
  pageErrors: async ({ page }, use) => {
    const errors: Array<string> = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await use(errors)
  },
  nullpad: async ({ page, context, pageErrors }, use, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.locator('#caret').waitFor()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const cdp = await context.newCDPSession(page)
    await use(driver(page, cdp))
    if (pageErrors.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`page errors:\n${pageErrors.join('\n')}`)
    }
  },
})

export const startVimRow = async (
  nullpad: Nullpad,
  text: string,
  line: number,
  column: number,
): Promise<void> => {
  const { page, cdp } = nullpad
  const mode = page.locator('.status .mode')
  if ((await mode.innerText()) === 'EDIT') {
    await page.keyboard.press('Control+,')
  }
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(mode, 'vim is on before the row is pasted').toHaveText('NORMAL')
  for (const key of ['g', 'g', 'd', 'G']) {
    await page.keyboard.press(key)
  }
  await sendPaste(page, cdp, text)
  const lineCount = text.split('\n').length
  await expect
    .poll(
      async () =>
        lineCount <= 40
          ? await textOf(await screenOf(page))
          : (await statusOf(page)).lineCount,
      { message: 'the pasted note is in the editor before the reload' },
    )
    .toBe(lineCount <= 40 ? text : lineCount)
  await reloadApp(page)
  const keys = [
    'g',
    'g',
    ...(line > 1 ? [...String(line - 1), 'j'] : []),
    '0',
    ...(column > 1 ? [...String(column - 1), 'l'] : []),
  ]
  for (const key of keys) {
    await page.keyboard.press(key)
  }
  await expect
    .poll(
      async () => {
        const screen = lineCount <= 40 ? await screenOf(page) : null
        const status = screen === null ? await statusOf(page) : screen.status
        return {
          lineCount: status.lineCount,
          text: screen === null ? text : textOf(screen),
          mode: await mode.innerText(),
          line: status.line,
        }
      },
      { message: 'the row starts on its note, line count and line, in NORMAL' },
    )
    .toEqual({ lineCount, text, mode: 'NORMAL', line })
}
