export interface IndexedSearchDocument {
  path: string;
  name: string;
  mtimeMs?: number;
  sizeBytes?: number;
}

export interface TextSearchSnapshot {
  version: 3;
  documents: Array<{
    path: string;
    name: string;
    mtimeMs?: number;
    sizeBytes?: number;
  }>;
  trigrams: Array<[string, string[]]>;
  bigrams: Array<[string, string[]]>;
  nameTrigrams: Array<[string, string[]]>;
  nameBigrams: Array<[string, string[]]>;
  termPostings: Array<[string, Array<[string, number]>]>;
  documentLengths: Array<[string, number]>;
  nameTermPostings: Array<[string, Array<[string, number]>]>;
  nameDocumentLengths: Array<[string, number]>;
  queryCache: Array<{
    key: string;
    expiresAt: number;
    results: unknown[];
  }>;
}

export class TextSearchIndex {
  private readonly documents = new Map<string, IndexedSearchDocument>();
  private readonly trigrams = new Map<string, Set<string>>();
  private readonly bigrams = new Map<string, Set<string>>();
  private readonly nameTrigrams = new Map<string, Set<string>>();
  private readonly nameBigrams = new Map<string, Set<string>>();
  private readonly termPostings = new Map<string, Map<string, number>>();
  private readonly documentLengths = new Map<string, number>();
  private readonly nameTermPostings = new Map<string, Map<string, number>>();
  private readonly nameDocumentLengths = new Map<string, number>();
  private readonly resultCache = new Map<
    string,
    { expiresAt: number; results: unknown[] }
  >();

  clear(): void {
    this.documents.clear();
    this.trigrams.clear();
    this.bigrams.clear();
    this.nameTrigrams.clear();
    this.nameBigrams.clear();
    this.termPostings.clear();
    this.documentLengths.clear();
    this.nameTermPostings.clear();
    this.nameDocumentLengths.clear();
    this.resultCache.clear();
  }

  setDocument(
    path: string,
    name: string,
    content: string,
    mtimeMs?: number,
    sizeBytes?: number,
  ): void {
    if (this.documents.has(path)) {
      this.removeDocument(path);
    }

    this.documents.set(path, { path, name, mtimeMs, sizeBytes });
    const normalizedContent = normalizeSearchText(content);
    const normalizedName = normalizeSearchText(name);

    const terms = tokenize(normalizedContent);
    this.addTokenPostings(this.trigrams, terms, path);
    const termCounts = countTerms(terms);
    this.documentLengths.set(path, terms.length);
    for (const [term, frequency] of termCounts) {
      let posting = this.termPostings.get(term);
      if (!posting) {
        posting = new Map();
        this.termPostings.set(term, posting);
      }
      posting.set(path, frequency);
    }

    const nameTerms = tokenize(normalizedName);
    this.addTokenPostings(this.nameTrigrams, nameTerms, path);
    const nameTermCounts = countTerms(nameTerms);
    this.nameDocumentLengths.set(path, nameTerms.length);
    for (const [term, frequency] of nameTermCounts) {
      let posting = this.nameTermPostings.get(term);
      if (!posting) {
        posting = new Map();
        this.nameTermPostings.set(term, posting);
      }
      posting.set(path, frequency);
    }
  }

  removeDocument(path: string): void {
    this.removeFromPostings(this.trigrams, path);
    this.removeFromPostings(this.bigrams, path);
    this.removeFromPostings(this.nameTrigrams, path);
    this.removeFromPostings(this.nameBigrams, path);
    this.removeTermPostings(this.termPostings, path);
    this.removeTermPostings(this.nameTermPostings, path);
    this.documentLengths.delete(path);
    this.nameDocumentLengths.delete(path);
    this.documents.delete(path);
    this.clearResultCache();
  }

  getDocument(path: string): IndexedSearchDocument | undefined {
    return this.documents.get(path);
  }

  getDocumentCount(): number {
    return this.documents.size;
  }

