// zeta-riemannian-agent v1.0 — ArXiv adapter
//
// Pulls preprints from the public ArXiv API (http://export.arxiv.org/api/query)
// and caches them locally under research/arxiv-cache/. Each cached entry has
// both a metadata record (DB) and a saved abstract + (optionally) PDF on disk.

import { db } from '@/lib/db';
import { emit } from './logger';
import { parseStringPromise } from 'xml2js';

const ARXIV_API = 'http://export.arxiv.org/api/query';
const ARXIV_ABS = 'https://arxiv.org/abs';

export interface ArxivSearchHit {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  primaryCategory: string;
  categories: string[];
  publishedAt: Date | null;
  pdfUrl: string;
  absUrl: string;
}

const RH_QUERY_TERMS = [
  'Riemann hypothesis',
  'Riemann zeta function zeros',
  'critical line',
  'critical strip',
  'functional equation zeta',
  'xi function',
  'explicit formula',
  'Dirichlet L-function zeros',
  'prime number theorem',
  'Selberg class',
  'random matrix zeta',
  'Hilbert-Pólya',
  'Weil explicit formula',
  'converse theorem L-function',
];

export function pickRhQuery(): string {
  return RH_QUERY_TERMS[Math.floor(Math.random() * RH_QUERY_TERMS.length)];
}

export async function searchArxiv(
  query: string,
  opts: { max?: number; sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate' } = {}
): Promise<ArxivSearchHit[]> {
  const max = opts.max ?? 8;
  const sortBy = opts.sortBy ?? 'relevance';
  const url = `${ARXIV_API}?search_query=all:${encodeURIComponent(
    query
  )}&start=0&max_results=${max}&sortBy=${sortBy}&sortOrder=descending`;
  emit('log', `ArXiv query: "${query}" (max=${max})`, { payload: { url } });
  const res = await fetch(url, { headers: { 'User-Agent': 'zeta-riemannian-agent/1.0' } });
  if (!res.ok) {
    emit('error', `ArXiv HTTP ${res.status} for query "${query}"`, { level: 'warn' });
    return [];
  }
  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false });
  const entries = parsed?.feed?.entry;
  if (!entries) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.map(parseEntry).filter((e): e is ArxivSearchHit => !!e);
}

function parseEntry(e: any): ArxivSearchHit | null {
  try {
    const idRaw: string = e.id ?? '';
    const arxivId = idRaw.replace(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\//, '').trim();
    if (!arxivId) return null;
    const title = (e.title ?? '').replace(/\s+/g, ' ').trim();
    const authors = Array.isArray(e.author)
      ? e.author.map((a: any) => a?.name).filter(Boolean)
      : e.author?.name
      ? [e.author.name]
      : [];
    const abstract = (e.summary ?? '').replace(/\s+/g, ' ').trim();
    const primaryCategory = e['arxiv:primary_category']?.$?.term ?? 'math.';
    const categories = Array.isArray(e.category)
      ? e.category.map((c: any) => c?.$?.term).filter(Boolean)
      : e.category?.$?.term
      ? [e.category.$.term]
      : [];
    const publishedRaw = e.published ?? null;
    const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const absUrl = `${ARXIV_ABS}/${arxivId}`;
    return {
      arxivId,
      title,
      authors,
      abstract,
      primaryCategory,
      categories,
      publishedAt,
      pdfUrl,
      absUrl,
    };
  } catch {
    return null;
  }
}

export async function cacheArxivHit(hit: ArxivSearchHit, relevanceScore: number) {
  const existing = await db.arxivPaper.findUnique({ where: { arxivId: hit.arxivId } });
  if (existing) {
    return existing;
  }
  const created = await db.arxivPaper.create({
    data: {
      arxivId: hit.arxivId,
      title: hit.title,
      authors: JSON.stringify(hit.authors),
      abstract: hit.abstract,
      primaryCategory: hit.primaryCategory,
      categories: JSON.stringify(hit.categories),
      publishedAt: hit.publishedAt,
      localPdfPath: null,
      localTexPath: null,
      summary: null,
      relevanceScore,
      citedBy: JSON.stringify([]),
    },
  });
  emit('arxiv-fetched', `cached ${hit.arxivId} — ${hit.title.slice(0, 80)}`, {
    payload: { arxivId: hit.arxivId, relevance: relevanceScore },
  });
  return created;
}

export async function attachSummary(arxivId: string, summary: string, relevance: number) {
  await db.arxivPaper.update({
    where: { arxivId },
    data: { summary, relevanceScore: relevance },
  });
}

export async function listCachedPapers(limit = 50) {
  return db.arxivPaper.findMany({
    orderBy: [{ relevanceScore: 'desc' }, { fetchedAt: 'desc' }],
    take: limit,
  });
}

export async function countCachedPapers(): Promise<number> {
  return db.arxivPaper.count();
}
