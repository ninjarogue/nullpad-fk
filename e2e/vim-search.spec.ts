import { type Nullpad, expect, settle, startVimRow, test } from './nullpad'

type Row = readonly [
  id: number,
  why: string,
  text: string,
  at: readonly [number, number],
  keys: string,
  after: string | null,
  line: number,
  column: number,
  mode: string,
  selection: string | null,
  afterP: string | null,
  notice: string | null,
]

type Group = Readonly<{ name: string; rows: ReadonlyArray<Row> }>

const groups: ReadonlyArray<Group> = [
  {
    name: 'plain / and ? and wrap',
    rows: [
      [
        1,
        'next match on the same line',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        2,
        'a match under the cursor is skipped',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        '/two<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        4,
        'from a match at a line start goes to the one later on the line',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 1],
        '/two<CR>',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        5,
        'from the last match of line 2 to the one on line 4: no wrap',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        '/two<CR>',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        '',
      ],
      [
        6,
        'the only later match is the one under the cursor: wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [4, 5],
        '/two<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        7,
        'the only match is under the cursor: stays, warns',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/one<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        9,
        'a match above wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [3, 1],
        '/one<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        10,
        '? from the top wraps to the last match',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '?two<CR>',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        14,
        '? from the last match',
        'one two three\ntwo four two\nfive\nsix two',
        [4, 5],
        '?two<CR>',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        20,
        'letters after a tab',
        'a\tb two\n\ttwo\tx two\n\ntwo end',
        [2, 8],
        '/two<CR>',
        null,
        4,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        24,
        'wide letters before the match',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [1, 1],
        '/two<CR>',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        31,
        'a wrap onto a wide letter',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [5, 5],
        '/あ<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        36,
        'an accented letter',
        'café é x é\nÉé two TWO Two\nüber über_x x_über',
        [1, 1],
        '/é<CR>',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        39,
        'a match over an empty line',
        'one\n\ntwo',
        [1, 1],
        '/two<CR>',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: 'n and N, counts and wrap',
    rows: [
      [
        41,
        'n goes to the next match',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>n',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        45,
        'N goes back and wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>N',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        48,
        'n after ? goes backward',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '?two<CR>n',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        50,
        'N after ? goes forward and wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '?two<CR>N',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        54,
        'a count of five n wraps once more',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>5n',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        58,
        'a count before /',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '3/two<CR>',
        null,
        2,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        63,
        'a count from the last line match',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        '2/two<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        64,
        'n with one match stays and warns',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/one<CR>n',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        67,
        'n with no last pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'n',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E35: No previous regular expression',
      ],
      [
        69,
        'n after a failed search fails the same',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/zzz<CR>n',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: zzz',
      ],
      [
        72,
        'n repeats the newest pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>/five<CR>n',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        74,
        'an empty ? is the last pattern backward',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>?<CR>',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        79,
        'an empty ? repeats',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        '?two<CR>?<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        83,
        'no match: cursor stays, E486',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/zzz<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: zzz',
      ],
      [
        89,
        'u after a search changes nothing',
        'one two three\ntwo four two\nfive\nsix two',
        [3, 1],
        '/two<CR>u',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: 'offsets',
    rows: [
      [
        92,
        'e: the last letter of the match',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        93,
        'n keeps the offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>n',
        null,
        2,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        95,
        'N keeps the offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>N',
        null,
        4,
        7,
        'NORMAL',
        null,
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        96,
        'e+1',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e+1<CR>',
        null,
        1,
        8,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        97,
        'e-1',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e-1<CR>',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        100,
        's+1',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/s+1<CR>',
        null,
        1,
        6,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        101,
        's-1',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/s-1<CR>',
        null,
        1,
        4,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        102,
        'b+2',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/b+2<CR>',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        105,
        'a line offset down',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/+1<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        108,
        'n keeps the line offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/+1<CR>n',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        111,
        'a line offset past the end',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/+9<CR>',
        null,
        4,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        112,
        'a line offset before the start',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/-9<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        114,
        'an empty pattern keeps the last offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>/<CR>',
        null,
        2,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        116,
        'a ? search with an empty pattern after / and an offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>?<CR>',
        null,
        4,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        117,
        'a closing slash and nothing after it',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        120,
        '? with an e offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '?two?e<CR>',
        null,
        4,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        124,
        '? with a line offset up',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        '?two?-1<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        125,
        'a slash in a ? pattern is a letter, so two/e is not in the note',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '?two/e<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: two/e',
      ],
      [
        126,
        'e offset from the match under the cursor',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        '/two/e<CR>',
        null,
        1,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        128,
        'e at a line end',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/three/e<CR>',
        null,
        1,
        13,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        129,
        'e+1 over the line end',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/three/e+1<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: 'pattern dialect, token by token',
    rows: [
      [
        137,
        '. any letter',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/t.o<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        139,
        '* zero or more',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/o*b<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        142,
        'a leading * is a letter',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/*<CR>',
        null,
        6,
        11,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        144,
        'an escaped asterisk is a letter',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [6, 1],
        '/a\\*b<CR>',
        null,
        6,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        145,
        '\\+ one or more',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/fo\\+<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        147,
        '\\= zero or one',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/foo\\=bar<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        149,
        '\\{n} exactly n',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [2, 1],
        '/o\\{3}<CR>',
        null,
        2,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        150,
        '\\{n,m}',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [2, 1],
        '/o\\{2,3}<CR>',
        null,
        2,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        151,
        '\\{n,} at least n',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [2, 1],
        '/o\\{3,}<CR>',
        null,
        2,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        153,
        '\\{} is *',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/fo\\{}b<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        155,
        'lazy match end seen with e',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/f.\\{-1,}o/e<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        157,
        '\\{-} is lazy zero or more',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/fo\\{-}<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        158,
        '\\{-n,m} lazy with a range',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [2, 1],
        '/o\\{-2,3}/e<CR>',
        null,
        2,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        159,
        '\\| alternation',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/foo\\|x1<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        163,
        'a group with a bar, repeated',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\(foo\\|x\\)\\+bar<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        164,
        'a repeated group',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\(fo\\)\\{2}<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        167,
        'parentheses are letters',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/foo(bar)<CR>',
        null,
        1,
        17,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        171,
        'braces are letters',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [6, 1],
        '/a{2}<CR>',
        null,
        6,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        176,
        'a range in a set',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/[a-c]\\+<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        178,
        'a negated set',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/[^f ]\\{3}<CR>',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        180,
        '] first in a set is a letter',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [4, 1],
        '/[]a]<CR>',
        null,
        4,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        182,
        'an escaped ] in a set',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [4, 1],
        '/[\\]]<CR>',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        184,
        '^ at the start',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [3, 1],
        '/^x<CR>',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        188,
        '^ in the middle is a letter',
        'a/b a?b a\\b a^b a$b\nx~y xy',
        [1, 1],
        '/a^b<CR>',
        null,
        1,
        13,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        193,
        'an escaped question mark in a ? pattern is a letter',
        'a/b a?b a\\b a^b a$b\nx~y xy',
        [1, 7],
        '?a\\?b<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        195,
        '\\< and \\> around a word',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\<foo\\>/e<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        197,
        '\\> at a word end',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/foo\\>/e<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        199,
        'no word starts with o: E486',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\<o<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: \\<o',
      ],
      [
        200,
        '\\> after f in café fails because é is a word letter',
        'café é x é\nÉé two TWO Two\nüber über_x x_über',
        [1, 1],
        '/f\\><CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: f\\>',
      ],
      [
        204,
        '_ is a word letter',
        'café é x é\nÉé two TWO Two\nüber über_x x_über',
        [3, 1],
        '/\\<x\\><CR>',
        null,
        1,
        8,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        207,
        '\\s is a space or a tab',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\s<CR>',
        null,
        1,
        8,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        208,
        '\\s\\+ takes a space and a tab',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [5, 1],
        '/\\s\\+<CR>',
        null,
        5,
        4,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        210,
        '\\a then \\d',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\a\\d<CR>',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        219,
        '\\v braces',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\vfo{2}<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        221,
        '\\v plus',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\vfo+<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        227,
        '\\V a dot is a letter: wraps to itself',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\Vfoo.bar<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        233,
        '\\V group',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 1],
        '/\\Vfoo\\(\\.\\)bar<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        250,
        'an unmatched group',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/\\(two<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E54: Unmatched \\(',
      ],
    ],
  },
  {
    name: 'case',
    rows: [
      [
        253,
        'case counts',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/Two<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: Two',
      ],
      [
        258,
        '\\c at the start',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [7, 1],
        '/\\cthe<CR>',
        null,
        7,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        260,
        '\\c in the middle',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [7, 1],
        '/t\\che<CR>',
        null,
        7,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        262,
        '\\C at the start',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [7, 1],
        '/\\Cthe<CR>',
        null,
        7,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        264,
        '\\c then \\C: the last one wins',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [7, 1],
        '/\\c\\Cthe<CR>',
        null,
        7,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        266,
        '\\c with accented letters',
        'café é x é\nÉé two TWO Two\nüber über_x x_über',
        [1, 1],
        '/\\cÉÉ<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        270,
        '\\c with a set',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [7, 1],
        '/\\c[a-z]\\+<CR>',
        null,
        7,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: '* and #',
    rows: [
      [
        272,
        '* on a word',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 6],
        '*',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        275,
        '* on a space finds the next word on the line',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 8],
        '*',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        280,
        '# backward',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        '#',
        null,
        4,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        281,
        '# on a word with one match: stays',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 5],
        '#',
        null,
        2,
        5,
        'NORMAL',
        null,
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        288,
        'a count of five wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        '5*',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        290,
        '* on a word with one match: stays, warns',
        'one two three\ntwo four two\nfive\nsix two',
        [3, 1],
        '*',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        293,
        '* does not match a longer word',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [2, 1],
        '*',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        296,
        '* on a dot picks the next word',
        'foo.bar foo+bar foo(bar) foo|bar\nfoobar fooo foooo\nx1 x22 x333\n[abc] a-b a_b\nfoo  \tbar\n{x} a{2} a*b\nTHE the The',
        [1, 4],
        '*',
        null,
        1,
        13,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        298,
        '* on über',
        'café é x é\nÉé two TWO Two\nüber über_x x_über',
        [3, 1],
        '*',
        null,
        3,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        309,
        '* on an empty line: no string',
        'one\n\ntwo\n  \nthree two',
        [2, 1],
        '*',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        'E348: No string under cursor',
      ],
      [
        313,
        'dd still runs after *',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '*dd',
        'two four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: 'operators with / ? n N',
    rows: [
      [
        315,
        'd/ is exclusive',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>',
        'two three\ntwo four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        316,
        'd/ over a line break',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        'd/two<CR>',
        'one \ntwo four two\nfive\nsix two',
        1,
        4,
        'NORMAL',
        null,
        'onetwo three \ntwo four two\nfive\nsix two',
        null,
      ],
      [
        318,
        'd/ to a line start with the cursor at the line start is linewise',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/five<CR>',
        'five\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        319,
        'd/ to a line start from the middle of a line',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        'd/five<CR>',
        'one \nfive\nsix two',
        1,
        4,
        'NORMAL',
        null,
        'onetwo three\ntwo four two \nfive\nsix two',
        null,
      ],
      [
        325,
        'd? is exclusive',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 5],
        'd?two<CR>',
        'one two three\nfour two\nfive\nsix two',
        2,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        328,
        'd? from a line start',
        'one two three\ntwo four two\nfive\nsix two',
        [3, 1],
        'd?two<CR>',
        'one two three\ntwo four \nfive\nsix two',
        2,
        9,
        'NORMAL',
        null,
        'one two three\ntwo fourtwo \nfive\nsix two',
        null,
      ],
      [
        329,
        'd/ with e is inclusive',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two/e<CR>',
        ' three\ntwo four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        334,
        'd/ with a line offset is linewise',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two/+1<CR>',
        'five\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        337,
        'd? with e',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        'd?two?e<CR>',
        'one two three\ntwwo\nfive\nsix two',
        2,
        3,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        340,
        'dN wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>dN',
        'one two',
        1,
        5,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        344,
        'd2n',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>d2n',
        'one two\nfive\nsix two',
        1,
        5,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        348,
        'y/ over a line break',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 5],
        'y/five<CR>',
        null,
        1,
        5,
        'NORMAL',
        null,
        'one two three\ntwo four twotwo three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        349,
        'y? moves the cursor to the start',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        'y?one<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        354,
        'c/',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'c/two<CR>X <Esc>',
        'X two three\ntwo four two\nfive\nsix two',
        1,
        2,
        'NORMAL',
        null,
        'Xone  two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        359,
        'cn',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>cnX<Esc>',
        'one X\ntwo four two\nfive\nsix two',
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        361,
        'a failed d/ does nothing',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/zzz<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E486: Pattern not found: zzz',
      ],
      [
        365,
        'dn with no last pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'dn',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E35: No previous regular expression',
      ],
      [
        369,
        'an empty d/ with no last pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/<CR>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        'E35: No previous regular expression',
      ],
      [
        370,
        'an empty d/ takes the last pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/four<CR>ggd/<CR>',
        'four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        371,
        'Esc cancels d/',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<Esc>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        374,
        'Ctrl-C cancels d/',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<C-c>',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        378,
        'd/ with e over an emoji',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [2, 1],
        'd/two/e<CR>',
        'あい two う\n 😀 two\n世界two\n\nend two',
        2,
        1,
        'NORMAL',
        null,
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        null,
      ],
      [
        383,
        'd/ from an indented first non-blank to a line start',
        '  one two\n  five two\nsix\n    two',
        [2, 3],
        'd/six<CR>',
        '  one two\nsix\n    two',
        2,
        1,
        'NORMAL',
        null,
        '  one two\n  five two\nsix\n    two',
        null,
      ],
    ],
  },
  {
    name: 'dot with search',
    rows: [
      [
        386,
        'dot repeats d/',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>.',
        'two four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        388,
        'dot keeps its own pattern and makes it the last one',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>/five<CR>gg.',
        'two four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        390,
        'n after dot reads the dot pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>/five<CR>gg.n',
        'two four two\nfive\nsix two',
        1,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        391,
        'dot of dn reads the newest pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>dn/five<CR>gg.',
        'five\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        392,
        'u after dn',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>dnu',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        394,
        'dot of cn',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>cnX<Esc>n.',
        'one X\nXtwo\nfive\nsix two',
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        397,
        'dot with an e offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two/e<CR>.',
        ' four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        399,
        'dot with a count',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '2d/two<CR>.',
        'two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        400,
        'a count before dot',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>3.',
        'two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        401,
        'dot after a failed d/ repeats nothing',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/zzz<CR>.',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        405,
        'dot after undo',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'd/two<CR>u.',
        'two three\ntwo four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        407,
        'dot after a yank repeats nothing',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'y/two<CR>.',
        null,
        1,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
  {
    name: 'visual kinds',
    rows: [
      [
        410,
        'v moves the cursor end',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/two<CR>',
        null,
        1,
        5,
        'VISUAL',
        'one t',
        null,
        null,
      ],
      [
        411,
        'v/ then d',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/two<CR>d',
        'wo three\ntwo four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        412,
        'v/ over a line break',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/four<CR>',
        null,
        2,
        5,
        'VISUAL',
        'one two three\ntwo f',
        null,
        null,
      ],
      [
        414,
        'v/ with e',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/two/e<CR>',
        null,
        1,
        7,
        'VISUAL',
        'one two',
        null,
        null,
      ],
      [
        416,
        'v/ with a line offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/two/+1<CR>',
        null,
        2,
        1,
        'VISUAL',
        'one two three\nt',
        null,
        null,
      ],
      [
        417,
        'v? backward',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        'v?two<CR>',
        null,
        2,
        1,
        'VISUAL',
        'two four t',
        null,
        null,
      ],
      [
        420,
        'vn',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>vn',
        null,
        2,
        1,
        'VISUAL',
        'two three\nt',
        null,
        null,
      ],
      [
        422,
        'vN wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>vN',
        null,
        4,
        5,
        'VISUAL',
        'two three\ntwo four two\nfive\nsix t',
        null,
        'search hit TOP, continuing at BOTTOM',
      ],
      [
        428,
        'a failed v/ keeps VISUAL',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/zzz<CR>',
        null,
        1,
        1,
        'VISUAL',
        'o',
        null,
        'E486: Pattern not found: zzz',
      ],
      [
        429,
        'a failed v/ then d',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/zzz<CR>d',
        'ne two three\ntwo four two\nfive\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        432,
        'V/',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'V/four<CR>',
        null,
        2,
        5,
        'V-LINE',
        'one two three\ntwo four two\n',
        null,
        null,
      ],
      [
        433,
        'V/ then d',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'V/four<CR>d',
        'five\nsix two',
        1,
        1,
        'NORMAL',
        null,
        'one two three\ntwo four two\nfive\nsix two',
        null,
      ],
      [
        438,
        'V/ with a line offset',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'V/two/+1<CR>',
        null,
        2,
        1,
        'V-LINE',
        'one two three\ntwo four two\n',
        null,
        null,
      ],
      [
        440,
        'V-BLOCK /',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '<C-v>/two<CR>',
        null,
        1,
        5,
        'V-BLOCK',
        'one t',
        null,
        null,
      ],
      [
        444,
        'V-BLOCK ?',
        'one two three\ntwo four two\nfive\nsix two',
        [2, 10],
        '<C-v>?one<CR>',
        null,
        1,
        1,
        'V-BLOCK',
        'one two th\ntwo four t',
        null,
        null,
      ],
      [
        451,
        'v/ over a tab then d',
        'a\tb two\n\ttwo\tx two\n\ntwo end',
        [1, 1],
        'v/two<CR>d',
        'wo\n\ttwo\tx two\n\ntwo end',
        1,
        1,
        'NORMAL',
        null,
        'a\tb two\n\ttwo\tx two\n\ntwo end',
        null,
      ],
      [
        454,
        'a second search in VISUAL',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/two<CR>/five<CR>',
        null,
        3,
        1,
        'VISUAL',
        'one two three\ntwo four two\nf',
        null,
        null,
      ],
      [
        457,
        'an empty v/ with no last pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        'v/<CR>',
        null,
        1,
        1,
        'VISUAL',
        'o',
        null,
        'E35: No previous regular expression',
      ],
    ],
  },
  {
    name: 'edge cases',
    rows: [
      [
        460,
        '^$ finds an empty line',
        'one\n\ntwo',
        [1, 1],
        '/^$<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        461,
        '^$ from below wraps',
        'one\n\ntwo',
        [3, 1],
        '/^$<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        463,
        '^\\s*$ finds a blank line first',
        'one\n\ntwo\n  \nthree two',
        [1, 1],
        '/^\\s*$<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        465,
        '$ alone',
        'one\n\ntwo',
        [1, 1],
        '/$<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        467,
        '^ alone',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/^<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        469,
        'x* matches empty at the next letter',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/x*<CR>',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        473,
        'an empty branch',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two\\|<CR>',
        null,
        1,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        475,
        'an empty pattern after a match at the line end',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/three<CR>/<CR>',
        null,
        1,
        9,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        477,
        'at the last letter of the note wraps',
        'one two three\ntwo four two\nfive\nsix two',
        [4, 8],
        '/six<CR>',
        null,
        4,
        1,
        'NORMAL',
        null,
        null,
        'search hit BOTTOM, continuing at TOP',
      ],
      [
        481,
        'a space in the pattern',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/e t<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        486,
        'a match with a slash in the text',
        'a/b a?b a\\b a^b a$b\nx~y xy',
        [1, 1],
        '/b a<CR>',
        null,
        1,
        3,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        490,
        'j then k after a search keep the column',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>jk',
        null,
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        492,
        'x at the match',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>x',
        'one wo three\ntwo four two\nfive\nsix two',
        1,
        5,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        497,
        'vn after offsets',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two/e<CR>nNvn',
        null,
        2,
        3,
        'VISUAL',
        'o three\ntwo',
        null,
        null,
      ],
      [
        499,
        'a search after a delete of the matched line',
        'one two three\ntwo four two\nfive\nsix two',
        [1, 1],
        '/two<CR>dd/two<CR>',
        'two four two\nfive\nsix two',
        1,
        10,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        502,
        'a pattern with an emoji and letters',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [1, 1],
        '/😀 two<CR>',
        null,
        2,
        1,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        506,
        '. takes an emoji',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [2, 1],
        '/.t<CR>',
        null,
        2,
        2,
        'NORMAL',
        null,
        null,
        null,
      ],
      [
        507,
        '. between an emoji and a word',
        'あい two う\n😀 two 😀 two\n世界two\n\nend two',
        [2, 1],
        '/😀.two<CR>',
        null,
        2,
        7,
        'NORMAL',
        null,
        null,
        null,
      ],
    ],
  },
]

const keyNames: Readonly<Record<string, string>> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<Del>': 'Delete',
  '<Tab>': 'Tab',
  '<Left>': 'ArrowLeft',
  '<Right>': 'ArrowRight',
  '<Up>': 'ArrowUp',
  '<Down>': 'ArrowDown',
  '<Home>': 'Home',
  '<End>': 'End',
  '<C-r>': 'Control+r',
  '<C-[>': 'Control+[',
  '<C-v>': 'Control+v',
  '<C-c>': 'Control+c',
  '<C-u>': 'Control+u',
  '<C-e>': 'Control+e',
  '<C-p>': 'Control+p',
}

const tokensOf = (keys: string): ReadonlyArray<string> =>
  keys
    .split(/(<[A-Za-z-[\]]+>)/u)
    .flatMap(part =>
      part in keyNames
        ? [part]
        : (part.match(/[\x20-\x7e]|[^\x20-\x7e]+/gu) ?? []),
    )

const isPlainKey = (token: string) => /^[\x20-\x7e]$/u.test(token)

const play = async (nullpad: Nullpad, keys: string) => {
  for (const token of tokensOf(keys)) {
    if (token in keyNames) {
      await nullpad.page.keyboard.press(keyNames[token] ?? token)
    } else if (isPlainKey(token)) {
      await nullpad.page.keyboard.press(token)
    } else {
      await nullpad.page.keyboard.insertText(token)
    }
  }
  await settle(nullpad.page)
}

const modeOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  return nullpad.page.locator('.status .mode').innerText()
}

const pendingOf = async (nullpad: Nullpad) => {
  await settle(nullpad.page)
  const pending = nullpad.page.locator('.status .pending')
  return (await pending.count()) === 0 ? '' : (await pending.innerText()).trim()
}

const promptOf = async (nullpad: Nullpad): Promise<string | null> => {
  await settle(nullpad.page)
  const prompt = nullpad.page.locator('.status .prompt')
  return (await prompt.count()) === 0 ? null : await prompt.innerText()
}

const noticeOf = async (nullpad: Nullpad) => (await nullpad.notice()).trim()

const begin = async (
  nullpad: Nullpad,
  text: string,
  at: readonly [number, number] = [1, 1],
) => {
  await startVimRow(nullpad, text, at[0], at[1])
}

const playRow = async (nullpad: Nullpad, row: Row) => {
  const [
    id,
    why,
    text,
    at,
    keys,
    after,
    line,
    column,
    mode,
    selection,
    afterP,
    notice,
  ] = row
  await begin(nullpad, text, at)
  await play(nullpad, keys)
  const label = `row ${id} (${why}) keys ${keys} at ${at.join(':')}`
  expect.soft(await nullpad.text(), `${label}: text`).toBe(after ?? text)
  expect
    .soft(await nullpad.status(), `${label}: line and column`)
    .toMatchObject({ line, column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe(mode)
  expect.soft(await promptOf(nullpad), `${label}: no prompt is open`).toBeNull()
  if (selection !== null) {
    expect
      .soft(await nullpad.selection(), `${label}: selected letters`)
      .toBe(selection)
  }
  if (notice !== null) {
    expect.soft(await noticeOf(nullpad), `${label}: notice`).toBe(notice)
  }
  if (afterP !== null) {
    await play(nullpad, 'P')
    expect
      .soft(await nullpad.text(), `${label}: P puts the unnamed register`)
      .toBe(afterP)
  }
}

const rowsPerTest = 20

for (const group of groups) {
  for (let from = 0; from < group.rows.length; from += rowsPerTest) {
    const rows = group.rows.slice(from, from + rowsPerTest)
    test(
      `search ${group.name} as in Vim (rows ${rows.map(row => row[0]).join(', ')})`,
      { tag: '@vim-table' },
      async ({ nullpad }) => {
        for (const row of rows) {
          await playRow(nullpad, row)
        }
      },
    )
  }
}

const openFinder = async (nullpad: Nullpad) => {
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
}

const startNote = async (nullpad: Nullpad, firstLine: string) => {
  await openFinder(nullpad)
  await nullpad.type(firstLine)
  for (let i = 0; i < 20; i++) {
    const selected = (await nullpad.finder())?.rows.find(row => row.selected)
    if (selected?.text.startsWith('+ new note')) {
      break
    }
    await nullpad.press('ArrowDown')
  }
  await nullpad.press('Enter')
}

const noteB = 'one two three\ntwo four two\nfive\nsix two'

const expectUntouched = async (
  nullpad: Nullpad,
  label: string,
  text: string,
  line: number,
  column: number,
) => {
  expect.soft(await nullpad.text(), `${label}: text`).toBe(text)
  expect
    .soft(await nullpad.status(), `${label}: cursor`)
    .toMatchObject({ line, column })
  expect.soft(await modeOf(nullpad), `${label}: mode`).toBe('NORMAL')
  expect.soft(await promptOf(nullpad), `${label}: prompt`).toBeNull()
}

test('/ and ? open a prompt in the status line that shows what is typed, and the mode stays NORMAL', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  expect(await promptOf(nullpad), 'no prompt before /').toBeNull()
  await play(nullpad, '/')
  expect(await promptOf(nullpad), '/ alone').toBe('/')
  expect(await modeOf(nullpad), 'NORMAL while the prompt is open').toBe(
    'NORMAL',
  )
  await play(nullpad, 'tw')
  expect(await promptOf(nullpad), 'typed letters follow the slash').toBe('/tw')
  await play(nullpad, 'o')
  expect(await promptOf(nullpad), 'a third letter').toBe('/two')
  await play(nullpad, '<Esc>?')
  expect(await promptOf(nullpad), '? opens its own prompt').toBe('?')
  await play(nullpad, 'one')
  expect(await promptOf(nullpad), '? and its text').toBe('?one')
  await play(nullpad, '<CR>')
  expect(await promptOf(nullpad), 'Enter closes the prompt').toBeNull()
})

test('keys typed in the prompt do not change the note, move the cursor or start commands', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [2, 3])
  await play(nullpad, '/xddjkhlp0$u')
  expect(await promptOf(nullpad), 'every key went to the prompt').toBe(
    '/xddjkhlp0$u',
  )
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
  expect(await nullpad.status(), 'the cursor has not moved').toMatchObject({
    line: 2,
    column: 3,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'after Esc', noteB, 2, 3)
})

test('nothing moves until Enter: the cursor stays on the line of the text typed in the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/five')
  expect(await nullpad.status(), 'still at the start').toMatchObject({
    line: 1,
    column: 1,
  })
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'Enter runs the search').toMatchObject({
    line: 3,
    column: 1,
  })
})

test('Left, Right, Home, End, Backspace, Delete and Ctrl-U edit the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<Left><Left>X')
  expect(await promptOf(nullpad), 'two Lefts then X (Vim: /tXwo)').toBe('/tXwo')
  await play(nullpad, '<Home>Y')
  expect(await promptOf(nullpad), 'Home is after the slash (Vim: /YtXwo)').toBe(
    '/YtXwo',
  )
  await play(nullpad, '<End>Z')
  expect(await promptOf(nullpad), 'End (Vim: /YtXwoZ)').toBe('/YtXwoZ')
  await play(nullpad, '<Left><Left><BS>')
  expect(await promptOf(nullpad), 'Backspace deletes the letter before').toBe(
    '/YtXoZ',
  )
  await play(nullpad, '<Right><Right><Right><BS>')
  expect(await promptOf(nullpad), 'Right moves on, Backspace at the end').toBe(
    '/YtXo',
  )
  await play(nullpad, '<Home><Del><Del>')
  expect(await promptOf(nullpad), 'Delete deletes the letter after').toBe('/Xo')
  await play(nullpad, '<Right><Right><Right>Q')
  expect(await promptOf(nullpad), 'Right stops at the end').toBe('/XoQ')
  await play(nullpad, '<End><C-u>')
  expect(
    await promptOf(nullpad),
    'Ctrl-U empties it and the prompt stays open (Vim: /)',
  ).toBe('/')
  await play(nullpad, 'ab<Home><Del>')
  expect(await promptOf(nullpad), 'Home then Delete (Vim: /b)').toBe('/b')
  await play(nullpad, '<C-u>ab<C-u>c')
  expect(
    await promptOf(nullpad),
    'Ctrl-U deletes only before the cursor: the b stays (Vim: /cb)',
  ).toBe('/cb')
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
})

test('Backspace takes a whole letter, an emoji or a wide letter, out of the prompt', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/a😀世')
  expect(await promptOf(nullpad), 'letters of every width').toBe('/a😀世')
  await play(nullpad, '<BS>')
  expect(await promptOf(nullpad), 'a wide letter goes whole').toBe('/a😀')
  await play(nullpad, '<BS>')
  expect(await promptOf(nullpad), 'an emoji goes whole (Vim: /a)').toBe('/a')
})

test('Backspace on an empty prompt closes it, with text it deletes and the empty prompt stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [1, 5])
  await play(nullpad, '/<BS>')
  await expectUntouched(nullpad, '/ then Backspace', noteB, 1, 5)
  await play(nullpad, '?<BS>')
  await expectUntouched(nullpad, '? then Backspace', noteB, 1, 5)
  await play(nullpad, '/tw<BS><BS>')
  expect(await promptOf(nullpad), 'the empty prompt stays (Vim)').toBe('/')
  await play(nullpad, '<BS>')
  await expectUntouched(nullpad, 'the third Backspace', noteB, 1, 5)
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'x then deletes one letter').toBe(
    noteB.replace('two', 'wo'),
  )
})

for (const [name, keys] of [
  ['Esc', '<Esc>'],
  ['Ctrl-[', '<C-[>'],
  ['Ctrl-C', '<C-c>'],
] as const) {
  test(`${name} closes the prompt, runs nothing, and the next key runs alone`, async ({
    nullpad,
  }) => {
    await begin(nullpad, noteB, [1, 1])
    await play(nullpad, `3/two${keys}`)
    await expectUntouched(nullpad, `3/two then ${name}`, noteB, 1, 1)
    expect(await pendingOf(nullpad), 'nothing pending').toBe('')
    await play(nullpad, 'x')
    expect(
      await nullpad.text(),
      'x deletes one letter, the 3 did not carry (Vim: ne two three)',
    ).toBe(noteB.slice(1))
    await play(nullpad, 'n')
    expect(
      await noticeOf(nullpad),
      'the closed prompt set no last pattern',
    ).toBe('E35: No previous regular expression')
  })
}

test('Esc on a prompt closes it in VISUAL and keeps VISUAL and the selection', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'vl/two<Esc>')
  expect(await modeOf(nullpad), 'still VISUAL').toBe('VISUAL')
  expect(await promptOf(nullpad), 'closed').toBeNull()
  expect(await nullpad.selection(), 'the selection is as it was').toBe('on')
  await play(nullpad, '/two<C-c>')
  expect(await modeOf(nullpad), 'still VISUAL after Ctrl-C').toBe('VISUAL')
  expect(await nullpad.selection(), 'selection after Ctrl-C').toBe('on')
})

test('a selection stays drawn while the prompt is open, in each visual kind', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'vl/tw')
  expect(await modeOf(nullpad), 'VISUAL while the prompt is open').toBe(
    'VISUAL',
  )
  expect(await promptOf(nullpad), 'the prompt').toBe('/tw')
  expect(await nullpad.selection(), 'v selection is still drawn').toBe('on')
  await play(nullpad, '<Esc><Esc>')
  expect(await modeOf(nullpad), 'Esc leaves VISUAL').toBe('NORMAL')
  await play(nullpad, 'V?tw')
  expect(await modeOf(nullpad), 'V-LINE while the prompt is open').toBe(
    'V-LINE',
  )
  expect(await nullpad.selection(), 'V selection is still drawn').toBe(
    'one two three\n',
  )
  await play(nullpad, '<Esc><Esc>gg0<C-v>jl/tw')
  expect(await modeOf(nullpad), 'V-BLOCK while the prompt is open').toBe(
    'V-BLOCK',
  )
  expect(await nullpad.selection(), 'block selection is still drawn').toBe(
    'on\ntw',
  )
})

test('d shows in .status .pending while the prompt is open and goes when it closes', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, 'd/')
  expect(await pendingOf(nullpad), 'd while the prompt is open').toBe('d')
  expect(await promptOf(nullpad), 'the prompt').toBe('/')
  await play(nullpad, 'two')
  expect(await pendingOf(nullpad), 'd while typing').toBe('d')
  await play(nullpad, '<CR>')
  expect(await pendingOf(nullpad), 'nothing pending after Enter').toBe('')
  expect(await nullpad.text(), 'd/two deleted to the next two').toBe(
    noteB.replace('one ', ''),
  )
  await play(nullpad, 'y?')
  expect(await pendingOf(nullpad), 'y while a ? prompt is open').toBe('y')
  await play(nullpad, '<Esc>')
  expect(await pendingOf(nullpad), 'Esc empties it').toBe('')
  await play(nullpad, 'c/')
  expect(await pendingOf(nullpad), 'c while the prompt is open').toBe('c')
  await play(nullpad, '<C-c>')
  expect(await pendingOf(nullpad), 'Ctrl-C empties it').toBe('')
})

test('Ctrl-E closes the prompt and opens the read view, Ctrl-P closes it and opens the finder', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'Ctrl-E opens the read view').toBe('READ')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'back from the read view', noteB, 1, 1)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+p')
  expect(await nullpad.finder(), 'Ctrl-P opens the finder').not.toBeNull()
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  await play(nullpad, '<Esc>')
  await expectUntouched(nullpad, 'back from the finder', noteB, 1, 1)
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('a click on the text closes the prompt and moves the cursor there', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  const box = await nullpad.page.locator('.surface .line').nth(2).boundingBox()
  if (box === null) {
    throw new Error('the third line has no box')
  }
  await nullpad.click(box.x + 2, box.y + box.height / 2)
  expect(await promptOf(nullpad), 'the click closed the prompt').toBeNull()
  expect(await nullpad.status(), 'the click moved the cursor').toMatchObject({
    line: 3,
    column: 1,
  })
  expect(await modeOf(nullpad), 'NORMAL').toBe('NORMAL')
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the vim toggle closes the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
  expect(await nullpad.text(), 'nothing was typed into the note').toBe(noteB)
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  expect(await promptOf(nullpad), 'still no prompt').toBeNull()
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'the closed prompt set no pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the vim button closes the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  await nullpad.page.locator('.status .toggle-vim').click()
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  expect(await promptOf(nullpad), 'the prompt is gone').toBeNull()
})

test('with vim off / types a slash and opens no prompt, and in the read view it does nothing', async ({
  nullpad,
}) => {
  await begin(nullpad, 'abc')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  await play(nullpad, '/')
  expect(await promptOf(nullpad), 'no prompt with vim off').toBeNull()
  expect(await nullpad.text(), 'the slash is text').toBe('/abc')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  await begin(nullpad, noteB)
  await nullpad.page.keyboard.press('Control+e')
  expect(await modeOf(nullpad), 'READ').toBe('READ')
  await play(nullpad, '/')
  expect(await promptOf(nullpad), 'no prompt in the read view').toBeNull()
  expect(await modeOf(nullpad), 'still READ').toBe('READ')
})

test('a paste into the prompt takes the text up to its first line break', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/')
  await nullpad.paste('two\nfour')
  expect(await promptOf(nullpad), 'the first line only').toBe('/two')
  expect(await nullpad.text(), 'the note is as it was').toBe(noteB)
  await play(nullpad, '<Left>')
  await nullpad.paste('x')
  expect(await promptOf(nullpad), 'a paste lands at the cursor').toBe('/twxo')
  await play(nullpad, '<End><C-u>')
  await nullpad.paste('five')
  await play(nullpad, '<CR>')
  expect(
    await nullpad.status(),
    'the pasted pattern is searched',
  ).toMatchObject({ line: 3, column: 1 })
})

test('IME text typed into the prompt is part of the pattern', async ({
  nullpad,
}) => {
  await begin(nullpad, 'あいにえおにか')
  await play(nullpad, '/')
  await nullpad.compose('n')
  await nullpad.compose('に')
  await nullpad.commit('に')
  expect(await promptOf(nullpad), 'the committed letter').toBe('/に')
  expect(await nullpad.text(), 'the note is as it was').toBe('あいにえおにか')
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'the search finds に').toMatchObject({
    line: 1,
    column: 3,
  })
  await play(nullpad, '/')
  await nullpad.compose('お')
  await nullpad.compose('')
  expect(await promptOf(nullpad), 'a cancelled composition adds nothing').toBe(
    '/',
  )
  await nullpad.commit('おに')
  expect(await promptOf(nullpad), 'two letters at once').toBe('/おに')
  await play(nullpad, '<CR>')
  expect(await nullpad.status(), 'the search finds おに').toMatchObject({
    line: 1,
    column: 5,
  })
})

test('the search history walks with Up and Down, newest first, and / and ? share it', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<CR>/four<CR>/')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up: the newest (Vim: four)').toBe('/four')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up again (Vim: two)').toBe('/two')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'Up past the oldest stays').toBe('/two')
  await play(nullpad, '<Down>')
  expect(await promptOf(nullpad), 'Down (Vim: four)').toBe('/four')
  await play(nullpad, '<Down>')
  expect(
    await promptOf(nullpad),
    'Down past the newest is what was typed',
  ).toBe('/')
  await play(nullpad, '<Esc>?')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), '? shares the history (Vim: ?four)').toBe(
    '?four',
  )
  await play(nullpad, '<Esc>')
  await play(nullpad, '/ab<Up>')
  expect(
    await promptOf(nullpad),
    'no entry starts with ab: nothing changes',
  ).toBe('/ab')
  await play(nullpad, '<Esc>')
})

test('text typed before Up is a prefix the entries must start with, and Down brings the text back', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<CR>/four<CR>/zzz<CR>')
  await play(nullpad, '/t<Up>')
  expect(await promptOf(nullpad), 'Up with the prefix t (Vim: /two)').toBe(
    '/two',
  )
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'no older entry starts with t').toBe('/two')
  await play(nullpad, '<Down>')
  expect(
    await promptOf(nullpad),
    'Down brings back what was typed (Vim: /t)',
  ).toBe('/t')
  await play(nullpad, '<Esc>/f<Up>')
  expect(await promptOf(nullpad), 'prefix f').toBe('/four')
  await play(nullpad, '<Esc>/two<Up>')
  expect(await promptOf(nullpad), 'a prefix that is the whole entry').toBe(
    '/two',
  )
  await play(nullpad, '<Esc>/tw<Up><Down>')
  expect(await promptOf(nullpad), 'Up then Down (Vim: /tw)').toBe('/tw')
})

test('a line closed with Esc is in the history, and an empty prompt with no history stays empty on Up', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'no history: nothing happens (Vim: /)').toBe(
    '/',
  )
  await play(nullpad, '<Esc>/two<Esc>')
  await play(nullpad, '/<Up>')
  expect(
    await promptOf(nullpad),
    'a line left with Esc is in the history',
  ).toBe('/two')
  await play(nullpad, '<Esc>n')
  expect(await noticeOf(nullpad), 'but it is not the last pattern').toBe(
    'E35: No previous regular expression',
  )
})

test('the history holds 50 entries', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  for (let i = 0; i < 60; i++) {
    await play(nullpad, `/s${i}<CR>`)
  }
  await play(nullpad, '/')
  for (let i = 0; i < 50; i++) {
    await nullpad.page.keyboard.press('ArrowUp')
  }
  expect(
    await promptOf(nullpad),
    'fifty Up reach the oldest kept (Vim: /s10)',
  ).toBe('/s10')
  await play(nullpad, '<Up><Up>')
  expect(await promptOf(nullpad), 'the oldest stays (Vim: /s10)').toBe('/s10')
})

test('the three notices read as Vim words them, and the next input clears the notice', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [4, 5])
  await play(nullpad, '/two<CR>')
  expect(await noticeOf(nullpad), 'a wrap at the end').toBe(
    'search hit BOTTOM, continuing at TOP',
  )
  expect(await nullpad.status(), 'and the cursor wrapped').toMatchObject({
    line: 1,
    column: 5,
  })
  await play(nullpad, 'l')
  expect(await noticeOf(nullpad), 'the next key clears it').toBe('')
  await play(nullpad, 'gg0?two<CR>')
  expect(await noticeOf(nullpad), 'a wrap at the top').toBe(
    'search hit TOP, continuing at BOTTOM',
  )
  await play(nullpad, '/zzz<CR>')
  expect(await noticeOf(nullpad), 'no match').toBe(
    'E486: Pattern not found: zzz',
  )
  expect(await nullpad.status(), 'the cursor stays').toMatchObject({
    line: 4,
    column: 5,
  })
  await play(nullpad, 'j')
  expect(await noticeOf(nullpad), 'cleared').toBe('')
  await play(nullpad, 'ggn')
  expect(await noticeOf(nullpad), 'zzz is the last pattern').toBe(
    'E486: Pattern not found: zzz',
  )
})

test('no previous pattern and no word under the cursor give E35 and E348', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one\n\ntwo', [2, 1])
  await play(nullpad, 'n')
  expect(await noticeOf(nullpad), 'n with no pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, 'N')
  expect(await noticeOf(nullpad), 'N with no pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '/<CR>')
  expect(await noticeOf(nullpad), 'an empty pattern with no last one').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '*')
  expect(await noticeOf(nullpad), '* on an empty line').toBe(
    'E348: No string under cursor',
  )
  await play(nullpad, '#')
  expect(await noticeOf(nullpad), '# on an empty line').toBe(
    'E348: No string under cursor',
  )
  expect(await nullpad.status(), 'the cursor stays').toMatchObject({
    line: 2,
    column: 1,
  })
})

test('a failed search is still the last pattern, an empty pattern repeats it, and a found match leaves no notice', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/zzz<CR>')
  expect(await noticeOf(nullpad), 'E486').toBe('E486: Pattern not found: zzz')
  await play(nullpad, '/<CR>')
  expect(await noticeOf(nullpad), 'an empty pattern is zzz again').toBe(
    'E486: Pattern not found: zzz',
  )
  await play(nullpad, '/two<CR>')
  expect(await noticeOf(nullpad), 'a found match leaves no notice').toBe('')
})

const refused: ReadonlyArray<readonly [string, string, string]> = [
  ['\\n', '\\n', 'exact'],
  ['\\zs', '\\zs', 'exact'],
  ['\\ze', '\\ze', 'exact'],
  ['\\&', '\\&', 'exact'],
  ['~', '~', 'exact'],
  ['\\%V', '\\%V', 'contains'],
  ['\\_s', '\\_', 'contains'],
  ['a\\@=', '\\@', 'contains'],
  ['\\(a\\)\\1', '\\1', 'contains'],
  ['[[:alpha:]]', '[:alpha:]', 'contains'],
]

test('tokens a search does not read are refused with a notice and the cursor stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  for (const [pattern, token, how] of refused) {
    await play(nullpad, `/${pattern}<CR>`)
    const notice = await noticeOf(nullpad)
    if (how === 'exact') {
      expect
        .soft(notice, `/${pattern}: the notice names the token`)
        .toBe(`not supported in a search: ${token}`)
    } else {
      expect
        .soft(notice, `/${pattern}: the notice starts as the contract says`)
        .toMatch(/^not supported in a search: /u)
      expect
        .soft(notice, `/${pattern}: the notice names the token`)
        .toContain(token)
    }
    await expectUntouched(nullpad, `/${pattern}`, noteB, 1, 1)
  }
})

test('a ; offset is refused with a notice and the cursor stays', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two/;/five<CR>')
  expect(await noticeOf(nullpad), 'the notice names the ;').toBe(
    'not supported in a search: ;',
  )
  await expectUntouched(nullpad, '/two/;/five', noteB, 1, 1)
})

const noteC = 'aab abc\nxxy xy\nabab c\nfoo'

const repeatedGroups: ReadonlyArray<
  readonly [pattern: string, line: number, column: number, notice: string]
> = [
  ['\\(a\\|a\\)*b', 1, 5, ''],
  ['\\(x\\|xx\\)\\+y', 2, 1, ''],
  ['\\(a\\|ab\\)*c', 1, 5, ''],
  [
    '\\(a\\|ab\\)\\{2,3}c',
    1,
    1,
    'E486: Pattern not found: \\(a\\|ab\\)\\{2,3}c',
  ],
  ['\\c\\(a\\|A\\)*b', 1, 5, ''],
  ['\\(\\(a\\|b\\)\\=\\)\\+c', 1, 5, ''],
  ['\\(x\\+\\)\\+', 2, 1, ''],
  ['\\v(a?){20}c', 1, 7, ''],
  ['\\([ab]\\|a\\)*c', 1, 5, ''],
  ['\\(x\\+x\\+\\)\\+y', 2, 1, ''],
  ['a*a*a*a*a*b', 1, 5, ''],
  ['.*.*.*.*x', 2, 1, ''],
]

test('repeated groups, bars and stacked repeats find what Vim finds', async ({
  nullpad,
}) => {
  await begin(nullpad, noteC)
  for (const [pattern, line, column, notice] of repeatedGroups) {
    await play(nullpad, `gg0/${pattern}<CR>`)
    expect
      .soft(await nullpad.status(), `/${pattern}: cursor`)
      .toMatchObject({ line, column })
    expect.soft(await noticeOf(nullpad), `/${pattern}: notice`).toBe(notice)
  }
})

const freezing: ReadonlyArray<
  readonly [pattern: string, unit: string, times: number]
> = [
  ['a*a*a*a*a*b', 'a', 5000],
  ['\\(a\\|a\\)*b', 'a', 5000],
  ['\\(x\\+x\\+\\)\\+y', 'x', 5000],
  ['.*.*.*.*x', 'a', 5000],
  ['\\w*\\w*\\w*\\w*x', 'a', 200],
  ['a*a*a*a*b', 'a', 50000],
  ['.\\{-}c', 'ab ', 16000],
  ['\\(ab \\)\\+c', 'ab ', 16000],
]

for (const [pattern, unit, times] of freezing) {
  test(`${pattern} on one line of ${(unit.length * times).toLocaleString('en-US')} letters answers at once`, async ({
    nullpad,
  }) => {
    test.setTimeout(30_000)
    await begin(nullpad, 'q')
    await play(nullpad, 'i')
    await nullpad.paste(unit.repeat(times))
    await play(nullpad, '<Esc>gg0/')
    await nullpad.page.keyboard.insertText(pattern)
    const started = Date.now()
    await nullpad.page.keyboard.press('Enter')
    await nullpad.page.locator('.status .notice').waitFor({ timeout: 25_000 })
    const took = Date.now() - started
    expect(await noticeOf(nullpad), 'no match').toBe(
      `E486: Pattern not found: ${pattern}`,
    )
    expect(took, 'milliseconds from Enter to the notice').toBeLessThan(1000)
  })
}

test('a group with a bar, repeated or not, still searches', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  for (const pattern of ['\\(f\\|x\\)\\+our', '\\(t\\|f\\)\\=our']) {
    await play(nullpad, `gg0/${pattern}<CR>`)
    expect.soft(await noticeOf(nullpad), `/${pattern}: no notice`).toBe('')
    expect
      .soft(await nullpad.status(), `/${pattern}: lands on four`)
      .toMatchObject({ line: 2, column: 5 })
  }
})

test('a refused token in a ? search, with an operator and in VISUAL stops the search and the operator', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB, [4, 5])
  await play(nullpad, '?\\zs<CR>')
  expect(await noticeOf(nullpad), '? with a refused token').toBe(
    'not supported in a search: \\zs',
  )
  await expectUntouched(nullpad, '?\\zs', noteB, 4, 5)
  await begin(nullpad, noteB)
  await play(nullpad, 'd/\\n<CR>')
  expect(await noticeOf(nullpad), 'd/ with a refused token').toBe(
    'not supported in a search: \\n',
  )
  await expectUntouched(nullpad, 'd/\\n', noteB, 1, 1)
  await play(nullpad, 'x')
  expect(await nullpad.text(), 'the key after it runs alone').toBe(
    noteB.slice(1),
  )
  await begin(nullpad, noteB)
  await play(nullpad, 'v/\\zs<CR>')
  expect(await modeOf(nullpad), 'VISUAL stays').toBe('VISUAL')
  expect(await noticeOf(nullpad), 'the notice').toBe(
    'not supported in a search: \\zs',
  )
  expect(await nullpad.selection(), 'the selection is as it was').toBe('o')
})

test('the last pattern and the history stay when another note is opened and when vim goes off and on, and a reload forgets them', async ({
  nullpad,
}) => {
  await begin(nullpad, 'one two\ntwo')
  await play(nullpad, '/two<CR>')
  await nullpad.page.waitForTimeout(1100)
  await startNote(nullpad, 'zz two zz two')
  expect(await modeOf(nullpad), 'another note opens in NORMAL').toBe('NORMAL')
  expect(await nullpad.text(), 'the new note').toBe('zz two zz two')
  await play(nullpad, 'gg0n')
  expect(
    await nullpad.status(),
    'n in the other note searches for two',
  ).toMatchObject({ line: 1, column: 4 })
  await play(nullpad, '/')
  await play(nullpad, '<Up>')
  expect(await promptOf(nullpad), 'the history came along').toBe('/two')
  await play(nullpad, '<Esc>0')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim off shows EDIT').toBe('EDIT')
  await nullpad.page.keyboard.press('Control+,')
  await settle(nullpad.page)
  expect(await modeOf(nullpad), 'vim on again').toBe('NORMAL')
  await play(nullpad, 'gg0n')
  expect(
    await nullpad.status(),
    'n after vim off and on still searches for two',
  ).toMatchObject({ line: 1, column: 4 })
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'the history after vim off and on').toBe(
    '/two',
  )
  await play(nullpad, '<Esc>')
  await nullpad.page.waitForTimeout(1100)
  await nullpad.reload()
  expect(await modeOf(nullpad), 'vim stays on after a reload').toBe('NORMAL')
  await play(nullpad, 'gg0n')
  expect(await noticeOf(nullpad), 'a reload forgot the last pattern').toBe(
    'E35: No previous regular expression',
  )
  await play(nullpad, '/<Up>')
  expect(await promptOf(nullpad), 'and the history').toBe('/')
})

const defectRows: ReadonlyArray<
  readonly [
    why: string,
    text: string,
    at: readonly [number, number],
    keys: string,
    after: string,
    line: number,
    column: number,
    mode: string,
  ]
> = [
  ['* on an emoji', '😀 a 😀', [1, 1], '*', '😀 a 😀', 1, 5, 'NORMAL'],
  [
    '* on an emoji with a letter after it',
    '😀a 😀a',
    [1, 1],
    '*',
    '😀a 😀a',
    1,
    4,
    'NORMAL',
  ],
  [
    '* on a letter beside an emoji',
    'x😀y x',
    [1, 1],
    '*',
    'x😀y x',
    1,
    5,
    'NORMAL',
  ],
  [
    '# on a letter with an emoji after it',
    'a😀 b a😀',
    [1, 1],
    '#',
    'a😀 b a😀',
    1,
    6,
    'NORMAL',
  ],
  [
    'an offset that runs off the top makes no line',
    'ab\ncd',
    [2, 2],
    '/^$/e-2<CR>',
    'ab\ncd',
    2,
    2,
    'NORMAL',
  ],
  [
    'd with an offset that runs off the top deletes nothing',
    'x',
    [1, 1],
    'd/^$/e-1<CR>',
    'x',
    1,
    1,
    'NORMAL',
  ],
  [
    'a large negative end offset',
    'ab\ncd\nef',
    [2, 1],
    '/^$/e-9<CR>',
    'ab\ncd\nef',
    2,
    1,
    'NORMAL',
  ],
  [
    'an end offset that runs off the bottom',
    'ab\ncd\nef',
    [2, 1],
    '?^$?e+3<CR>',
    'ab\ncd\nef',
    2,
    1,
    'NORMAL',
  ],
  [
    'd backward with an offset off the bottom',
    'ab\ncd\nef',
    [2, 1],
    'd?^$?e+3<CR>',
    'ab\ncd\nef',
    2,
    1,
    'NORMAL',
  ],
  [
    'd/\\s*$ stops before the last letter',
    'ab\nab\nab',
    [2, 1],
    'd/\\s*$<CR>',
    'ab\nb\nab',
    2,
    1,
    'NORMAL',
  ],
  [
    'd/$ stops before the last letter',
    'ab\nab\nab',
    [2, 1],
    'd/$<CR>',
    'ab\nb\nab',
    2,
    1,
    'NORMAL',
  ],
  [
    'y/$ yanks up to the last letter',
    'ab\nab\nab',
    [2, 1],
    'y/$<CR>P',
    'ab\naab\nab',
    2,
    1,
    'NORMAL',
  ],
  [
    'c/$ changes up to the last letter',
    'ab\nab\nab',
    [2, 1],
    'c/$<CR>Z<Esc>',
    'ab\nZb\nab',
    2,
    1,
    'NORMAL',
  ],
  [
    'd/$ from the last letter wraps back a line',
    'ab\ncd',
    [2, 2],
    'd/$<CR>',
    'ad',
    1,
    2,
    'NORMAL',
  ],
  [
    'd?$ from the first line goes to the last line',
    'abc\ncd',
    [1, 2],
    'd?$<CR>',
    'ad',
    1,
    2,
    'NORMAL',
  ],
  [
    'the . of d/$ finds the next $ after the cursor',
    'abc\ndef',
    [1, 1],
    'd/$<CR>.',
    'f',
    1,
    1,
    'NORMAL',
  ],
  [
    'd/$/e still takes the last letter',
    'abc def',
    [1, 1],
    'd/$/e<CR>',
    '',
    1,
    1,
    'NORMAL',
  ],
  [
    'v/$ then d takes the last letter',
    'abc def',
    [1, 1],
    'v/$<CR>d',
    '',
    1,
    1,
    'NORMAL',
  ],
  [
    'd/\\> stops before the last letter',
    'ab\ncd',
    [1, 1],
    'd/\\><CR>',
    'b\ncd',
    1,
    1,
    'NORMAL',
  ],
  [
    'd/$ over an empty line below',
    'ab\n\nab',
    [1, 1],
    'd/$<CR>',
    'b\n\nab',
    1,
    1,
    'NORMAL',
  ],
  [
    '$ before \\c is the line end',
    'one two\ntwo three',
    [2, 1],
    '/two$\\c<CR>',
    'one two\ntwo three',
    1,
    5,
    'NORMAL',
  ],
  [
    '$ before \\c with a letter',
    'one two\ntwo three',
    [1, 1],
    '/o$\\c<CR>',
    'one two\ntwo three',
    1,
    7,
    'NORMAL',
  ],
  [
    '^\\+ finds an empty match',
    'one two\ntwo three',
    [1, 3],
    '/^\\+<CR>',
    'one two\ntwo three',
    2,
    1,
    'NORMAL',
  ],
  [
    '\\<\\+ finds an empty match',
    'one two\ntwo three',
    [1, 1],
    '/\\<\\+<CR>',
    'one two\ntwo three',
    1,
    5,
    'NORMAL',
  ],
  [
    'VISUAL with an offset past the line end rests on the line break',
    'ab\nab\nab',
    [1, 1],
    'v?[ab]?e+3<CR>',
    'ab\nab\nab',
    3,
    3,
    'VISUAL',
  ],
  [
    'VISUAL with an empty match and an offset past the end',
    'ab\nab\nab',
    [1, 1],
    'v?x*?e+3<CR>',
    'ab\nab\nab',
    3,
    3,
    'VISUAL',
  ],
]

const defectsPerTest = 9

for (let from = 0; from < defectRows.length; from += defectsPerTest) {
  const rows = defectRows.slice(from, from + defectsPerTest)
  test(`the defects the interrogate pass found answer as Vim does (${from + 1} to ${from + rows.length})`, async ({
    nullpad,
  }) => {
    for (const [why, text, at, keys, after, line, column, mode] of rows) {
      await begin(nullpad, text, at)
      await play(nullpad, keys)
      expect.soft(await nullpad.text(), `${why}: text`).toBe(after)
      expect
        .soft(await nullpad.status(), `${why}: cursor`)
        .toMatchObject({ line, column })
      expect.soft(await modeOf(nullpad), `${why}: mode`).toBe(mode)
    }
  })
}

test('chords with Shift, Alt or Meta do not clear or close the prompt, and E and P still open the read view and the finder over it', async ({
  nullpad,
}) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two')
  for (const chord of [
    'Control+Shift+U',
    'Control+Alt+u',
    'Meta+u',
    'Alt+Control+p',
  ]) {
    await nullpad.page.keyboard.press(chord)
    await settle(nullpad.page)
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
    expect.soft(await modeOf(nullpad), `${chord}: the mode`).toBe('NORMAL')
  }
  for (const chord of ['Meta+e', 'Control+Shift+E']) {
    await nullpad.page.keyboard.press(chord)
    expect
      .soft(await modeOf(nullpad), `${chord}: opens the read view`)
      .toBe('READ')
    await nullpad.page.keyboard.press('Escape')
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
    expect.soft(await modeOf(nullpad), `${chord}: back in`).toBe('NORMAL')
  }
  for (const chord of ['Meta+p']) {
    await nullpad.page.keyboard.press(chord)
    await settle(nullpad.page)
    expect
      .soft(await nullpad.finder(), `${chord}: opens the finder`)
      .not.toBeNull()
    await nullpad.page.keyboard.press('Escape')
    await settle(nullpad.page)
    expect.soft(await promptOf(nullpad), `${chord}: the prompt`).toBe('/two')
  }
})

test('Ctrl-U alone clears the prompt', async ({ nullpad }) => {
  await begin(nullpad, noteB)
  await play(nullpad, '/two<C-u>')
  expect(await promptOf(nullpad), 'the prompt').toBe('/')
})

const collectionRows: ReadonlyArray<
  readonly [pattern: string, text: string, column: number]
> = [
  ['[\\d]', 'x\\dy', 2],
  ['[\\d]', 'xdy', 2],
  ['[\\w]', 'xwy', 2],
  ['[\\s]', 'x s', 3],
  ['[\\t]', 'x\ty', 2],
  ['[\\\\]', 'x\\y', 2],
  ['[\\]]', 'x]y', 2],
  ['[\\-]', 'a-b', 2],
  ['[\\d65]', 'xAy', 2],
  ['[\\x41]', 'xAy', 2],
  ['[\\o101]', 'xAy', 2],
  ['[\\u65e5]', 'x日y', 2],
  ['[\\d65-\\d67]', 'xCy', 2],
]

test('a collection reads its escapes as Vim does', async ({ nullpad }) => {
  for (const [pattern, text, column] of collectionRows) {
    await begin(nullpad, `zzz\n${text}`)
    await play(nullpad, `/${pattern}<CR>`)
    const label = `${pattern} on ${JSON.stringify(text)}`
    expect.soft(await noticeOf(nullpad), `${label}: no notice`).toBe('')
    expect
      .soft(await nullpad.status(), `${label}: lands on the match`)
      .toMatchObject({ line: 2, column })
  }
})

test('a collection with \\n is refused as typed and \\s there is a backslash or s', async ({
  nullpad,
}) => {
  await begin(nullpad, 'zzz\nx y')
  await play(nullpad, '/[\\n]<CR>')
  expect(await noticeOf(nullpad), 'the notice').toBe(
    'not supported in a search: [\\n]',
  )
  await play(nullpad, '/[\\s]<CR>')
  expect(await noticeOf(nullpad), 'the space is not a match').toBe(
    'E486: Pattern not found: [\\s]',
  )
})

const noteD = 'two\nx\ntwo\ny\ntwo'

const countRows: ReadonlyArray<
  readonly [
    text: string,
    at: readonly [number, number],
    keys: string,
    line: number,
    column: number,
    notice: string,
  ]
> = [
  [
    noteD,
    [1, 1],
    '9999999/two<CR>',
    1,
    1,
    'search hit BOTTOM, continuing at TOP',
  ],
  [
    noteD,
    [1, 1],
    '/two<CR>9999999n',
    3,
    1,
    'search hit BOTTOM, continuing at TOP',
  ],
  [
    noteD,
    [3, 1],
    '/two<CR>9999999N',
    5,
    1,
    'search hit TOP, continuing at BOTTOM',
  ],
  [
    'a two\ntwo b two\nc',
    [1, 1],
    '1000000?two<CR>',
    2,
    7,
    'search hit TOP, continuing at BOTTOM',
  ],
  [
    noteD,
    [1, 1],
    '/two/e<CR>10n',
    3,
    3,
    'search hit BOTTOM, continuing at TOP',
  ],
  [
    'one\ntwo\nthree\ntwo2',
    [1, 1],
    '7/two/-1<CR>',
    1,
    1,
    'search hit BOTTOM, continuing at TOP',
  ],
]

test('a count that wraps many times lands and warns as Vim does', async ({
  nullpad,
}) => {
  for (const [text, at, keys, line, column, notice] of countRows) {
    await begin(nullpad, text, at)
    await play(nullpad, keys)
    expect
      .soft(await nullpad.status(), `${keys}: cursor`)
      .toMatchObject({ line, column })
    expect.soft(await noticeOf(nullpad), `${keys}: notice`).toBe(notice)
  }
})

test('9999999/line on a note where every line matches answers at once', async ({
  nullpad,
}) => {
  test.setTimeout(30_000)
  await begin(nullpad, 'q')
  await play(nullpad, 'i')
  await nullpad.paste(
    Array.from(
      { length: 60_000 },
      (_, index) => `line ${index + 1} é😀 text`,
    ).join('\n'),
  )
  await play(nullpad, '<Esc>gg0/')
  await nullpad.page.keyboard.insertText('line')
  const started = Date.now()
  await nullpad.page.keyboard.press('Enter')
  await play(nullpad, '9999999n')
  await nullpad.page.locator('.status .notice').waitFor({ timeout: 25_000 })
  expect(
    Date.now() - started,
    'milliseconds for the search and the count',
  ).toBeLessThan(3000)
  expect(await nullpad.status(), 'cursor').toMatchObject({
    line: 40001,
    column: 1,
  })
})

test('a long prompt in a narrow window keeps its / and its cursor in view', async ({
  nullpad,
}) => {
  await nullpad.resize(400, 600)
  await begin(nullpad, noteB)
  await play(nullpad, '/')
  await nullpad.page.keyboard.insertText('long '.repeat(30))
  await settle(nullpad.page)
  const rects = await nullpad.page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect === undefined
        ? null
        : { left: rect.left, right: rect.right, width: rect.width }
    }
    return {
      prompt: box('.status .prompt'),
      lead: box('.status .prompt-lead'),
      caret: box('.status .prompt-caret'),
    }
  })
  expect(rects.prompt, 'the prompt is drawn').not.toBeNull()
  expect(rects.lead?.left, 'the / is at the left edge of the prompt').toBe(
    rects.prompt?.left,
  )
  expect(
    rects.caret?.right ?? Infinity,
    'the cursor is inside the prompt',
  ).toBeLessThanOrEqual((rects.prompt?.right ?? 0) + 0.5)
  expect(await promptOf(nullpad), 'the text is all there').toBe(
    `/${'long '.repeat(30)}`,
  )
})