  getDocumentPaths(): string[] {
    return Array.from(this.documents.keys());
  }

  toSnapshot(): TextSearchSnapshot {
    return {
      version: 3,
      documents: Array.from(this.documents.values()).map((document) => ({ ...document })),
      trigrams: [],
      bigrams: [],
      nameTrigrams: [],
      nameBigrams: [],
      termPostings: serializeTermPostings(this.termPostings),
      documentLengths: Array.from(this.documentLengths),
      nameTermPostings: serializeTermPostings(this.nameTermPostings),
      nameDocumentLengths: Array.from(this.nameDocumentLengths),
      queryCache: Array.from(this.resultCache)
        .filter(([, entry]) => entry.expiresAt > Date.now())
        .slice(0, 128)
        .map(([key, entry]) => ({
          key,
          expiresAt: entry.expiresAt,
          results: entry.results,
        })),
    };
  }

  restoreSnapshot(snapshot: TextSearchSnapshot): void {
    if (!snapshot || snapshot.version !== 3) {
      return;
    }

    this.clear();

    if (!Array.isArray(snapshot.documents)) {
      return;
    }

    const allowedPaths = new Set<string>();
    for (const document of snapshot.documents ?? []) {
      if (
        typeof document.path !== "string" ||
        typeof document.name !== "string" ||
        !isSafeIndexedPath(document.path)
      ) {
        continue;
      }
      if (
        (document.mtimeMs !== undefined &&
          (typeof document.mtimeMs !== "number" ||
            !Number.isFinite(document.mtimeMs))) ||
        (document.sizeBytes !== undefined &&
          (typeof document.sizeBytes !== "number" ||
            !Number.isFinite(document.sizeBytes)))
      ) {
        continue;
      }
      this.documents.set(document.path, { ...document });
      allowedPaths.add(document.path);
    }

    restorePostings(this.trigrams, snapshot.trigrams, allowedPaths, 3);
    restorePostings(this.bigrams, snapshot.bigrams, allowedPaths, 2);
    restorePostings(this.nameTrigrams, snapshot.nameTrigrams, allowedPaths, 3);
    restorePostings(this.nameBigrams, snapshot.nameBigrams, allowedPaths, 2);
    restoreTermPostings(
      this.termPostings,
      snapshot.termPostings,
      allowedPaths,
    );
    restoreDocumentLengths(
      this.documentLengths,
      snapshot.documentLengths,
      allowedPaths,
    );
    restoreTermPostings(
      this.nameTermPostings,
      snapshot.nameTermPostings,
      allowedPaths,
    );
    restoreDocumentLengths(
      this.nameDocumentLengths,
      snapshot.nameDocumentLengths,
      allowedPaths,
    );
    for (const entry of snapshot.queryCache ?? []) {
      if (
        entry
        && typeof entry.key === "string"
        && typeof entry.expiresAt === "number"
        && Number.isFinite(entry.expiresAt)
        && entry.expiresAt > Date.now()
        && Array.isArray(entry.results)
      ) {
        const safeResults = entry.results.filter((result) => {
          if (typeof result !== "object" || result === null) {
            return false;
          }
          const pathValue = (result as { path?: unknown }).path;
          return typeof pathValue !== "string"
            || (isSafeIndexedPath(pathValue) && allowedPaths.has(pathValue));
        });
        if (safeResults.length !== entry.results.length) {
          continue;
        }
        this.resultCache.set(entry.key, {
          expiresAt: entry.expiresAt,
          results: safeResults,
        });
      }
    }
  }

  getCachedResults<T>(key: string): T[] | undefined {
    const entry = this.resultCache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.resultCache.delete(key);
      return undefined;
    }

