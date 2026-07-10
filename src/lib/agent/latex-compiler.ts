// zeta-riemannian-agent v1.0 — LaTeX compiler (tectonic wrapper)
//
// Compiles a .tex source into PDF using the `tectonic` engine (modern,
// self-contained XeTeX-based compiler). Falls back gracefully if tectonic
// is not present in the runtime — the .tex file is still written so the
// document is recoverable and human-compilable.

import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { emit } from './logger';

export interface CompileResult {
  ok: boolean;
  pdfPath: string | null;
  log: string;
  durationMs: number;
}

export function isTectonicAvailable(): boolean {
  try {
    execSync('which tectonic', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function compileTex(
  texSource: string,
  outDir: string,
  jobName: string
): Promise<CompileResult> {
  const start = Date.now();
  mkdirSync(outDir, { recursive: true });
  const texPath = path.join(outDir, `${jobName}.tex`);
  writeFileSync(texPath, texSource, 'utf8');
  emit('doc-written', `wrote ${texPath}`, { payload: { path: texPath } });

  if (!isTectonicAvailable()) {
    return {
      ok: false,
      pdfPath: null,
      log: 'tectonic not available — only .tex written',
      durationMs: Date.now() - start,
    };
  }

  return new Promise<CompileResult>((resolve) => {
    const proc = spawn(
      'tectonic',
      ['-X', 'compile', '--keep-logs', '--outdir', outDir, texPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (out += d.toString()));
    proc.on('error', (err) => {
      emit('error', `tectonic spawn error: ${err.message}`, { level: 'warn' });
      resolve({
        ok: false,
        pdfPath: null,
        log: out + '\n[spawn error] ' + err.message,
        durationMs: Date.now() - start,
      });
    });
    proc.on('close', (code) => {
      const pdfPath = path.join(outDir, `${jobName}.pdf`);
      const ok = code === 0 && existsSync(pdfPath);
      if (ok) {
        emit('pdf-compiled', `compiled ${pdfPath}`, { payload: { pdfPath } });
      } else {
        emit('error', `tectonic exit ${code} for ${jobName}`, { level: 'warn' });
      }
      resolve({
        ok,
        pdfPath: ok ? pdfPath : null,
        log: out,
        durationMs: Date.now() - start,
      });
    });
  });
}
