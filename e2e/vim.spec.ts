import {
  type Nullpad,
  expect,
  openFresh,
  openTab,
  settle,
  test,
} from './nullpad'

type Row = Readonly<{
  name: string
  text: string
  at: readonly [number, number]
  keys: string
  after: string
  line: number
  column: number
}>

const horizontalRows: ReadonlyArray<Row> = [
  {
    name: 'l three times',
    text: 'abcdef',
    at: [1, 1],
    keys: '3l',
    after: 'abcdef',
    line: 1,
    column: 4,
  },
  {
    name: 'l past the end stops on the last letter',
    text: 'abcd',
    at: [1, 1],
    keys: '9l',
    after: 'abcd',
    line: 1,
    column: 4,
  },
  {
    name: 'l at the last letter stays',
    text: 'abcd',
    at: [1, 4],
    keys: 'l',
    after: 'abcd',
    line: 1,
    column: 4,
  },
  {
    name: 'h past the start stops at column 1',
    text: 'abcdef',
    at: [1, 3],
    keys: '5h',
    after: 'abcdef',
    line: 1,
    column: 1,
  },
  {
    name: 'h at column 1 stays',
    text: 'abcd',
    at: [1, 1],
    keys: 'h',
    after: 'abcd',
    line: 1,
    column: 1,
  },
  {
    name: 'two digit count 10l',
    text: 'abcdefghijkl',
    at: [1, 1],
    keys: '10l',
    after: 'abcdefghijkl',
    line: 1,
    column: 11,
  },
  {
    name: 'l and h on an empty line stay at column 1',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'lh',
    after: 'a\n\nb',
    line: 2,
    column: 1,
  },
  {
    name: '0 goes to column 1 and $ to the last letter',
    text: '  foo bar',
    at: [1, 6],
    keys: '0$',
    after: '  foo bar',
    line: 1,
    column: 9,
  },
  {
    name: '^ goes to the first non-blank from both sides',
    text: '   foo bar',
    at: [1, 8],
    keys: '^$^',
    after: '   foo bar',
    line: 1,
    column: 4,
  },
  {
    name: '0 then ^ on an indented line',
    text: '   foo',
    at: [1, 5],
    keys: '0^',
    after: '   foo',
    line: 1,
    column: 4,
  },
  {
    name: '2$ goes to the end of the next line',
    text: 'abc\nabcdef\nxy',
    at: [1, 1],
    keys: '2$',
    after: 'abc\nabcdef\nxy',
    line: 2,
    column: 6,
  },
  {
    name: 'arrows and Home End move as l h 0 $',
    text: 'abcdef',
    at: [1, 2],
    keys: '<Right><Right><End><Left><Home><Right>',
    after: 'abcdef',
    line: 1,
    column: 2,
  },
  {
    name: 'l over accent and emoji letters',
    text: 'aé😀b',
    at: [1, 1],
    keys: '3l',
    after: 'aé😀b',
    line: 1,
    column: 4,
  },
  {
    name: 'l over a combining accent',
    text: 'aéb',
    at: [1, 1],
    keys: 'll',
    after: 'aéb',
    line: 1,
    column: 3,
  },
]

const wordsRows: ReadonlyArray<Row> = [
  {
    name: 'w across words and punctuation',
    text: 'foo.bar baz(qux)  end',
    at: [1, 1],
    keys: 'w',
    after: 'foo.bar baz(qux)  end',
    line: 1,
    column: 4,
  },
  {
    name: 'ww across punctuation',
    text: 'foo.bar baz(qux)  end',
    at: [1, 1],
    keys: 'ww',
    after: 'foo.bar baz(qux)  end',
    line: 1,
    column: 5,
  },
  {
    name: '5w across punctuation',
    text: 'foo.bar baz(qux)  end',
    at: [1, 1],
    keys: '5w',
    after: 'foo.bar baz(qux)  end',
    line: 1,
    column: 13,
  },
  {
    name: 'w onto the next line',
    text: 'foo bar\n  baz',
    at: [1, 5],
    keys: 'w',
    after: 'foo bar\n  baz',
    line: 2,
    column: 3,
  },
  {
    name: 'w onto an empty line',
    text: 'foo\n\nbar baz',
    at: [1, 1],
    keys: 'w',
    after: 'foo\n\nbar baz',
    line: 2,
    column: 1,
  },
  {
    name: '2w over an empty line',
    text: 'foo\n\nbar baz',
    at: [1, 1],
    keys: '2w',
    after: 'foo\n\nbar baz',
    line: 3,
    column: 1,
  },
  {
    name: 'w at the last word of the buffer goes to its last letter',
    text: 'foo bar',
    at: [1, 5],
    keys: 'w',
    after: 'foo bar',
    line: 1,
    column: 7,
  },
  {
    name: '99w stops at the last letter',
    text: 'foo bar\nbaz',
    at: [1, 1],
    keys: '99w',
    after: 'foo bar\nbaz',
    line: 2,
    column: 3,
  },
  {
    name: 'b back over punctuation',
    text: 'foo.bar baz(qux)  end',
    at: [1, 21],
    keys: 'b',
    after: 'foo.bar baz(qux)  end',
    line: 1,
    column: 19,
  },
  {
    name: '4b over punctuation',
    text: 'foo.bar baz(qux)  end',
    at: [1, 21],
    keys: '4b',
    after: 'foo.bar baz(qux)  end',
    line: 1,
    column: 12,
  },
  {
    name: 'b onto the previous line',
    text: 'foo bar\nbaz',
    at: [2, 1],
    keys: 'b',
    after: 'foo bar\nbaz',
    line: 1,
    column: 5,
  },
  {
    name: 'b over an empty line',
    text: 'foo\n\nbar',
    at: [3, 1],
    keys: 'bb',
    after: 'foo\n\nbar',
    line: 1,
    column: 1,
  },
  {
    name: 'b at the start of the buffer stays',
    text: 'foo bar',
    at: [1, 1],
    keys: 'b',
    after: 'foo bar',
    line: 1,
    column: 1,
  },
  {
    name: '9b stops at the start',
    text: 'foo bar\nbaz qux',
    at: [2, 5],
    keys: '9b',
    after: 'foo bar\nbaz qux',
    line: 1,
    column: 1,
  },
  {
    name: 'e to the end of the word',
    text: 'foo.bar baz',
    at: [1, 1],
    keys: 'e',
    after: 'foo.bar baz',
    line: 1,
    column: 3,
  },
  {
    name: 'ee over punctuation',
    text: 'foo.bar baz',
    at: [1, 1],
    keys: 'ee',
    after: 'foo.bar baz',
    line: 1,
    column: 4,
  },
  {
    name: '3e over punctuation',
    text: 'foo.bar baz',
    at: [1, 1],
    keys: '3e',
    after: 'foo.bar baz',
    line: 1,
    column: 7,
  },
  {
    name: 'e from the end of a word goes to the next word end',
    text: 'foo bar',
    at: [1, 3],
    keys: 'e',
    after: 'foo bar',
    line: 1,
    column: 7,
  },
  {
    name: 'e onto the next line',
    text: 'foo\n  bar',
    at: [1, 3],
    keys: 'e',
    after: 'foo\n  bar',
    line: 2,
    column: 5,
  },
  {
    name: 'e at the end of the buffer stays',
    text: 'foo bar',
    at: [1, 7],
    keys: 'e',
    after: 'foo bar',
    line: 1,
    column: 7,
  },
  {
    name: 'w b e over accents and emoji',
    text: 'café 😀 ab',
    at: [1, 1],
    keys: 'wewb',
    after: 'café 😀 ab',
    line: 1,
    column: 8,
  },
]

