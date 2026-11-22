import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'

const budget = Number(readFileSync('scripts/comment-budget.txt', 'utf8'))

const files = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '*.ts',
    '*.mts',
    '*.cts',
    ':!repos',
  ],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)

const counts = files
  .map(file => ({
    file,
    comments: parseSync(file, readFileSync(file, 'utf8')).comments.length,
  }))
  .filter(({ comments }) => comments > 0)
  .sort((a, b) => b.comments - a.comments)

const total = counts.reduce((sum, { comments }) => sum + comments, 0)

if (total !== budget) {
  const verdict =
    total > budget
      ? `The TypeScript files hold ${total} comments, over the budget of ${budget}. Delete comments the code can say with a better name. A comment that states a fact we cannot change, such as a browser rule, may raise the budget in scripts/comment-budget.txt.`
      : `The TypeScript files hold ${total} comments, under the budget of ${budget}. Lower scripts/comment-budget.txt to ${total} so the budget keeps up.`
  console.log(verdict)
  counts.forEach(({ file, comments }) =>
    console.log(`${String(comments).padStart(4)} ${file}`),
  )
  process.exit(1)
}
