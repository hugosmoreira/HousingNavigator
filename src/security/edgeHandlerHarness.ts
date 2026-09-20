import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { vi } from 'vitest';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null; count?: number };
type Filter = { method: string; column: string; value: unknown };
export type Query = {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  values?: Row | Row[];
  columns?: string;
  filters: Filter[];
  order?: { column: string; ascending: boolean; nullsFirst: boolean };
};

/** A small stateful fake: reads and writes apply filters to actual fixture rows. */
export function fakeDatabase(initial: Record<string, Row[]> = {}) {
  const tables = structuredClone(initial);
  const queries: Query[] = [];
  const errors: Record<string, { message: string }> = {};
  const rpcResults: Record<string, Result> = {
    claim_admin_alert_invocation: { data: true, error: null },
    claim_waitlist_alert_send: { data: true, error: null },
  };
  const client = {
    auth: {
      getUser: vi.fn(async (_token: string) => ({
        data: { user: { id: 'admin-1' } as { id: string } | null },
        error: null as { message: string } | null,
      })),
    },
    rpc: vi.fn(async (name: string, _args: Row) => {
      if (!rpcResults[name]) throw new Error(`Unexpected fake RPC: ${name}`);
      return rpcResults[name];
    }),
    from: vi.fn((table: string) => {
      const query: Query = { table, operation: 'select', filters: [] };
      let single = false;
      let limit = Infinity;
      let result: Result | undefined;
      const execute = (): Result => {
        if (result) return result;
        queries.push(structuredClone(query));
        const error = errors[`${table}.${query.operation}`];
        if (error) return (result = { data: null, error });
        const rows = tables[table] ?? (tables[table] = []);
        const matching = rows.filter((row) => query.filters.every((filter) => {
          if (filter.method === 'eq') return row[filter.column] === filter.value;
          if (filter.method === 'in') return (filter.value as unknown[]).includes(row[filter.column]);
          if (filter.method === 'gte') return String(row[filter.column]) >= String(filter.value);
          if (filter.method === 'gt') return String(row[filter.column]) > String(filter.value);
          if (filter.method === 'isNullOrBefore') return row[filter.column] == null || String(row[filter.column]) < String(filter.value);
          throw new Error(`Unexpected fake query filter: ${filter.method}`);
        })).sort((a, b) => {
          if (!query.order) return 0;
          const { column, ascending, nullsFirst } = query.order;
          if (a[column] == null && b[column] == null) return 0;
          if (a[column] == null) return nullsFirst ? -1 : 1;
          if (b[column] == null) return nullsFirst ? 1 : -1;
          return String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1);
        }).slice(0, limit);
        if (query.operation === 'insert') {
          rows.push(...structuredClone(Array.isArray(query.values) ? query.values : [query.values!]));
        } else if (query.operation === 'update') {
          matching.forEach((row) => Object.assign(row, structuredClone(query.values)));
        } else if (query.operation === 'delete') {
          tables[table] = rows.filter((row) => !matching.includes(row));
        }
        return (result = {
          data: query.operation === 'select'
            ? structuredClone(single ? matching[0] ?? null : matching)
            : null,
          count: matching.length,
          error: null,
        });
      };
      const chain = {
        select(columns: string, _options?: unknown) { query.columns = columns; return chain; },
        insert(values: Row | Row[]) { query.operation = 'insert'; query.values = values; return chain; },
        update(values: Row) { query.operation = 'update'; query.values = values; return chain; },
        delete() { query.operation = 'delete'; return chain; },
        eq(column: string, value: unknown) { query.filters.push({ method: 'eq', column, value }); return chain; },
        in(column: string, value: unknown[]) { query.filters.push({ method: 'in', column, value }); return chain; },
        gte(column: string, value: unknown) { query.filters.push({ method: 'gte', column, value }); return chain; },
        gt(column: string, value: unknown) { query.filters.push({ method: 'gt', column, value }); return chain; },
        or(expression: string) {
          // Only the actual checker scheduling predicate is supported; fail on new syntax.
          const match = /^([a-z_]+)\.is\.null,\1\.lt\.(.+)$/.exec(expression);
          if (!match || !Number.isFinite(Date.parse(match[2]))) throw new Error(`Unexpected fake OR: ${expression}`);
          query.filters.push({ method: 'isNullOrBefore', column: match[1], value: match[2] });
          return chain;
        },
        order(column: string, options: { ascending: boolean; nullsFirst: boolean }) {
          query.order = { column, ...options };
          return chain;
        },
        limit(value: number) { limit = value; return chain; },
        maybeSingle() { single = true; return Promise.resolve(execute()); },
        then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve().then(execute).then(resolve, reject);
        },
      };
      return chain;
    }),
  };
  return { client, tables, queries, errors, rpcResults };
}

