import type { Group, GroupSummary, LeaveGroupRequest } from '@whappr/protocol';
import type wwebjs from 'whatsapp-web.js';
import { WhatsappError } from './errors.js';
import type { Events } from './events.js';
import { findGroup, isMember, peopleOf } from './lookup.js';
import { toGroup, toGroupSummary } from './mappers.js';
import type { Session } from './session.js';
import { membersOf } from './wweb.js';

export type Groups = ReturnType<typeof createGroups>;

// Only groups the account is a member of: any other counts as `CHAT_NOT_FOUND`.
export function createGroups(session: Session, events: Events) {
  return {
    /** Slow with many groups: each is refreshed from WhatsApp. */
    async list(): Promise<GroupSummary[]> {
      const { wa, me } = session.ready();
      const chats = await wa.getChats().catch((cause) => {
        throw new WhatsappError('Failed to list WhatsApp chats', 'OPERATION_FAILED', cause);
      });
      return chats
        .filter((chat): chat is wwebjs.GroupChat => chat.isGroup)
        .filter((chat) => isMember(chat, me))
        .map(toGroupSummary);
    },

    async get(groupId: string): Promise<Group> {
      const ctx = session.ready();
      const chat = await findGroup(ctx, groupId);
      const memberIds = membersOf(chat).map(({ id }) => id);
      return toGroup(chat, await peopleOf(ctx, memberIds));
    },

    /** Leaves the group, emitting `group.left`, and with `deleteChat` deletes its chat locally too. */
    async leave(groupId: string, { deleteChat = false }: LeaveGroupRequest = {}): Promise<void> {
      const chat = await findGroup(session.ready(), groupId);
      await chat.leave().catch((cause) => {
        throw new WhatsappError('Failed to leave WhatsApp group', 'OPERATION_FAILED', cause);
      });
      events.reportLeft(groupId);
      if (deleteChat) {
        await chat.delete().catch((cause) => {
          throw new WhatsappError('Failed to delete WhatsApp chat', 'OPERATION_FAILED', cause);
        });
      }
    },
  };
}