const verticalRows: ReadonlyArray<Row> = [
  {
    name: 'j and k keep the column across a short line',
    text: 'abcdef\nab\nabcdef',
    at: [1, 5],
    keys: 'jj',
    after: 'abcdef\nab\nabcdef',
    line: 3,
    column: 5,
  },
  {
    name: 'k comes back to the remembered column',
    text: 'abcdef\nab\nabcdef',
    at: [3, 5],
    keys: 'kk',
    after: 'abcdef\nab\nabcdef',
    line: 1,
    column: 5,
  },
  {
    name: 'j then l then j forgets the old column',
    text: 'abcdef\nabc\nabcdef',
    at: [1, 2],
    keys: 'jlj',
    after: 'abcdef\nabc\nabcdef',
    line: 3,
    column: 3,
  },
  {
    name: 'an empty line keeps the column',
    text: 'abcd\n\nabcd',
    at: [1, 4],
    keys: 'jj',
    after: 'abcd\n\nabcd',
    line: 3,
    column: 4,
  },
  {
    name: '$ then j stays at the end of each line',
    text: 'abc\nabcdef\nab',
    at: [1, 1],
    keys: '$jj',
    after: 'abc\nabcdef\nab',
    line: 3,
    column: 2,
  },
  {
    name: '$ then j then k',
    text: 'abc\nabcdef\nab',
    at: [1, 1],
    keys: '$jjk',
    after: 'abc\nabcdef\nab',
    line: 2,
    column: 6,
  },
  {
    name: 'End then Down stays at the end',
    text: 'abc\nabcdef\nab',
    at: [1, 1],
    keys: '<End><Down><Down>',
    after: 'abc\nabcdef\nab',
    line: 3,
    column: 2,
  },
  {
    name: '5j past the last line goes to the last line',
    text: 'a1\nb2\nc3\nd4',
    at: [1, 2],
    keys: '5j',
    after: 'a1\nb2\nc3\nd4',
    line: 4,
    column: 2,
  },
  {
    name: 'j on the last line stays',
    text: 'ab\ncd',
    at: [2, 2],
    keys: 'j',
    after: 'ab\ncd',
    line: 2,
    column: 2,
  },
  {
    name: 'k on the first line stays',
    text: 'ab\ncd',
    at: [1, 2],
    keys: 'k',
    after: 'ab\ncd',
    line: 1,
    column: 2,
  },
  {
    name: '5k past the first line goes to the first line',
    text: 'a1\nb2\nc3\nd4',
    at: [4, 2],
    keys: '5k',
    after: 'a1\nb2\nc3\nd4',
    line: 1,
    column: 2,
  },
  {
    name: '2j and 2k',
    text: 'a1\nb2\nc3\nd4',
    at: [1, 2],
    keys: '2j2k',
    after: 'a1\nb2\nc3\nd4',
    line: 1,
    column: 2,
  },
  {
    name: 'arrow Up and Down keep the column',
    text: 'abcdef\nab\nabcdef',
    at: [1, 5],
    keys: '<Down><Down><Up>',
    after: 'abcdef\nab\nabcdef',
    line: 2,
    column: 2,
  },
]

const linesRows: ReadonlyArray<Row> = [
  {
    name: 'gg goes to the first line',
    text: 'a\nb\nc\nd',
    at: [3, 1],
    keys: 'gg',
    after: 'a\nb\nc\nd',
    line: 1,
    column: 1,
  },
  {
    name: 'G goes to the last line',
    text: 'a\nb\nc\nd',
    at: [1, 1],
    keys: 'G',
    after: 'a\nb\nc\nd',
    line: 4,
    column: 1,
  },
  {
    name: '3G goes to line 3',
    text: 'a\nb\nc\nd',
    at: [1, 1],
    keys: '3G',
    after: 'a\nb\nc\nd',
    line: 3,
    column: 1,
  },
  {
    name: '2gg goes to line 2',
    text: 'a\nb\nc\nd',
    at: [4, 1],
    keys: '2gg',
    after: 'a\nb\nc\nd',
    line: 2,
    column: 1,
  },
  {
    name: '99G goes to the last line',
    text: 'a\nb\nc\nd',
    at: [1, 1],
    keys: '99G',
    after: 'a\nb\nc\nd',
    line: 4,
    column: 1,
  },
  {
    name: '99gg goes to the last line',
    text: 'a\nb\nc\nd',
    at: [1, 1],
    keys: '99gg',
    after: 'a\nb\nc\nd',
    line: 4,
    column: 1,
  },
  {
    name: 'G lands on the first non-blank of the last line',
    text: 'abc\n  def',
    at: [1, 3],
    keys: 'G',
    after: 'abc\n  def',
    line: 2,
    column: 3,
  },
  {
    name: 'gg lands on the first non-blank of the first line',
    text: '  abc\ndef',
    at: [2, 3],
    keys: 'gg',
    after: '  abc\ndef',
    line: 1,
    column: 3,
  },
  {
    name: 'gg and G across an empty line',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'GggG',
    after: 'a\n\nb',
    line: 3,
    column: 1,
  },
  {
    name: '2G onto an empty line',
    text: 'ab\n\ncd',
    at: [1, 2],
    keys: '2G',
    after: 'ab\n\ncd',
    line: 2,
    column: 1,
  },
]

