import type { Logger } from '../logging/logger.js';
import type { MessagePayload } from '../whatsapp/client.js';

const ENV_KEY = 'WHAPPR_COMMANDS';
const PREFIX = '/';
const NAME_PATTERN = /^[^\s/]+$/;

export interface CommandInvokedPayload extends MessagePayload {
  command: string;
  args: string[];
}

export interface CommandMatch {
  command: string;
  args: string[];
}

function parseCommandNames(expr: string): Set<string> {
  const names = new Set<string>();

  for (const rawChunk of expr.split(',')) {
    const name = rawChunk.trim();
    if (name === '') {
      throw new Error(`empty command name — check for a stray "," in ${ENV_KEY}`);
    }
    if (!NAME_PATTERN.test(name)) {
      throw new Error(
        `invalid command name "${name}" in ${ENV_KEY} — names must not contain "/" or whitespace`,
      );
    }
    names.add(name);
  }

  return names;
}

export function loadCommandNames(
  logger: Logger,
  source: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = source[ENV_KEY];
  const expr = raw === undefined || raw.trim() === '' ? '' : raw;

  if (expr === '') return new Set();

  try {
    return parseCommandNames(expr);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      `invalid ${ENV_KEY} configuration`,
    );
    process.exit(1);
  }
}

export function matchCommand(body: string, commands: Set<string>): CommandMatch | null {
  if (commands.size === 0 || !body.startsWith(PREFIX)) return null;

  const rest = body.slice(PREFIX.length);
  const spaceIndex = rest.search(/\s/);
  const name = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);

  if (name === '' || !commands.has(name)) return null;

  const remainder = spaceIndex === -1 ? '' : rest.slice(spaceIndex + 1).trim();
  const args = remainder === '' ? [] : remainder.split(/\s+/);

  return { command: name, args };
}
