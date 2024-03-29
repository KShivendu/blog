import { NextResponse, NextRequest } from 'next/server'

export async function middleware(req, ev) {
  const { pathname } = req.nextUrl
  if (pathname == '/resume' || pathname == '/cv' || pathname == '/resume-pdf') {
    return NextResponse.redirect('/static/KumarShivendu_CV.pdf')
  }
  if (pathname == '/bio' || pathname == '/me') {
    return NextResponse.redirect('/about')
  }
  if (pathname == '/twitter' || pathname == '/x') {
    return NextResponse.redirect('https://twitter.com/KShivendu_')
  }
  if (pathname == '/github' || pathname == '/gh') {
    return NextResponse.redirect('https://github.com/KShivendu')
  }
  if (pathname == '/linkedin') {
    return NextResponse.redirect('https://www.linkedin.com/in/kshivendu')
  }
  if (pathname == '/talks') {
    return NextResponse.redirect('https://kshivendu.github.io/talks')
  }
  if (pathname == '/iitbh-sheet') {
    return NextResponse.redirect('https://cutt.ly/Xwiam6Vz')
  }
  if (pathname == '/301') {
    // 301 is permanent redirect
    return NextResponse.redirect('/about', 301)
  }
  if (pathname == '/302') {
    // 302 is temporary redirect
    return NextResponse.redirect('/about', 302)
  }
  if (pathname.startsWith('/b/')) {
    return NextResponse.redirect(pathname.replace('/b/', '/blog/'))
  }

  return NextResponse.next()
}