const deleteRows: ReadonlyArray<Row> = [
  {
    name: 'x in the middle',
    text: 'abcde',
    at: [1, 2],
    keys: 'x',
    after: 'acde',
    line: 1,
    column: 2,
  },
  {
    name: '3x in the middle',
    text: 'abcdefg',
    at: [1, 2],
    keys: '3x',
    after: 'aefg',
    line: 1,
    column: 2,
  },
  {
    name: 'x on the last letter moves the cursor left',
    text: 'abc',
    at: [1, 3],
    keys: 'x',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: '3x at the end of the line stops at the line end',
    text: 'abcde',
    at: [1, 4],
    keys: '3x',
    after: 'abc',
    line: 1,
    column: 3,
  },
  {
    name: '9x deletes the rest of the line only',
    text: 'ab\ncd',
    at: [1, 1],
    keys: '9x',
    after: '\ncd',
    line: 1,
    column: 1,
  },
  {
    name: 'x on an empty line changes nothing',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'x',
    after: 'a\n\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'x on the only letter leaves an empty line',
    text: 'a\nb',
    at: [1, 1],
    keys: 'x',
    after: '\nb',
    line: 1,
    column: 1,
  },
  {
    name: 'x then x',
    text: 'abcd',
    at: [1, 2],
    keys: 'xx',
    after: 'ad',
    line: 1,
    column: 2,
  },
  {
    name: '0 then x',
    text: 'abcd',
    at: [1, 3],
    keys: '0x',
    after: 'bcd',
    line: 1,
    column: 1,
  },
  {
    name: '$ then x',
    text: 'abcd',
    at: [1, 1],
    keys: '$x',
    after: 'abc',
    line: 1,
    column: 3,
  },
  {
    name: 'x on an accented letter',
    text: 'aéb',
    at: [1, 2],
    keys: 'x',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: 'x on an emoji',
    text: 'a😀b',
    at: [1, 2],
    keys: 'x',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: '2x over an emoji and a letter at the end',
    text: 'a😀b',
    at: [1, 2],
    keys: '2x',
    after: 'a',
    line: 1,
    column: 1,
  },
  {
    name: 'x on a letter with a combining accent',
    text: 'aéb',
    at: [1, 2],
    keys: 'x',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: 'x leaves the line count and the next line alone',
    text: 'ab\ncd\nef',
    at: [2, 2],
    keys: 'xx',
    after: 'ab\n\nef',
    line: 2,
    column: 1,
  },
]

const insertRows: ReadonlyArray<Row> = [
  {
    name: 'i inserts before the cursor',
    text: 'abc',
    at: [1, 2],
    keys: 'iX<Esc>',
    after: 'aXbc',
    line: 1,
    column: 2,
  },
  {
    name: 'a inserts after the cursor',
    text: 'abc',
    at: [1, 2],
    keys: 'aX<Esc>',
    after: 'abXc',
    line: 1,
    column: 3,
  },
  {
    name: 'a on the last letter appends',
    text: 'abc',
    at: [1, 3],
    keys: 'aX<Esc>',
    after: 'abcX',
    line: 1,
    column: 4,
  },
  {
    name: 'A appends at the end of the line',
    text: 'abc\ndef',
    at: [1, 1],
    keys: 'AX<Esc>',
    after: 'abcX\ndef',
    line: 1,
    column: 4,
  },
  {
    name: 'I inserts at the first non-blank',
    text: '  abc',
    at: [1, 5],
    keys: 'IX<Esc>',
    after: '  Xabc',
    line: 1,
    column: 3,
  },
  {
    name: 'I on a line with no indent',
    text: 'abc',
    at: [1, 3],
    keys: 'IX<Esc>',
    after: 'Xabc',
    line: 1,
    column: 1,
  },
  {
    name: 'o opens a line below without indent',
    text: '  abc\ndef',
    at: [1, 3],
    keys: 'oX<Esc>',
    after: '  abc\nX\ndef',
    line: 2,
    column: 1,
  },
  {
    name: 'O opens a line above without indent',
    text: '  abc\ndef',
    at: [2, 1],
    keys: 'OX<Esc>',
    after: '  abc\nX\ndef',
    line: 2,
    column: 1,
  },
  {
    name: 'o on the last line',
    text: 'abc',
    at: [1, 2],
    keys: 'oX<Esc>',
    after: 'abc\nX',
    line: 2,
    column: 1,
  },
  {
    name: 'O on the first line',
    text: 'abc',
    at: [1, 2],
    keys: 'OX<Esc>',
    after: 'X\nabc',
    line: 1,
    column: 1,
  },
  {
    name: 'Esc right after i moves one letter left',
    text: 'abc',
    at: [1, 2],
    keys: 'i<Esc>',
    after: 'abc',
    line: 1,
    column: 1,
  },
  {
    name: 'Esc at column 1 stays',
    text: 'abc',
    at: [1, 1],
    keys: 'i<Esc>',
    after: 'abc',
    line: 1,
    column: 1,
  },
  {
    name: 'Esc after typing moves one letter left',
    text: 'abc',
    at: [1, 1],
    keys: 'iab<Esc>',
    after: 'ababc',
    line: 1,
    column: 2,
  },
  {
    name: 'i on an empty line',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'iX<Esc>',
    after: 'a\nX\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'A on an empty line',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'AX<Esc>',
    after: 'a\nX\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'o on an empty line',
    text: 'a\n\nb',
    at: [2, 1],
    keys: 'oX<Esc>',
    after: 'a\n\nX\nb',
    line: 3,
    column: 1,
  },
  {
    name: 'Esc after A over an emoji moves a whole letter',
    text: 'a😀',
    at: [1, 1],
    keys: 'A<Esc>',
    after: 'a😀',
    line: 1,
    column: 2,
  },
  {
    name: 'Esc after typing at the end of an accented line',
    text: 'abé',
    at: [1, 1],
    keys: 'A<Esc>',
    after: 'abé',
    line: 1,
    column: 3,
  },
  {
    name: 'Enter in Insert splits without indent',
    text: '  ab',
    at: [1, 3],
    keys: 'a<CR>X<Esc>',
    after: '  a\nXb',
    line: 2,
    column: 1,
  },
  {
    name: 'Backspace in Insert deletes what was just typed',
    text: 'abc',
    at: [1, 2],
    keys: 'iXY<BS>Z<Esc>',
    after: 'aXZbc',
    line: 1,
    column: 3,
  },
  {
    name: 'Insert then Normal motions then Insert',
    text: 'abc def',
    at: [1, 1],
    keys: 'AX<Esc>0wiY<Esc>',
    after: 'abc YdefX',
    line: 1,
    column: 5,
  },
  {
    name: 'o text then k then x',
    text: 'abc\ndef',
    at: [1, 1],
    keys: 'oXY<Esc>kx',
    after: 'ac\nXY\ndef',
    line: 1,
    column: 2,
  },
]

