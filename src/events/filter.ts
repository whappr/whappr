import type { Logger } from '../logging/logger.js';
import type { AnyWhapprEvent } from './types.js';

const ENV_KEY = 'WHAPPR_EVENT_FILTER';
const WILDCARD = '*';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

export type FilterAttributeValue = string | number | boolean;

export interface EventFilterEntry {
  type: string;
  attributes: Record<string, FilterAttributeValue>;
}

function coerceFilterValue(raw: string): FilterAttributeValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (NUMBER_PATTERN.test(raw)) return Number(raw);
  return raw;
}

function parseAttributeClause(
  body: string,
  entryType: string,
): Record<string, FilterAttributeValue> {
  const attributes: Record<string, FilterAttributeValue> = {};

  for (const rawChunk of body.split('&')) {
    const chunk = rawChunk.trim();
    if (chunk === '') {
      throw new Error(`empty condition in "${entryType}(...)" — check for a stray "&"`);
    }

    const eqIndex = chunk.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(
        `condition "${chunk}" in "${entryType}(...)" is missing "=" (expected "field=value")`,
      );
    }

    const field = chunk.slice(0, eqIndex).trim();
    const value = chunk.slice(eqIndex + 1);

    if (field === '') {
      throw new Error(`condition "${chunk}" in "${entryType}(...)" has an empty field name`);
    }

    // Later conditions override earlier ones for the same field name.
    attributes[field] = coerceFilterValue(value);
  }

  return attributes;
}

function parseEntry(raw: string): EventFilterEntry {
  const openIndex = raw.indexOf('(');
  const type = (openIndex === -1 ? raw : raw.slice(0, openIndex)).trim();

  if (type === '') {
    throw new Error('empty type name — check for a stray "," in WHAPPR_EVENT_FILTER');
  }
  if (type.includes(')')) {
    throw new Error(`stray ")" with no matching "(" in "${type}"`);
  }

  if (openIndex === -1) {
    return { type, attributes: {} };
  }

  if (type === WILDCARD) {
    throw new Error(
      'the wildcard entry "*" cannot take attribute conditions — "*(...)" is not supported',
    );
  }
  if (!raw.endsWith(')')) {
    throw new Error(`"${type}(...)" must end with ")" (found: "${raw}")`);
  }

  const body = raw.slice(openIndex + 1, -1).trim();
  if (body.includes('(') || body.includes(')')) {
    throw new Error(
      `"${type}(...)" contains an unexpected "(" or ")" — only one attribute clause is ` +
        'allowed per entry, and values may not contain "(" or ")"',
    );
  }

  const attributes = body === '' || body === WILDCARD ? {} : parseAttributeClause(body, type);
  return { type, attributes };
}

function parseFilterExpression(expr: string): EventFilterEntry[] {
  return expr.split(',').map((raw) => parseEntry(raw.trim()));
}

export function loadEventFilterRules(
  logger: Logger,
  source: NodeJS.ProcessEnv = process.env,
): EventFilterEntry[] {
  const raw = source[ENV_KEY];
  const expr = raw === undefined || raw.trim() === '' ? WILDCARD : raw;

  try {
    return parseFilterExpression(expr);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      `invalid ${ENV_KEY} configuration`,
    );
    process.exit(1);
  }
}

function attributesMatch(attributes: Record<string, FilterAttributeValue>, data: unknown): boolean {
  if (Object.keys(attributes).length === 0) return true;
  if (data === null || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return Object.entries(attributes).every(([field, expected]) => record[field] === expected);
}

export function eventMatchesRules(event: AnyWhapprEvent, entries: EventFilterEntry[]): boolean {
  if (entries.length === 0) return true;

  const specific = entries.filter((entry) => entry.type === event.type);
  if (specific.length > 0) {
    return specific.some((entry) => attributesMatch(entry.attributes, event.data));
  }
  return entries.some((entry) => entry.type === WILDCARD);
}

