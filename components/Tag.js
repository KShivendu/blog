import Link from 'next/link'
import kebabCase from '@/lib/utils/kebabCase'

const Tag = ({ text }) => {
  return (
    <Link href={`/tags/${kebabCase(text)}`}>
      <a className="mr-2 inline-block border border-[color:var(--tty-border)] px-2 py-0.5 text-sm font-medium text-primary-500 transition-colors hover:border-primary-500 hover:bg-[color:var(--tty-row-hover)] hover:text-primary-600 dark:hover:border-primary-400 dark:hover:text-primary-400">
        <span className="text-gray-400 dark:text-gray-500">#</span>
        {text.split(' ').join('-')}
      </a>
    </Link>
  )
}

export default Tag