const miscRows: ReadonlyArray<Row> = [
  {
    name: 'Esc clears a pending count',
    text: 'abcde',
    at: [1, 1],
    keys: '3<Esc>x',
    after: 'bcde',
    line: 1,
    column: 1,
  },
  {
    name: 'Esc clears a pending g',
    text: 'a\nb\nc',
    at: [3, 1],
    keys: 'g<Esc>x',
    after: 'a\nb\n',
    line: 3,
    column: 1,
  },
  {
    name: 'a count then a move then x',
    text: 'abcdef',
    at: [1, 1],
    keys: '2lx',
    after: 'abdef',
    line: 1,
    column: 3,
  },
  {
    name: 'x then j then x',
    text: 'abc\ndef',
    at: [1, 2],
    keys: 'xjx',
    after: 'ac\ndf',
    line: 2,
    column: 2,
  },
  {
    name: 'w then x on punctuation',
    text: 'foo.bar',
    at: [1, 1],
    keys: 'wx',
    after: 'foobar',
    line: 1,
    column: 4,
  },
  {
    name: 'open line then move up and append',
    text: 'ab\ncd',
    at: [2, 1],
    keys: 'oX<Esc>kAY<Esc>',
    after: 'ab\ncdY\nX',
    line: 2,
    column: 3,
  },
]

const statedRows: ReadonlyArray<Row> = [
  {
    name: 'a count on i is accepted and does not repeat the text',
    text: 'abc',
    at: [1, 2],
    keys: '3iX<Esc>',
    after: 'aXbc',
    line: 1,
    column: 2,
  },
  {
    name: 'a count on o is accepted and opens one line',
    text: 'abc',
    at: [1, 1],
    keys: '2oX<Esc>',
    after: 'abc\nX',
    line: 2,
    column: 1,
  },
  {
    name: 'letters with no meaning type nothing and leave no pending key',
    text: 'abcd',
    at: [1, 2],
    keys: 'qKUQx',
    after: 'acd',
    line: 1,
    column: 2,
  },
]

const operatorsRows: ReadonlyArray<Row> = [
  {
    name: 'dw in the middle of a line',
    text: 'foo bar baz',
    at: [1, 5],
    keys: 'dw',
    after: 'foo baz',
    line: 1,
    column: 5,
  },
  {
    name: 'dw on the last word of a line stops at the line end',
    text: 'foo bar\nbaz',
    at: [1, 5],
    keys: 'dw',
    after: 'foo \nbaz',
    line: 1,
    column: 4,
  },
  {
    name: '2d3w deletes six words',
    text: 'a b c d e f g h',
    at: [1, 1],
    keys: '2d3w',
    after: 'g h',
    line: 1,
    column: 1,
  },
  {
    name: 'd2w across a line end',
    text: 'foo\nbar baz\nqux',
    at: [1, 1],
    keys: 'd2w',
    after: 'baz\nqux',
    line: 1,
    column: 1,
  },
  {
    name: 'cw keeps the space after the word',
    text: 'foo bar baz',
    at: [1, 5],
    keys: 'cwX<Esc>',
    after: 'foo X baz',
    line: 1,
    column: 5,
  },
  {
    name: 'cw on a last letter changes that one letter',
    text: 'foo bar',
    at: [1, 3],
    keys: 'cwX<Esc>',
    after: 'foX bar',
    line: 1,
    column: 3,
  },
  {
    name: 'cw on the last word of a line',
    text: 'foo bar\nbaz',
    at: [1, 5],
    keys: 'cwX<Esc>',
    after: 'foo X\nbaz',
    line: 1,
    column: 5,
  },
  {
    name: 'db leaves the letter under the cursor',
    text: 'foo bar baz',
    at: [1, 9],
    keys: 'db',
    after: 'foo baz',
    line: 1,
    column: 5,
  },
  {
    name: 'de takes the last letter',
    text: 'foo bar baz',
    at: [1, 1],
    keys: 'de',
    after: ' bar baz',
    line: 1,
    column: 1,
  },
  {
    name: 'd$ takes the last letter',
    text: 'foo bar baz',
    at: [1, 5],
    keys: 'd$',
    after: 'foo ',
    line: 1,
    column: 4,
  },
  {
    name: 'd0 leaves the letter under the cursor',
    text: 'foo bar baz',
    at: [1, 5],
    keys: 'd0',
    after: 'bar baz',
    line: 1,
    column: 1,
  },
  {
    name: 'd^ stops at the first non-blank',
    text: '  foo bar',
    at: [1, 7],
    keys: 'd^',
    after: '  bar',
    line: 1,
    column: 3,
  },
  {
    name: 'dh leaves the letter under the cursor',
    text: 'abcdef',
    at: [1, 4],
    keys: 'dh',
    after: 'abdef',
    line: 1,
    column: 3,
  },
  {
    name: 'dj takes two whole lines',
    text: 'a\nb\nc\nd',
    at: [2, 1],
    keys: 'dj',
    after: 'a\nd',
    line: 2,
    column: 1,
  },
  {
    name: 'dj on the last line does nothing',
    text: 'a\nb',
    at: [2, 1],
    keys: 'dj',
    after: 'a\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'dk takes two whole lines',
    text: 'a\nb\nc\nd',
    at: [3, 1],
    keys: 'dk',
    after: 'a\nd',
    line: 2,
    column: 1,
  },
  {
    name: 'dk on the first line does nothing',
    text: 'a\nb',
    at: [1, 1],
    keys: 'dk',
    after: 'a\nb',
    line: 1,
    column: 1,
  },
  {
    name: 'dG takes the rest of the lines',
    text: 'a\nb\nc\nd',
    at: [2, 1],
    keys: 'dG',
    after: 'a',
    line: 1,
    column: 1,
  },
  {
    name: 'dgg takes the lines up to the first',
    text: 'a\nb\nc\nd',
    at: [3, 1],
    keys: 'dgg',
    after: 'd',
    line: 1,
    column: 1,
  },
  {
    name: 'dd on the last line puts the cursor on the line above',
    text: 'ab\n  cd',
    at: [2, 3],
    keys: 'dd',
    after: 'ab',
    line: 1,
    column: 1,
  },
  {
    name: '3dd',
    text: 'a\nb\nc\nd\ne',
    at: [2, 1],
    keys: '3dd',
    after: 'a\ne',
    line: 2,
    column: 1,
  },
  {
    name: 'dd on the only line leaves one empty line',
    text: 'abc',
    at: [1, 2],
    keys: 'dd',
    after: '',
    line: 1,
    column: 1,
  },
  {
    name: 'deleting every line leaves one empty line',
    text: 'a\nb\nc',
    at: [2, 1],
    keys: 'dG<Up>dgg',
    after: '',
    line: 1,
    column: 1,
  },
  {
    name: 'arrows are motions after d',
    text: 'abcdef\nghijkl',
    at: [1, 3],
    keys: 'd<Right>',
    after: 'abdef\nghijkl',
    line: 1,
    column: 3,
  },
  {
    name: 'd End takes the last letter',
    text: 'abcdef',
    at: [1, 3],
    keys: 'd<End>',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: 'd Home',
    text: 'abcdef',
    at: [1, 4],
    keys: 'd<Home>',
    after: 'def',
    line: 1,
    column: 1,
  },
  {
    name: 'cc empties the line and copies no indent',
    text: '  abc\ndef',
    at: [1, 4],
    keys: 'ccX<Esc>',
    after: 'X\ndef',
    line: 1,
    column: 1,
  },
  {
    name: 'cj changes two lines into one',
    text: 'a\nb\nc',
    at: [1, 1],
    keys: 'cjX<Esc>',
    after: 'X\nc',
    line: 1,
    column: 1,
  },
  {
    name: 'yy leaves the text and the cursor',
    text: 'abc\ndef',
    at: [1, 2],
    keys: 'yy',
    after: 'abc\ndef',
    line: 1,
    column: 2,
  },
  {
    name: 'yw leaves the cursor',
    text: 'foo bar',
    at: [1, 2],
    keys: 'yw',
    after: 'foo bar',
    line: 1,
    column: 2,
  },
  {
    name: 'yb moves the cursor back',
    text: 'foo bar',
    at: [1, 6],
    keys: 'yb',
    after: 'foo bar',
    line: 1,
    column: 5,
  },
  {
    name: 'x deletes one letter',
    text: 'abcdef',
    at: [1, 3],
    keys: 'x',
    after: 'abdef',
    line: 1,
    column: 3,
  },
  {
    name: 'X deletes the letter before',
    text: 'abcdef',
    at: [1, 3],
    keys: 'X',
    after: 'acdef',
    line: 1,
    column: 2,
  },
  {
    name: 'X at column 1 does nothing',
    text: 'abc',
    at: [1, 1],
    keys: 'X',
    after: 'abc',
    line: 1,
    column: 1,
  },
  {
    name: 'D deletes to the line end',
    text: 'abc def',
    at: [1, 3],
    keys: 'D',
    after: 'ab',
    line: 1,
    column: 2,
  },
  {
    name: 'C changes to the line end',
    text: 'abc def',
    at: [1, 3],
    keys: 'CX<Esc>',
    after: 'abX',
    line: 1,
    column: 3,
  },
  {
    name: 's changes one letter',
    text: 'abc',
    at: [1, 2],
    keys: 'sX<Esc>',
    after: 'aXc',
    line: 1,
    column: 2,
  },
  {
    name: 'S changes the whole line',
    text: '  abc\ndef',
    at: [1, 4],
    keys: 'SX<Esc>',
    after: 'X\ndef',
    line: 1,
    column: 1,
  },
]

