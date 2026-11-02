export interface IndexedSearchDocument {
  path: string;
  name: string;
  mtimeMs?: number;
  sizeBytes?: number;
}

export interface TextSearchSnapshot {
  version: 1;
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
    this.resultCache.clear();
  }

  setDocument(
    path: string,
    name: string,
    content: string,
    mtimeMs?: number,
    sizeBytes?: number,
  ): void {
    this.removeDocument(path);

    this.documents.set(path, { path, name, mtimeMs, sizeBytes });
    this.addPostings(this.trigrams, normalizeSearchText(content), 3, path);
    this.addPostings(this.bigrams, normalizeSearchText(content), 2, path);

    const normalizedName = normalizeSearchText(name);
    this.addPostings(this.nameTrigrams, normalizedName, 3, path);
    this.addPostings(this.nameBigrams, normalizedName, 2, path);
  }

  removeDocument(path: string): void {
    this.removeFromPostings(this.trigrams, path);
    this.removeFromPostings(this.bigrams, path);
    this.removeFromPostings(this.nameTrigrams, path);
    this.removeFromPostings(this.nameBigrams, path);
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
      version: 1,
      documents: Array.from(this.documents.values()).map((document) => ({ ...document })),
      trigrams: serializePostings(this.trigrams),
      bigrams: serializePostings(this.bigrams),
      nameTrigrams: serializePostings(this.nameTrigrams),
      nameBigrams: serializePostings(this.nameBigrams),
      queryCache: [],
    };
  }

  restoreSnapshot(snapshot: TextSearchSnapshot): void {
    if (!snapshot || snapshot.version !== 1) {
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
      const oldestKey = this.resultCache.keys().next().value as
        | string
        | undefined;
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

    const terms = normalizedQuery.split(" ");
    let contentCandidates: Set<string> | null = null;

    for (const term of terms) {
      if (term.length >= 3) {
        const matches = this.intersectPostings(this.trigrams, term, 3);
        contentCandidates =
          contentCandidates === null
            ? matches
            : this.intersectSets(contentCandidates, matches);
      } else if (term.length === 2) {
        const matches = this.intersectPostings(this.bigrams, term, 2);
        contentCandidates =
          contentCandidates === null
            ? matches
            : this.intersectSets(contentCandidates, matches);
      }
    }

    if (contentCandidates === null) {
      contentCandidates = new Set(this.documents.keys());
    }

    let nameCandidates = new Set<string>();
    if (normalizedQuery.length >= 3) {
      nameCandidates = this.intersectPostings(
        this.nameTrigrams,
        normalizedQuery,
        3,
      );
    } else if (normalizedQuery.length === 2) {
      nameCandidates = this.intersectPostings(
        this.nameBigrams,
        normalizedQuery,
        2,
      );
    } else {
      for (const [path, document] of this.documents) {
        if (normalizeSearchText(document.name).includes(normalizedQuery)) {
          nameCandidates.add(path);
        }
      }
    }

    const candidates = new Set<string>();
    for (const path of contentCandidates) {
      candidates.add(path);
    }
    for (const path of nameCandidates) {
      candidates.add(path);
    }

    return Array.from(candidates).slice(0, Math.max(1, limit));
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
}

function serializePostings(
  postings: Map<string, Set<string>>,
): Array<[string, string[]]> {
  return Array.from(postings, ([gram, paths]) => [gram, Array.from(paths)]);
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

  return content
    .split(/\r?\n/)
    .filter((line) => normalizeSearchText(line).includes(normalizedQuery))
    .slice(0, Math.max(1, limit))
    .map((line) => line.trim().slice(0, 500));
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
