export const STATUS_BROADCAST_JID = 'status@broadcast';

export const isStatusBroadcast = (id?: string | null) =>
	id === STATUS_BROADCAST_JID;

export const isGroupChatId = (id?: string | null) =>
	!!id && id.includes('@g.us');

export const isGroupLikeChatId = (id?: string | null) =>
	isGroupChatId(id) || isStatusBroadcast(id);
