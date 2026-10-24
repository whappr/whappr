import type { LeaveGroupRequest, ListGroupsResponse } from '@whappr/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Groups } from '../../whatsapp/groups.js';
import type { AppEnv } from '../app.js';
import { validateBody } from '../middlewares.js';

// The body is optional: without a JSON one, the validator sees `{}`.
const leaveGroupSchema = z.object({
  deleteChat: z.boolean().optional(),
}) satisfies z.ZodType<LeaveGroupRequest>;

export function createGroupsRoute(groups: Groups): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .get('/', async (c) => {
      return c.json({ groups: await groups.list() } satisfies ListGroupsResponse);
    })
    .get('/:groupId', async (c) => {
      return c.json(await groups.get(c.req.param('groupId')));
    })
    .post('/:groupId/leave', validateBody(leaveGroupSchema), async (c) => {
      await groups.leave(c.req.param('groupId'), c.req.valid('json'));
      return c.body(null, 204);
    });
}
