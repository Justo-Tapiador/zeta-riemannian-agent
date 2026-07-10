// zeta-riemannian-agent v1.0 — read-only file server for research/*
//
// Serves .tex and .pdf artifacts from the local research/ archive so the
// UI can deep-link to them. The path is validated to be inside research/.

import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';

const RESEARCH_ROOT = path.join(process.cwd(), 'research');

function isSafePath(relPath: string): boolean {
  const abs = path.resolve(RESEARCH_ROOT, relPath);
  // Ensure the resolved path is still inside RESEARCH_ROOT.
  return abs.startsWith(RESEARCH_ROOT + path.sep) || abs === RESEARCH_ROOT;
}

export async function GET(req: NextRequest) {
  const relParam = req.nextUrl.searchParams.get('path');
  if (!relParam) {
    return NextResponse.json({ error: 'missing path' }, { status: 400 });
  }
  if (!isSafePath(relParam)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const abs = path.resolve(RESEARCH_ROOT, relParam);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  const contentType =
    ext === '.pdf' ? 'application/pdf' :
    ext === '.tex' ? 'application/x-tex' :
    ext === '.json' ? 'application/json' :
    ext === '.md' ? 'text/markdown' :
    'text/plain';
  const stream = createReadStream(abs);
  // @ts-expect-error Node stream -> web stream
  const webStream = Readable.toWeb(stream);
  return new NextResponse(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(abs)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
