import type { Group, GroupSummary, LeaveGroupRequest, ListGroupsResponse } from '@whappr/protocol';
import type { RequestOptions, Transport } from '../transport.js';

export interface GroupsApi {
  /**
   * GET /api/groups — the groups the account is a member of. Slow on accounts with many groups:
   * the gateway refreshes each one from WhatsApp, so pass `{ timeoutMs }` if needed.
   */
  list(options?: RequestOptions): Promise<GroupSummary[]>;
  /** GET /api/groups/:groupId — the group and its participants. */
  get(groupId: string, options?: RequestOptions): Promise<Group>;
  /**
   * POST /api/groups/:groupId/leave — leaves the group. Set `deleteChat` to also delete its chat on
   * the paired account.
   */
  leave(groupId: string, input?: LeaveGroupRequest, options?: RequestOptions): Promise<void>;
}

function groupPath(groupId: string, suffix = ''): string {
  return `/api/groups/${encodeURIComponent(groupId)}${suffix}`;
}

export function createGroupsApi(transport: Transport): GroupsApi {
  return {
    async list(options) {
      const { groups } = await transport.request<ListGroupsResponse>(
        { method: 'GET', path: '/api/groups' },
        options,
      );
      return groups;
    },
    get(groupId, options) {
      return transport.request<Group>({ method: 'GET', path: groupPath(groupId) }, options);
    },
    async leave(groupId, input, options) {
      await transport.request(
        { method: 'POST', path: groupPath(groupId, '/leave'), body: input },
        options,
      );
    },
  };
}