const putsRows: ReadonlyArray<Row> = [
  {
    name: 'p with an empty store does nothing',
    text: 'abc',
    at: [1, 2],
    keys: 'p',
    after: 'abc',
    line: 1,
    column: 2,
  },
  {
    name: 'ddp swaps two lines',
    text: 'a\nb\nc',
    at: [1, 1],
    keys: 'ddp',
    after: 'b\na\nc',
    line: 2,
    column: 1,
  },
  {
    name: 'dd on the last line then p',
    text: 'a\nb',
    at: [2, 1],
    keys: 'ddp',
    after: 'a\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'xp swaps two letters',
    text: 'abcd',
    at: [1, 2],
    keys: 'xp',
    after: 'acbd',
    line: 1,
    column: 3,
  },
  {
    name: 'yyp puts the line below, cursor on its first non-blank',
    text: '  a\nb',
    at: [1, 3],
    keys: 'yyp',
    after: '  a\n  a\nb',
    line: 2,
    column: 3,
  },
  {
    name: 'yyP puts the line above',
    text: 'a\n  b',
    at: [2, 3],
    keys: 'yyP',
    after: 'a\n  b\n  b',
    line: 2,
    column: 3,
  },
  {
    name: '3p repeats a line',
    text: 'a\nb',
    at: [1, 1],
    keys: 'yy3p',
    after: 'a\na\na\na\nb',
    line: 2,
    column: 1,
  },
  {
    name: '2yyp puts two lines',
    text: 'a\nb\nc',
    at: [1, 1],
    keys: '2yyp',
    after: 'a\na\nb\nb\nc',
    line: 2,
    column: 1,
  },
  {
    name: 'Y is yy',
    text: 'a\nb',
    at: [1, 1],
    keys: 'Yp',
    after: 'a\na\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'yw then p puts after the cursor, cursor on the last letter put',
    text: 'foo bar',
    at: [1, 1],
    keys: 'ywp',
    after: 'ffoo oo bar',
    line: 1,
    column: 5,
  },
  {
    name: 'yw then P puts before the cursor',
    text: 'foo bar',
    at: [1, 5],
    keys: 'ywP',
    after: 'foo barbar',
    line: 1,
    column: 7,
  },
  {
    name: '2p of letters repeats them',
    text: 'abcd',
    at: [1, 1],
    keys: 'yl2p',
    after: 'aaabcd',
    line: 1,
    column: 3,
  },
  {
    name: 'yb then P',
    text: 'foo bar',
    at: [1, 5],
    keys: 'ybP',
    after: 'foo foo bar',
    line: 1,
    column: 4,
  },
  {
    name: 'dj then p puts both lines below',
    text: 'a\nb\nc',
    at: [1, 1],
    keys: 'djp',
    after: 'c\na\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'dk then P',
    text: 'a\nb\nc',
    at: [3, 1],
    keys: 'dkP',
    after: 'b\nc\na',
    line: 1,
    column: 1,
  },
  {
    name: 'D then p',
    text: 'abc def',
    at: [1, 3],
    keys: 'Dp',
    after: 'abc def',
    line: 1,
    column: 7,
  },
  {
    name: 'dd then deleting letters then p puts the last delete',
    text: 'a\nbcd',
    at: [1, 1],
    keys: 'ddxp',
    after: 'cbd',
    line: 1,
    column: 2,
  },
  {
    name: 'a yank after a delete replaces the store',
    text: 'abc def',
    at: [1, 1],
    keys: 'xwywP',
    after: 'bc defdef',
    line: 1,
    column: 6,
  },
  {
    name: 'cw fills the store with the old word',
    text: 'foo bar',
    at: [1, 1],
    keys: 'cwX<Esc>wp',
    after: 'X bfooar',
    line: 1,
    column: 6,
  },
  {
    name: 'S fills the store with the line',
    text: 'a\nb',
    at: [2, 1],
    keys: 'SX<Esc>P',
    after: 'a\nb\nX',
    line: 2,
    column: 1,
  },
  {
    name: 's fills the store with the letter',
    text: 'abc',
    at: [1, 2],
    keys: 'sX<Esc>p',
    after: 'aXbc',
    line: 1,
    column: 3,
  },
  {
    name: 'C fills the store with the rest',
    text: 'abc def',
    at: [1, 3],
    keys: 'CX<Esc>p',
    after: 'abXc def',
    line: 1,
    column: 8,
  },
  {
    name: 'p of lines after deleting every line',
    text: 'a\nb',
    at: [1, 1],
    keys: 'ddddp',
    after: '\nb',
    line: 2,
    column: 1,
  },
]