    this.resultCache.delete(key);
    this.resultCache.set(key, entry);
    return entry.results as T[];
  }

  setCachedResults<T>(
    key: string,
    results: T[],
    ttlMs: number = 60_000,
  ): void {
    this.resultCache.delete(key);
    this.resultCache.set(key, {
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
      results,
    });

    while (this.resultCache.size > 128) {
      const oldestKey = this.resultCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.resultCache.delete(oldestKey);
    }
  }

  clearResultCache(): void {
    this.resultCache.clear();
  }

  findCandidates(query: string, limit: number = 100): string[] {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery === "") {
      return [];
    }

    const terms = Array.from(new Set(tokenize(normalizedQuery)));
    if (terms.length === 0) {
      return [];
    }

    const candidates = new Set<string>();
    for (const term of terms) {
      for (const path of this.termPostings.get(term)?.keys() ?? []) {
        candidates.add(path);
      }
      for (const path of this.nameTermPostings.get(term)?.keys() ?? []) {
        candidates.add(path);
      }
    }

    if (candidates.size === 0) {
      for (const term of terms) {
        const gramMatches = term.length >= 3
          ? this.intersectPostings(this.trigrams, term, 3)
          : term.length === 2
            ? this.intersectPostings(this.bigrams, term, 2)
            : new Set<string>();
        for (const path of gramMatches) {
          candidates.add(path);
        }
      }
    }

    if (candidates.size === 0) {
      for (const [path, document] of this.documents) {
        if (normalizeSearchText(document.name).includes(normalizedQuery)) {
          candidates.add(path);
        }
      }
    }

    return this.rankCandidates(normalizedQuery, candidates, limit);
  }

  rankCandidates(
    query: string,
    candidates: Iterable<string>,
    limit: number = 100,
  ): string[] {
    const normalizedQuery = normalizeSearchText(query);
    const terms = Array.from(new Set(tokenize(normalizedQuery)));
    if (terms.length === 0) {
      return Array.from(candidates).slice(0, Math.max(1, limit));
    }

    const documentCount = this.documents.size;
    let averageDocumentLength = 0;
    for (const length of this.documentLengths.values()) {
      averageDocumentLength += length;
    }
    averageDocumentLength = documentCount > 0
      ? averageDocumentLength / documentCount
      : 0;

    let averageNameLength = 0;
    for (const length of this.nameDocumentLengths.values()) {
      averageNameLength += length;
    }
    averageNameLength = this.documents.size > 0
      ? averageNameLength / this.documents.size
      : 0;

    const top: Array<{ path: string; score: number }> = [];
    const maxResults = Math.max(1, limit);
    for (const path of candidates) {
      let score = 0;
      const document = this.documents.get(path);
      if (document) {
        const normalizedName = normalizeSearchText(document.name);
        if (normalizedName === normalizedQuery) {
          score += 8;
        } else if (normalizedName.includes(normalizedQuery)) {
          score += 5;
        }
      }

      for (const term of terms) {
        const contentPosting = this.termPostings.get(term);
        const termFrequency = contentPosting?.get(path) ?? 0;
        if (termFrequency > 0) {
          const documentFrequency = contentPosting?.size ?? 0;
          const inverseDocumentFrequency = Math.log(
            1 + (
              (documentCount - documentFrequency + 0.5)
              / (documentFrequency + 0.5)
            ),
          );
          const documentLength = this.documentLengths.get(path) ?? 0;
          const normalizedLength =
            documentLength / Math.max(averageDocumentLength, 1);
          const frequencyScore =
            (termFrequency * (1.2 + 1))
            / (termFrequency + 1.2 * (1 - 0.75 + 0.75 * normalizedLength));
          score += inverseDocumentFrequency * frequencyScore;
        }

        const namePosting = this.nameTermPostings.get(term);
        const nameFrequency = namePosting?.get(path) ?? 0;
        if (nameFrequency > 0) {
          const nameDocumentFrequency = namePosting?.size ?? 0;
          const nameInverseDocumentFrequency = Math.log(
            1 + (
              (documentCount - nameDocumentFrequency + 0.5)
              / (nameDocumentFrequency + 0.5)
            ),
          );
          const nameLength = this.nameDocumentLengths.get(path) ?? 0;
          const normalizedNameLength =
            nameLength / Math.max(averageNameLength, 1);
          const nameFrequencyScore =
            (nameFrequency * (1.2 + 1))
            / (
              nameFrequency
              + 1.2 * (1 - 0.75 + 0.75 * normalizedNameLength)
            );
          score += 3 * nameInverseDocumentFrequency * nameFrequencyScore;
        }
      }

      insertTopResult(top, { path, score }, maxResults);
    }

    top.sort((left, right) =>
      right.score - left.score
      || left.path.localeCompare(right.path),
    );
    return top.map((entry) => entry.path);
  }

  private addPostings(
    index: Map<string, Set<string>>,
    text: string,
    gramLength: number,
    path: string,
  ): void {
    for (const gram of createGrams(text, gramLength)) {
      let paths = index.get(gram);
      if (!paths) {
        paths = new Set<string>();
        index.set(gram, paths);
      }
      paths.add(path);
    }
  }

  private addTokenPostings(
    index: Map<string, Set<string>>,
    terms: string[],
    path: string,
  ): void {
    const grams = new Set<string>();
    for (const term of terms) {
      if (term.length < 3) {
        continue;
      }
      for (const gram of createGrams(term, 3)) {
        grams.add(gram);
      }
    }
    for (const gram of grams) {
      let paths = index.get(gram);
      if (!paths) {
        paths = new Set<string>();
        index.set(gram, paths);
      }
      paths.add(path);
    }
  }

  private intersectPostings(
    index: Map<string, Set<string>>,
    text: string,
    gramLength: number,
  ): Set<string> {
    let result: Set<string> | null = null;

    for (const gram of createGrams(text, gramLength)) {
      const matches = index.get(gram);
      if (!matches) {
        return new Set();
      }
      result =
        result === null
          ? new Set(matches)
          : this.intersectSets(result, matches);
    }

    return result ?? new Set();
  }

  private intersectSets(left: Set<string>, right: Set<string>): Set<string> {
    const smaller = left.size <= right.size ? left : right;
    const larger = smaller === left ? right : left;
    const result = new Set<string>();

    for (const value of smaller) {
      if (larger.has(value)) {
        result.add(value);
      }
    }
    return result;
  }

  private removeFromPostings(
    index: Map<string, Set<string>>,
    path: string,
  ): void {
    for (const [gram, paths] of index) {
      paths.delete(path);
      if (paths.size === 0) {
        index.delete(gram);
      }
    }
  }

  private removeTermPostings(
    index: Map<string, Map<string, number>>,
    path: string,
  ): void {
    for (const [term, paths] of index) {
      paths.delete(path);
      if (paths.size === 0) {
        index.delete(term);
      }
    }
  }
}

