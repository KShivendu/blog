import { NextResponse, NextRequest } from 'next/server'

export async function middleware(req, ev) {
  const { pathname } = req.nextUrl
  if (pathname == '/resume' || pathname == '/cv' || pathname == '/resume-pdf') {
    return NextResponse.redirect('/static/KumarShivendu_CV.pdf')
  }
  if (pathname == '/bio' || pathname == '/me') {
    return NextResponse.redirect('/about')
  }
  if (pathname == '/twitter') {
    return NextResponse.redirect('https://twitter.com/KShivendu_')
  }
  if (pathname == '/github' || pathname == '/gh') {
    return NextResponse.redirect('https://github.com/KShivendu')
  }
  if (pathname == '/linkedin') {
    return NextResponse.redirect('https://www.linkedin.com/in/kshivendu/')
  }

  return NextResponse.next()
}