const objectsRows: ReadonlyArray<Row> = [
  {
    name: 'diw',
    text: 'foo bar baz',
    at: [1, 6],
    keys: 'diw',
    after: 'foo  baz',
    line: 1,
    column: 5,
  },
  {
    name: 'daw takes the space after',
    text: 'foo bar baz',
    at: [1, 5],
    keys: 'daw',
    after: 'foo baz',
    line: 1,
    column: 5,
  },
  {
    name: 'diW takes punctuation inside',
    text: 'a foo.bar-x b',
    at: [1, 6],
    keys: 'diW',
    after: 'a  b',
    line: 1,
    column: 3,
  },
  {
    name: 'yiw then P',
    text: 'foo bar baz',
    at: [1, 6],
    keys: 'yiwP',
    after: 'foo barbar baz',
    line: 1,
    column: 7,
  },
  {
    name: 'dip takes a paragraph',
    text: 'a\nb\n\nc\nd',
    at: [1, 1],
    keys: 'dip',
    after: '\nc\nd',
    line: 1,
    column: 1,
  },
  {
    name: 'dap takes the blank lines after',
    text: 'a\nb\n\nc\nd',
    at: [2, 1],
    keys: 'dap',
    after: 'c\nd',
    line: 1,
    column: 1,
  },
  {
    name: 'dap on the last paragraph takes the blank lines before',
    text: 'a\nb\n\nc\nd',
    at: [4, 1],
    keys: 'dap',
    after: 'a\nb',
    line: 2,
    column: 1,
  },
  {
    name: 'yap then p',
    text: 'a\nb\n\nc',
    at: [1, 1],
    keys: 'yapGp',
    after: 'a\nb\n\nc\na\nb\n',
    line: 5,
    column: 1,
  },
  {
    name: 'di" inside quotes',
    text: 'say "hello there" now',
    at: [1, 8],
    keys: 'di"',
    after: 'say "" now',
    line: 1,
    column: 6,
  },
  {
    name: 'da" takes the space after',
    text: 'say "hello there" now',
    at: [1, 8],
    keys: 'da"',
    after: 'say now',
    line: 1,
    column: 5,
  },
  {
    name: 'di" with the cursor before the quotes',
    text: 'say "hello" now',
    at: [1, 1],
    keys: 'di"',
    after: 'say "" now',
    line: 1,
    column: 6,
  },
  {
    name: "di' and da'",
    text: "it 'is' ok 'yes' fine",
    at: [1, 15],
    keys: "da'",
    after: "it 'is' ok fine",
    line: 1,
    column: 12,
  },
  {
    name: 'di(',
    text: 'f(a, b) c',
    at: [1, 4],
    keys: 'di(',
    after: 'f() c',
    line: 1,
    column: 3,
  },
  {
    name: 'di( inside nested brackets takes the inner pair',
    text: 'f(a (b) c)',
    at: [1, 6],
    keys: 'di(',
    after: 'f(a () c)',
    line: 1,
    column: 6,
  },
  {
    name: 'da( of nested brackets from the outer part',
    text: 'f(a (b) c)',
    at: [1, 4],
    keys: 'da(',
    after: 'f',
    line: 1,
    column: 1,
  },
  {
    name: 'ci(',
    text: 'f(a, b) c',
    at: [1, 4],
    keys: 'ci(X<Esc>',
    after: 'f(X) c',
    line: 1,
    column: 3,
  },
  {
    name: 'yi( then P',
    text: 'f(a, b) c',
    at: [1, 4],
    keys: 'yi(P',
    after: 'f(a, ba, b) c',
    line: 1,
    column: 6,
  },
  {
    name: 'di{ and da{',
    text: 'x{1, 2} y',
    at: [1, 4],
    keys: 'di{',
    after: 'x{} y',
    line: 1,
    column: 3,
  },
  {
    name: 'di{ over lines takes the inner lines',
    text: 'if {\n  a\n  b\n}',
    at: [2, 3],
    keys: 'di{',
    after: 'if {\n}',
    line: 2,
    column: 1,
  },
  {
    name: 'da{ over lines',
    text: 'if {\n  a\n}\nz',
    at: [2, 3],
    keys: 'da{',
    after: 'if \nz',
    line: 1,
    column: 3,
  },
  {
    name: 'i) ib a) ab spell the round pair',
    text: '(a) (b) (c) (d)',
    at: [1, 14],
    keys: 'di)09ldib05lda)01ldab',
    after: '  () ()',
    line: 1,
    column: 1,
  },
  {
    name: 'i[ a[ i] a] spell the square pair',
    text: '[a] [b] [c] [d]',
    at: [1, 14],
    keys: 'di[09lda[05ldi]01lda]',
    after: ' []  []',
    line: 1,
    column: 1,
  },
  {
    name: 'i{ a{ i} a} iB aB spell the curly pair',
    text: '{a} {b} {c} {d} {e} {f}',
    at: [1, 22],
    keys: 'di{017lda{013ldi}09lda}05ldaB01ldiB',
    after: '{}   {}  {}',
    line: 1,
    column: 2,
  },
  {
    name: 'di( with no bracket does nothing',
    text: 'abc def',
    at: [1, 2],
    keys: 'di(',
    after: 'abc def',
    line: 1,
    column: 2,
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
}

const toggle = 'Control+,'

const modeOf = (nullpad: Nullpad) =>
  nullpad.page.locator('.status .mode').innerText()

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  await openFresh(nullpad.page)
  await nullpad.paste(row.text)
  await nullpad.press('Control+Home')
  await nullpad.press('ArrowDown', row.at[0] - 1)
  await nullpad.press('Home')
  await nullpad.press('ArrowRight', row.at[1] - 1)
  await nullpad.page.keyboard.press(toggle)
  for (const token of row.keys.match(/<[A-Za-z]+>|./gu) ?? []) {
    await nullpad.page.keyboard.press(keyNames[token] ?? token)
  }
  await settle(nullpad.page)
  expect.soft(await nullpad.text(), `${row.name}: text`).toBe(row.after)
  expect
    .soft(await nullpad.status(), `${row.name}: line and column`)
    .toMatchObject({ line: row.line, column: row.column })
  expect.soft(await modeOf(nullpad), `${row.name}: mode`).toBe('NORMAL')
}