type HarnessOptions = {
  database?: ReturnType<typeof fakeDatabase>;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  resolveDns?: (hostname: string, type: 'A' | 'AAAA') => Promise<string[]>;
};

const functionsRoot = fileURLToPath(new URL('../../supabase/functions/', import.meta.url));
const transpiled = new Map<string, { source: string; output: string }>();

/**
 * Execute the checked-in, unmodified serve() entry point and its real local helpers.
 * Only external SDK/serve imports are substituted. The VM never receives process,
 * host require, real fetch, real DNS, or the developer's environment/credentials.
 * This is a deterministic Deno API adapter, not a security sandbox for hostile code.
 */
export function loadEdgeHandler(
  name: 'check-waitlist-status' | 'send-waitlist-alert' | 'unsubscribe-alerts',
  options: HarnessOptions = {},
) {
  const database = options.database ?? fakeDatabase();
  const fetchSpy = vi.fn(options.fetch ?? (async () => {
    throw new Error('Unexpected outbound request in isolated handler test');
  }));
  const resolveDns = vi.fn(options.resolveDns ?? (async () => {
    throw new Error('Unexpected DNS lookup in isolated handler test');
  }));
  const model = vi.fn(async (_request: unknown): Promise<unknown> => {
    throw new Error('Unexpected model request in isolated handler test');
  });
  const createClient = vi.fn(() => database.client);
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://database.example',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-for-handler-tests',
    INTERNAL_TRIGGER_SECRET: 'fake-internal-secret-for-handler-tests',
    ANTHROPIC_API_KEY: 'fake-anthropic-key-for-handler-tests',
    APP_URL: 'https://app.example',
    ...options.env,
  };
  let uuidCount = 0;
  const randomUUID = vi.fn(() => `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, '0')}`);
  const context = vm.createContext({
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    ReadableStream, AbortController, setTimeout, clearTimeout,
    fetch: fetchSpy,
    crypto: { subtle: webcrypto.subtle, randomUUID },
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    Deno: { env: { get: (key: string) => env[key] }, resolveDns },
  });
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const load = (filename: string): Record<string, unknown> => {
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const source = readFileSync(filename, 'utf8');
    let compiled = transpiled.get(filename);
    if (compiled?.source !== source) {
      compiled = {
        source,
        output: ts.transpileModule(source, {
          fileName: filename,
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        }).outputText,
      };
      transpiled.set(filename, compiled);
    }
    const module = { exports: {} as Record<string, unknown> };
    modules.set(filename, module);
    const requireFake = (specifier: string): unknown => {
      if (specifier === 'npm:@supabase/supabase-js@2') return { createClient };
      if (specifier === 'npm:@anthropic-ai/sdk') return class FakeAnthropic {
        messages = { create: model };
      };
      if (specifier === 'https://deno.land/std@0.224.0/http/server.ts') {
        return { serve: (callback: typeof handler) => { handler = callback; } };
      }
      if (specifier.startsWith('.')) {
        const localPath = path.resolve(path.dirname(filename), specifier);
        const relative = path.relative(functionsRoot, localPath);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !localPath.endsWith('.ts')) {
          throw new Error(`Unexpected local Edge Function import: ${specifier}`);
        }
        return load(localPath);
      }
      throw new Error(`Unexpected external Edge Function import: ${specifier}`);
    };
    const evaluate = new vm.Script(`(function(require, module, exports) {\n${compiled.output}\n})`, { filename });
    evaluate.runInContext(context)(requireFake, module, module.exports);
    return module.exports;
  };
  load(path.join(functionsRoot, name, 'index.ts'));
  if (!handler) throw new Error(`No serve handler registered by ${name}`);
  return { handler, database, fetch: fetchSpy, resolveDns, model, createClient, randomUUID };
}
