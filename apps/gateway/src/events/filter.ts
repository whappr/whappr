import type { Logger } from '../logging/logger.js';
import type { AnyWhapprEvent } from './types.js';

const ENV_KEY = 'WHAPPR_EVENTS';
const WILDCARD = '*';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

export type FilterAttributeValue = string | number | boolean;

export interface FilterCondition {
  path: string[];
  value: FilterAttributeValue;
}

export interface FilterRule {
  type: string;
  conditions: FilterCondition[];
}

function coerceFilterValue(raw: string): FilterAttributeValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (NUMBER_PATTERN.test(raw)) return Number(raw);
  return raw;
}

function parseFieldPath(field: string, chunk: string, eventType: string): string[] {
  const path = field.split('.');
  if (path.some((segment) => segment === '')) {
    throw new Error(
      `field "${field}" in condition "${chunk}" of "${eventType}(...)" has an empty path ` +
        'segment — check for a stray "." (e.g. a leading, trailing, or doubled ".")',
    );
  }
  return path;
}

function parseAttributeClause(ruleBody: string, eventType: string): FilterCondition[] {
  const byField: Record<string, FilterCondition> = {};

  for (const rawChunk of ruleBody.split('&')) {
    const chunk = rawChunk.trim();
    if (chunk === '') {
      throw new Error(`empty condition in "${eventType}(...)" — check for a stray "&"`);
    }

    const eqIndex = chunk.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(
        `condition "${chunk}" in "${eventType}(...)" is missing "=" (expected "field=value")`,
      );
    }

    const field = chunk.slice(0, eqIndex).trim();
    const value = chunk.slice(eqIndex + 1);

    if (field === '') {
      throw new Error(`condition "${chunk}" in "${eventType}(...)" has an empty field name`);
    }

    const path = parseFieldPath(field, chunk, eventType);

    // Later conditions override earlier ones for the same field name.
    byField[field] = { path, value: coerceFilterValue(value) };
  }

  return Object.values(byField);
}

function parseFilterRule(raw: string): FilterRule {
  const openIndex = raw.indexOf('(');
  const type = (openIndex === -1 ? raw : raw.slice(0, openIndex)).trim();

  if (type === '') {
    throw new Error('empty type name — check for a stray "," in WHAPPR_EVENTS');
  }
  if (type.includes(')')) {
    throw new Error(`stray ")" with no matching "(" in "${type}"`);
  }

  if (openIndex === -1) {
    return { type, conditions: [] };
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

  const conditions = body === '' || body === WILDCARD ? [] : parseAttributeClause(body, type);
  return { type, conditions };
}

function parseFilterRules(expr: string): FilterRule[] {
  return expr.split(',').map((raw) => parseFilterRule(raw.trim()));
}

export function loadFilterRules(
  logger: Logger,
  source: NodeJS.ProcessEnv = process.env,
): FilterRule[] {
  const raw = source[ENV_KEY];
  const expr = raw === undefined || raw.trim() === '' ? WILDCARD : raw;

  try {
    return parseFilterRules(expr);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      `invalid ${ENV_KEY} configuration`,
    );
    process.exit(1);
  }
}

function readAttributePath(data: unknown, path: string[]): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function attributesMatch(conditions: FilterCondition[], data: unknown): boolean {
  return conditions.every(({ path, value }) => readAttributePath(data, path) === value);
}

export function eventMatchesRules(event: AnyWhapprEvent, rules: FilterRule[]): boolean {
  if (rules.length === 0) return true;

  const specific = rules.filter((rule) => rule.type === event.type);
  if (specific.length > 0) {
    return specific.some((rule) => attributesMatch(rule.conditions, event.data));
  }
  return rules.some((rule) => rule.type === WILDCARD);
}