const tables: ReadonlyArray<readonly [string, ReadonlyArray<Row>]> = [
  ['h l 0 ^ $ and the arrow keys move as in Vim', horizontalRows],
  ['w b e move over words, punctuation, lines and edges as in Vim', wordsRows],
  ['j k keep the column, $ sticks, and counts clamp as in Vim', verticalRows],
  ['gg G and counts before them go to the line Vim goes to', linesRows],
  [
    'x and 3x take whole letters and stop at the line end as in Vim',
    deleteRows,
  ],
  [
    'i a I A o O land in Insert and Esc steps one letter left as in Vim',
    insertRows,
  ],
  [
    'Esc, counts on insert keys and keys with no meaning',
    [...miscRows, ...statedRows],
  ],
  [
    'd c y with motions and counts, and x X D C s S, act as in Vim',
    operatorsRows,
  ],
  ['p P and the store that d c y fill act as in Vim', putsRows],
  ['text objects with d c y act as in Vim', objectsRows],
]

for (const [name, rows] of tables) {
  test(`vim Normal keys: ${name}`, async ({ nullpad }) => {
    for (const row of rows) {
      await playRow(nullpad, row)
    }
  })
}

test('a toggle typed between fast keys acts in order with the keys around it', async ({
  nullpad,
}) => {
  const { keyboard } = nullpad.page
  await keyboard.type('abc')
  for (const key of [
    'ArrowLeft',
    'ArrowLeft',
    toggle,
    'x',
    toggle,
    'Z',
    toggle,
    'x',
    toggle,
    'q',
  ]) {
    await keyboard.press(key)
  }
  await settle(nullpad.page)
  expect(
    await nullpad.text(),
    'x ran in Normal, Z and q typed with vim off',
  ).toBe('aqZ')
  expect(await nullpad.status()).toMatchObject({ line: 1, column: 3 })
  expect(await modeOf(nullpad), 'the last toggle left vim off').toBe('EDIT')
})

test('vim is off on a fresh profile, survives a plain reload, and types letters itself when off', async ({
  nullpad,
}) => {
  const button = nullpad.page.locator('.status .toggle-vim')
  expect(await modeOf(nullpad), 'fresh profile').toBe('EDIT')
  await expect(button, 'button on a fresh profile').toHaveText('vim off')
  await nullpad.type('xji')
  expect(await nullpad.text(), 'x j i type themselves with vim off').toBe('xji')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'Ctrl+, turns vim on into Normal').toBe(
    'NORMAL',
  )
  await expect(button, 'button with vim on').toHaveText('vim on')
  await nullpad.reload()
  expect(await modeOf(nullpad), 'a plain reload keeps vim on').toBe('NORMAL')
  await expect(button, 'button after reload').toHaveText('vim on')
  await nullpad.press('Control+,')
  expect(await modeOf(nullpad), 'toggled off again').toBe('EDIT')
  await nullpad.reload()
  expect(await modeOf(nullpad), 'a plain reload keeps vim off').toBe('EDIT')
  await nullpad.press('Control+,')
  await openFresh(nullpad.page)
  expect(await modeOf(nullpad), 'a fresh profile starts with vim off').toBe(
    'EDIT',
  )
  await expect(button).toHaveText('vim off')
  await nullpad.type('xji')
  expect(await nullpad.text(), 'letters type themselves again').toBe('xji')
})

test('the status line names the mode, the caret is a block in Normal and a bar in Insert, pending keys show', async ({
  nullpad,
}) => {
  await nullpad.paste('one\ntwo\nthree')
  await nullpad.press('Control+Home')
  const cell = (await nullpad.screen()).cell
  const off = await nullpad.cursor()
  expect(await modeOf(nullpad), 'vim off').toBe('EDIT')
  expect(off?.width, 'a block caret with vim off').toBeGreaterThan(cell * 0.7)
  expect(off?.width).toBeLessThan(cell * 1.4)
  await nullpad.press(toggle)
  expect(await modeOf(nullpad), 'vim on').toBe('NORMAL')
  const block = await nullpad.cursor()
  expect(block?.char, 'Normal caret sits on a letter').toBe('o')
  expect(block?.width, 'Normal caret is about one letter wide').toBeGreaterThan(
    cell * 0.7,
  )
  expect(block?.width).toBeLessThan(cell * 1.4)
  await nullpad.press('i')
  expect(await modeOf(nullpad), 'i').toBe('INSERT')
  const bar = await nullpad.cursor()
  expect(bar?.width, 'Insert caret is a thin bar').toBeGreaterThan(1)
  expect(bar?.width).toBeLessThan(3.5)
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'Esc').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'nothing pending').toBe('')
  await nullpad.press('2')
  expect(await pendingOf(nullpad), 'a count shows').toBe('2')
  await nullpad.press('g')
  expect(await pendingOf(nullpad), 'a count and g show').toBe('2g')
  await nullpad.press('g')
  expect(await pendingOf(nullpad), 'a finished command clears them').toBe('')
  expect(await nullpad.status(), '2gg went to line 2').toMatchObject({
    line: 2,
    column: 1,
  })
  await nullpad.press('4')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc clears a count').toBe('')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'read view').toBe('READ')
  await nullpad.press('Control+e')
  expect(await modeOf(nullpad), 'back to the mode left').toBe('NORMAL')
})

test('Ctrl+P and Ctrl+E drop pending keys', async ({ nullpad }) => {
  await nullpad.paste('a\nb\nc\nd')
  await nullpad.press(toggle)
  await nullpad.press('G')
  expect(await nullpad.status(), 'G').toMatchObject({ line: 4 })
  await nullpad.press('g')
  await nullpad.press('Control+p')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'finder closed, Normal again').toBe('NORMAL')
  expect(await pendingOf(nullpad), 'finder dropped the g').toBe('')
  await nullpad.press('g')
  expect(
    await nullpad.status(),
    'a lone g after the finder goes nowhere',
  ).toMatchObject({ line: 4 })
  await nullpad.press('Escape')
  await nullpad.press('g')
  await nullpad.press('Control+e')
  await nullpad.press('Control+e')
  expect(await pendingOf(nullpad), 'read view dropped the g').toBe('')
  await nullpad.press('g')
  expect(
    await nullpad.status(),
    'a lone g after the read view goes nowhere',
  ).toMatchObject({ line: 4 })
  await nullpad.press('g')
  expect(await nullpad.status(), 'gg still works').toMatchObject({ line: 1 })
})

