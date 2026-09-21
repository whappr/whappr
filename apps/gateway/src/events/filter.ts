import type { Logger } from '../logging/logger.js';
import type { AnyWhapprEvent } from './types.js';

const ENV_KEY = 'WHAPPR_EVENTS';
const WILDCARD = '*';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

export type FilterAttributeValue = string | number | boolean;

export interface FilterRule {
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
  ruleBody: string,
  eventType: string,
): Record<string, FilterAttributeValue> {
  const attributes: Record<string, FilterAttributeValue> = {};

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

    // Later conditions override earlier ones for the same field name.
    attributes[field] = coerceFilterValue(value);
  }

  return attributes;
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

function attributesMatch(attributes: Record<string, FilterAttributeValue>, data: unknown): boolean {
  if (Object.keys(attributes).length === 0) return true;
  if (data === null || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return Object.entries(attributes).every(([field, expected]) => record[field] === expected);
}

export function eventMatchesRules(event: AnyWhapprEvent, rules: FilterRule[]): boolean {
  if (rules.length === 0) return true;

  const specific = rules.filter((rule) => rule.type === event.type);
  if (specific.length > 0) {
    return specific.some((rule) => attributesMatch(rule.attributes, event.data));
  }
  return rules.some((rule) => rule.type === WILDCARD);
}
