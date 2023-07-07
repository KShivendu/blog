import { NextResponse, NextRequest } from 'next/server'

export async function middleware(req, ev) {
  const { pathname } = req.nextUrl
  if (pathname == '/resume' || pathname == '/cv' || pathname == '/resume-pdf') {
    return NextResponse.redirect('/static/KumarShivendu_CV.pdf')
  }
  if (pathname == '/bio' || pathname == '/me') {
    return NextResponse.redirect('/about')
  }
  return NextResponse.next()
}