function serializeTermPostings(
  postings: Map<string, Map<string, number>>,
): Array<[string, Array<[string, number]>]> {
  return Array.from(postings, ([term, paths]) =>
    [term, Array.from(paths)] as [string, Array<[string, number]>],
  );
}

function restorePostings(
  postings: Map<string, Set<string>>,
  snapshot: Array<[string, string[]]> | undefined,
  allowedPaths: Set<string>,
  gramLength: number,
): void {
  postings.clear();
  if (!Array.isArray(snapshot)) {
    return;
  }

  for (const entry of snapshot) {
    if (
      !Array.isArray(entry) ||
      typeof entry[0] !== "string" ||
      entry[0].length !== gramLength
    ) {
      continue;
    }
    const paths = Array.isArray(entry[1])
      ? entry[1].filter(
          (path): path is string =>
            typeof path === "string" &&
            isSafeIndexedPath(path) &&
            allowedPaths.has(path),
        )
      : [];
    if (paths.length > 0) {
      postings.set(entry[0], new Set(paths));
    }
  }
}

function restoreTermPostings(
  postings: Map<string, Map<string, number>>,
  snapshot: Array<[string, Array<[string, number]>]> | undefined,
  allowedPaths: Set<string>,
): void {
  postings.clear();
  if (!Array.isArray(snapshot)) {
    return;
  }

  for (const entry of snapshot) {
    if (
      !Array.isArray(entry)
      || typeof entry[0] !== "string"
      || !Array.isArray(entry[1])
    ) {
      continue;
    }
    const posting = new Map<string, number>();
    for (const item of entry[1]) {
      if (
        !Array.isArray(item)
        || typeof item[0] !== "string"
        || typeof item[1] !== "number"
        || !Number.isFinite(item[1])
        || item[1] < 1
        || !allowedPaths.has(item[0])
      ) {
        continue;
      }
      posting.set(item[0], item[1]);
    }
    if (posting.size > 0) {
      postings.set(entry[0], posting);
    }
  }
}

