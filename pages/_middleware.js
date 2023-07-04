import { NextResponse, NextRequest } from 'next/server'

export async function middleware(req, ev) {
  const { pathname } = req.nextUrl
  if (pathname == '/resume' || pathname == '/cv') {
    return NextResponse.redirect('/static/KumarShivendu_CV.pdf')
  }
  return NextResponse.next()
}
