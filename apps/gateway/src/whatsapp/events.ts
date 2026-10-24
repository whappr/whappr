import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AnyWhapprEvent } from '@whappr/protocol';
import type { Logger } from 'pino';
import type wwebjs from 'whatsapp-web.js';
import { fetchGroup, mentionNamesOf, peopleOf, readMessage } from './lookup.js';
import {
  authorOf,
  participant,
  reactorIdOf,
  senderIdOf,
  toDeletedData,
  toEditedData,
  toGroupChat,
  toReactionData,
} from './mappers.js';
import type { ReadyContext, Session } from './session.js';
import { authorIdOf, isGroupCreation, membersOf, mentionedIdsOf, recipientIdsOf } from './wweb.js';

/** An event before it's stamped with an `id` and a `timestamp`. */
type UnstampedEvent<E = AnyWhapprEvent> = E extends AnyWhapprEvent
  ? Omit<E, 'id' | 'timestamp'>
  : never;

export type Events = ReturnType<typeof createEvents>;

/**
 * Turns whatsapp-web.js events into webhook events. Each is handled after every earlier one, so
 * events go out in the order whatsapp-web.js emitted them even when handling one awaits WhatsApp Web.
 */
export function createEvents(session: Session, logger: Logger) {
  const emitter = new EventEmitter<{ event: [event: AnyWhapprEvent] }>();
  let queue: Promise<void> = Promise.resolve();

  /** Runs `handle` after every earlier one, while the session is ready, and emits its events. */
  function enqueue(
    description: string,
    handle: (ctx: ReadyContext) => Promise<UnstampedEvent[]> | UnstampedEvent[],
  ): void {
    queue = queue.then(async () => {
      const ctx = session.current();
      if (!ctx) {
        logger.debug(`skipped ${description}: client not ready`);
        return;
      }
      try {
        for (const event of await handle(ctx)) {
          emitter.emit('event', {
            ...event,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error({ error }, `failed to handle ${description}`);
      }
    });
  }

  // `myId` is the id the notification names the account by.
  async function joined(
    ctx: ReadyContext,
    notification: wwebjs.GroupNotification,
    myId: string,
  ): Promise<UnstampedEvent[]> {
    const groupId = notification.chatId;
    const chat = await fetchGroup(ctx, groupId);
    const memberIds = chat ? membersOf(chat).map(({ id }) => id) : [];
    const people = await peopleOf(ctx, [authorIdOf(notification), ...memberIds]);
    return [
      {
        type: 'group.joined',
        data: {
          chat: toGroupChat(groupId),
          author: authorOf(notification, myId, people),
          participants: memberIds.map((id) => participant(id, people)),
        },
      },
    ];
  }

  // The account joining is `group.joined`, whose participants list the others who joined with it.
  async function groupJoin(
    ctx: ReadyContext,
    notification: wwebjs.GroupNotification,
  ): Promise<UnstampedEvent[]> {
    const chat = toGroupChat(notification.chatId);
    const recipientIds = recipientIdsOf(notification);
    const myId = recipientIds.find((id) => ctx.me.ids.has(id));
    if (myId !== undefined) return joined(ctx, notification, myId);

    const people = await peopleOf(ctx, [authorIdOf(notification), ...recipientIds]);
    return recipientIds.map((id) => ({
      type: 'group.participant.joined',
      data: {
        chat,
        author: authorOf(notification, id, people),
        participant: participant(id, people),
      },
    }));
  }

  // The account leaving is `group.left` only: it no longer follows the group, so the others who
  // left with it aren't reported. WhatsApp only notifies the account's removal, never its own leave.
  async function groupLeave(
    ctx: ReadyContext,
    notification: wwebjs.GroupNotification,
  ): Promise<UnstampedEvent[]> {
    const chat = toGroupChat(notification.chatId);
    const recipientIds = recipientIdsOf(notification);
    const reason = notification.type === 'remove' ? 'removed' : 'left';
    const people = await peopleOf(ctx, [authorIdOf(notification), ...recipientIds]);
    const authorFor = (id: string) =>
      reason === 'removed' ? authorOf(notification, id, people) : undefined;

    const myId = recipientIds.find((id) => ctx.me.ids.has(id));
    if (myId !== undefined) {
      return [{ type: 'group.left', data: { chat, author: authorFor(myId), reason } }];
    }
    return recipientIds.map((id) => ({
      type: 'group.participant.left',
      data: { chat, author: authorFor(id), participant: participant(id, people), reason },
    }));
  }

  const { wa } = session;

  wa.on('message', (message) => {
    if (message.fromMe) return;
    enqueue('received message', async (ctx) => {
      const data = await readMessage(ctx, message);
      return data ? [{ type: 'message.received', data }] : [];
    });
  });

  wa.on('message_edit', (message, newBody, prevBody) => {
    enqueue('message edit', async (ctx) => {
      const people = await peopleOf(ctx, [senderIdOf(message), ...mentionedIdsOf(message)]);
      const names = await mentionNamesOf(ctx, message);
      const data = toEditedData(message, String(newBody), String(prevBody), people, names);
      return data ? [{ type: 'message.edited', data }] : [];
    });
  });

  wa.on('message_revoke_everyone', (message) => {
    enqueue('message deletion', async (ctx) => {
      const data = toDeletedData(message, await peopleOf(ctx, [senderIdOf(message)]));
      return data ? [{ type: 'message.deleted', data }] : [];
    });
  });

  wa.on('message_reaction', (reaction) => {
    enqueue('reaction', async (ctx) => {
      const data = toReactionData(reaction, await peopleOf(ctx, [reactorIdOf(reaction)]));
      if (!data) return [];
      if (data.emoji !== '') return [{ type: 'reaction.added', data }];
      const { emoji: _, ...removed } = data;
      return [{ type: 'reaction.removed', data: removed }];
    });
  });

  wa.on('group_join', (notification) => {
    enqueue('group join', (ctx) => groupJoin(ctx, notification));
  });

  wa.on('group_leave', (notification) => {
    enqueue('group leave', (ctx) => groupLeave(ctx, notification));
  });

  // A group the account created arrives as a creation only. One someone else created with the
  // account in it arrives as a creation and an add of the account: the add reports it, with its author.
  wa.on('group_update', (notification) => {
    if (!isGroupCreation(notification)) return;
    enqueue('group creation', (ctx) => {
      const creatorId = authorIdOf(notification);
      if (creatorId && !ctx.me.ids.has(creatorId)) return [];
      return joined(ctx, notification, ctx.me.id);
    });
  });

  return {
    on: emitter.on.bind(emitter),

    /**
     * Reports `group.left` for a group the gateway left, in order with the events before it. WhatsApp
     * sends no notification for the account's own leave, so this is the only one.
     */
    reportLeft(groupId: string): void {
      enqueue('group leave by the gateway', () => [
        { type: 'group.left', data: { chat: toGroupChat(groupId), reason: 'left' } },
      ]);
    },
  };
}