test('an IME in Normal changes nothing, and a conversion in Insert after Normal keys replaces only its letters', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('one two three')
  await nullpad.press('Escape')
  await nullpad.compose('にほん')
  await nullpad.commit('日本')
  expect(await nullpad.text(), 'IME text in Normal is thrown away').toBe(
    'one two three',
  )
  expect(await modeOf(nullpad), 'still Normal').toBe('NORMAL')
  await nullpad.press('0')
  await nullpad.press('x')
  expect(await nullpad.text(), 'Normal x after the IME').toBe('ne two three')
  await nullpad.press('A')
  await nullpad.type(' four')
  await nullpad.compose('2', { start: 3, end: 6 })
  await nullpad.commit('2')
  expect(await nullpad.text(), 'only "two" was converted').toBe(
    'ne 2 three four',
  )
  await nullpad.press('Escape')
  await nullpad.press('0')
  await nullpad.press('i')
  await nullpad.type('o')
  expect(await nullpad.text(), 'typing goes on after the conversion').toBe(
    'one 2 three four',
  )
})

const SAVED = 1100

const editInOtherTab = async (nullpad: Nullpad) => {
  const other = await openTab(nullpad.page)
  if ((await modeOf(other)) === 'EDIT') {
    await other.press(toggle)
  }
  expect(await other.text(), 'the second tab opens the same note').toBe('base')
  await other.press('A')
  await other.type(' B')
  await other.page.waitForTimeout(SAVED)
  await nullpad.page.bringToFront()
  await expect
    .poll(() => nullpad.text(), {
      message: 'the other tab save reached this tab',
    })
    .toBe('base B')
}

test('a save from another tab leaves a tab in Insert in Insert, so the next letters are typed as text', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('base')
  await nullpad.page.waitForTimeout(SAVED)
  await editInOtherTab(nullpad)
  expect(await modeOf(nullpad), 'still INSERT after the other tab saved').toBe(
    'INSERT',
  )
  const caret = await nullpad.page.locator('#caret').boundingBox()
  expect(caret?.width ?? 99, 'the cursor is still a bar').toBeLessThanOrEqual(4)
  await nullpad.type('xyz')
  expect(
    (await nullpad.text()).replace('xyz', ''),
    'xyz was typed and no letter was deleted',
  ).toBe('base B')
  expect(await modeOf(nullpad), 'still INSERT after typing').toBe('INSERT')
})

test('a save from another tab leaves a tab in Normal in Normal', async ({
  nullpad,
}) => {
  await nullpad.press(toggle)
  await nullpad.press('i')
  await nullpad.type('base')
  await nullpad.press('Escape')
  await nullpad.page.waitForTimeout(SAVED)
  await editInOtherTab(nullpad)
  expect(await modeOf(nullpad), 'still NORMAL after the other tab saved').toBe(
    'NORMAL',
  )
  await nullpad.type('xyz')
  expect(
    (await nullpad.text()).length,
    'letters in Normal are commands, never typed text',
  ).toBeLessThan('base B'.length)
  expect(await modeOf(nullpad), 'still NORMAL after the keys').toBe('NORMAL')
})

test('operator-pending keys show in the status line and Esc, Ctrl+P, Ctrl+E and a non-target key drop them without a change', async ({
  nullpad,
}) => {
  await nullpad.paste('one two three\nfour')
  await nullpad.press('Control+Home')
  await nullpad.press(toggle)
  await nullpad.press('d')
  expect(await pendingOf(nullpad), 'd waits for a target').toBe('d')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Esc drops d').toBe('')
  await nullpad.press('2')
  await nullpad.press('d')
  await nullpad.press('3')
  expect(await pendingOf(nullpad), 'counts and operator show').toBe('2d3')
  await nullpad.press('Control+p')
  await nullpad.press('Escape')
  expect(await pendingOf(nullpad), 'Ctrl+P drops 2d3').toBe('')
  await nullpad.press('c')
  await nullpad.press('i')
  expect(await pendingOf(nullpad), 'ci waits for an object').toBe('ci')
  await nullpad.press('Control+e')
  await nullpad.press('Control+e')
  expect(await pendingOf(nullpad), 'Ctrl+E drops ci').toBe('')
  await nullpad.press('d')
  await nullpad.press('q')
  expect(await pendingOf(nullpad), 'q is no target and drops d').toBe('')
  await nullpad.press('c')
  await nullpad.press('i')
  await nullpad.press('Z')
  expect(await pendingOf(nullpad), 'Z is no object and drops ci').toBe('')
  expect(await modeOf(nullpad), 'no change of mode').toBe('NORMAL')
  expect(await nullpad.text(), 'nothing was deleted or typed').toBe(
    'one two three\nfour',
  )
  expect(await nullpad.status(), 'the cursor did not move').toMatchObject({
    line: 1,
    column: 1,
  })
  await nullpad.press('w')
  expect(
    await nullpad.status(),
    'w after a dropped d only moves',
  ).toMatchObject({ line: 1, column: 5 })
})

test('c lands in Insert with the bar cursor, typed text goes in and Esc returns to Normal', async ({
  nullpad,
}) => {
  await nullpad.paste('foo bar')
  await nullpad.press('Control+Home')
  await nullpad.press(toggle)
  await nullpad.press('c')
  await nullpad.press('w')
  expect(await modeOf(nullpad), 'cw lands in Insert').toBe('INSERT')
  const bar = await nullpad.cursor()
  expect(bar?.width, 'Insert caret is a thin bar').toBeGreaterThan(1)
  expect(bar?.width).toBeLessThan(3.5)
  await nullpad.type('xy')
  expect(await nullpad.text(), 'typed text replaces the word').toBe('xy bar')
  await nullpad.press('Escape')
  expect(await modeOf(nullpad), 'Esc returns to Normal').toBe('NORMAL')
  expect(await nullpad.status(), 'Esc steps one letter left').toMatchObject({
    line: 1,
    column: 2,
  })
  const block = await nullpad.cursor()
  expect(block?.width, 'Normal caret is a block again').toBeGreaterThan(5)
})

test('yy in one note and p in another note puts the line, and after a reload p does nothing', async ({
  nullpad,
}) => {
  await nullpad.type('alpha')
  await nullpad.page.waitForTimeout(SAVED)
  await nullpad.press(toggle)
  await nullpad.press('y')
  await nullpad.press('y')
  await nullpad.press('Control+p')
  await nullpad.type('second')
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
  expect(await nullpad.text(), 'the second note is open').toBe('second')
  expect(await modeOf(nullpad), 'a note opened with vim on is Normal').toBe(
    'NORMAL',
  )
  await nullpad.press('p')
  expect(await nullpad.text(), 'p puts the yanked line below').toBe(
    'second\nalpha',
  )
  await nullpad.page.waitForTimeout(SAVED)
  await nullpad.reload()
  expect(await nullpad.text(), 'the note came back').toBe('second\nalpha')
  await nullpad.press('p')
  expect(await nullpad.text(), 'the store is empty after a reload').toBe(
    'second\nalpha',
  )
})