function restoreDocumentLengths(
  lengths: Map<string, number>,
  snapshot: Array<[string, number]> | undefined,
  allowedPaths: Set<string>,
): void {
  lengths.clear();
  if (!Array.isArray(snapshot)) {
    return;
  }

  for (const entry of snapshot) {
    if (
      !Array.isArray(entry)
      || typeof entry[0] !== "string"
      || typeof entry[1] !== "number"
      || !Number.isFinite(entry[1])
      || entry[1] < 0
      || !allowedPaths.has(entry[0])
    ) {
      continue;
    }
    lengths.set(entry[0], entry[1]);
  }
}

function isSafeIndexedPath(relativePath: string): boolean {
  const replaced = relativePath.replace(/\\/g, "/").trim();
  if (
    replaced === "" ||
    replaced !== relativePath ||
    replaced.startsWith("/") ||
    /^[A-Za-z]:\//.test(replaced)
  ) {
    return false;
  }

  const segments = replaced.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith("."),
    )
  ) {
    return false;
  }

  return /\.(md|txt)$/i.test(replaced);
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMatchingLines(
  content: string,
  query: string,
  limit: number = 3,
): string[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") {
    return [];
  }
  const terms = tokenize(normalizedQuery);

  const matches = content
    .split(/\r?\n/)
    .map((line) => {
      const normalizedLine = normalizeSearchText(line);
      let score = normalizedLine.includes(normalizedQuery) ? 100 : 0;
      for (const term of terms) {
        if (normalizedLine.includes(term)) {
          score += 10;
        }
      }
      return { line: line.trim().slice(0, 500), score };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((match) => match.line);

  return matches;
}

export function matchesSearchQuery(text: string, query: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedText === "" || normalizedQuery === "") {
    return false;
  }
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }
  return tokenize(normalizedQuery).some((term) => normalizedText.includes(term));
}

function createGrams(text: string, length: number): Set<string> {
  const grams = new Set<string>();
  if (text.length < length) {
    if (text.length > 0) {
      grams.add(text);
    }
    return grams;
  }

  for (let index = 0; index <= text.length - length; index += 1) {
    grams.add(text.slice(index, index + length));
  }
  return grams;
}

function tokenize(text: string): string[] {
  return normalizeSearchText(text).split(" ").filter((term) => term.length > 0);
}

function countTerms(terms: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

function insertTopResult(
  top: Array<{ path: string; score: number }>,
  result: { path: string; score: number },
  limit: number,
): void {
  let index = top.length;
  for (let candidateIndex = 0; candidateIndex < top.length; candidateIndex += 1) {
    const candidate = top[candidateIndex];
    if (!candidate) {
      continue;
    }
    if (
      result.score > candidate.score
      || (
        result.score === candidate.score
        && result.path.localeCompare(candidate.path) < 0
      )
    ) {
      index = candidateIndex;
      break;
    }
  }

  top.splice(index, 0, result);
  if (top.length > limit) {
    top.pop();
  }
}
