import { ContactPayload, GroupChat, Media, MessageReceived } from 'kozz-types';
import { Overwrite } from 'src/util/utilityTypes.js';

export type ChatMetadata = {
	id: string;
	lastMessageTimestamp: number;
	unreadCount: number;
	lastMessagePreview: string;
};

export const chatMetadataModel = {
	name: 'chatMetadata',
	primaryKey: 'id',
	properties: {
		id: 'string',
		lastMessageTimestamp: 'int?',
		unreadCount: 'int?',
		lastMessagePreview: 'string?',
	},
};

export type MessageModel = Overwrite<
	MessageReceived,
	{
		taggedContacts: string;
		contact: string;
		quotedMessage: string;
		media: string;
		originalMessagePayload: string;
		originalEditMessageList?:string[];
	}
>;

export const messageSchema = {
	name: 'message',
	primaryKey: 'id',
	properties: {
		id: 'string',
		platform: 'string',
		timestamp: 'int',
		from: 'string',
		to: 'string',
		body: 'string',
		santizedBody: 'string',
		taggedConctactFriendlyBody: 'string',
		fromHostAccount: 'bool',
		groupName: 'string?',
		media: 'string?',
		boundaryName: 'string',
		quotedMessage: 'string?',
		contact: 'string?',
		messageType: 'string',
		isViewOnce: 'bool',
		taggedContacts: 'string',
		originalMessagePayload: 'string',
	},
};

export type GroupChatModel = Overwrite<
	GroupChat,
	{
		participants: string[];
		lastFetched: number;
		unreadCount: number;
		lastMessageTimestamp: number;
	}
>;
export const groupChatSchema = {
	name: 'groupChat',
	primaryKey: 'id',
	properties: {
		id: 'string',
		name: 'string',
		owner: 'string',
		description: 'string',
		memberCount: 'int',
		community: 'string?',
		participants: 'string[]',
		lastFetched: 'int',
	},
};

export type PrivateChatModel = {
	id: string;
};
export const privateChatSchema = {
	name: 'privateChat',
	primaryKey: 'id',
	properties: {
		id: 'string',
	},
};

export type ContactModel = ContactPayload;

export const contactSchema = {
	name: 'contact',
	primaryKey: 'id',
	properties: {
		id: 'string',
		publicName: 'string',
		privateName: 'string',
		isBlocked: 'bool',
		hostAdded: 'bool',
		isGroup: 'bool',
		isHostAccount: 'bool',
	},
};

export type MediaModel = Overwrite<
	Media,
	{
		id: string;
		timestamp: number;
		originalFileName: string;
		deleted: boolean;
	}
>;

export const mediaSchema = {
	name: 'media',
	primaryKey: 'id',
	properties: {
		id: 'string',
		mimeType: 'string',
		timestamp: 'int',
		originalFileName: 'string',
		deleted: 'bool',
	},
};

export type EntityMap = {
	media: MediaModel;
	message: MessageModel;
	contact: ContactModel;
	groupChat: GroupChatModel;
	chatMetadata: ChatMetadata;
	privateChat: PrivateChatModel;
};
