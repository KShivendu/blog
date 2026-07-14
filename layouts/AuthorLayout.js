import Image from '@/components/Image'
import Link from '@/components/Link'
import { PageSEO } from '@/components/SEO'

// Strip protocol / trailing slash so a link reads as a terminal-style handle.
const handle = (url) => (url ? url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '')

export default function AuthorLayout({ children, frontMatter }) {
  const { name, avatar, occupation, company, email, twitter, linkedin, github } = frontMatter

  const contact = [
    github && { key: 'github', href: github, label: handle(github) },
    twitter && { key: 'twitter', href: twitter, label: `@${handle(twitter).split('/').pop()}` },
    linkedin && { key: 'linkedin', href: linkedin, label: handle(linkedin) },
    email && { key: 'email', href: `mailto:${email}`, label: email },
    { key: 'resume', href: '/resume-pdf', label: 'resume-pdf' },
  ].filter(Boolean)

  return (
    <>
      <PageSEO title={`About - ${name}`} description={`About me - ${name}`} />
      <div className="pt-6 pb-10">
        <div className="tty-frame tty-article">
          <span className="tty-frame-path" aria-hidden="true">
            about.md
          </span>

          <header className="tty-article-head">
            <div className="tty-profile">
              <div className="tty-avatar">
                <Image src={avatar} alt={name} width={132} height={132} className="h-28 w-28" />
              </div>
              <div className="tty-profile-body">
                <h1 className="tty-profile-name">{name}</h1>
                <p className="tty-profile-role">
                  {occupation}
                  <span className="at" aria-hidden="true">
                    @
                  </span>
                  {company}
                </p>
                <dl className="tty-kv">
                  {contact.map(({ key, href, label }) => (
                    <div key={key} className="contents">
                      <dt>{key}</dt>
                      <dd>
                        <Link href={href}>{label}</Link>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </header>

          <div className="prose-tty prose max-w-none pt-10 pb-2 dark:prose-dark">{children}</div>
        </div>
      </div>
    </>
  )
}
