import { MessageReceived } from 'kozz-types';
import Context from 'src/Context';
import { getMedia, saveMedia } from './MediaStore';
import {
	getContact,
	resolveJidFromLid,
	resolveLidFromJid,
	saveContact,
} from './ContactStore';
import { MessageModel } from './models';
import { proto } from 'baileys';
import { STATUS_BROADCAST_JID } from 'src/util/chat';

const database = Context.get('database');

export const saveMessage = async (
	message: MessageReceived,
	originalMessage: proto.IWebMessageInfo
): Promise<string> => {
	database.upsert('message', {
		...message,
		media: message.media ? await saveMedia(message.media) : undefined,
		contact: await saveContact(message.contact),
		timestamp: message.timestamp,
		quotedMessage: message.quotedMessage?.id,
		taggedContacts: JSON.stringify(message.taggedContacts),
		originalMessagePayload: JSON.stringify(originalMessage),
	});

	return message.id;
};

export const messageExists = async (id: string): Promise<boolean> => {
	return Boolean(await database.getById('message', id));
};

export const getMessage = async (
	id: string
): Promise<(MessageReceived & { originalMessagePayload: string }) | null> => {
	const message: MessageModel | null =
		((await database.getById('message', id)) as MessageModel) ?? null;

	if (!message) {
		return null;
	}

	const contact = await getContact(message.contact);
	if (!contact) {
		return null;
	}

	const media = message.media ? await getMedia(message.media) : undefined;

	return {
		...message,
		taggedContacts: JSON.parse(`[${message.taggedContacts}]`),
		contact: contact,
		quotedMessage: message.quotedMessage
			? (await getMessage(message.quotedMessage)) ?? undefined
			: undefined,

		media,
	};
};

export const getOriginalWaMessage = async (
	id: string
): Promise<proto.IWebMessageInfo | null> => {
	const message: MessageModel | null =
		((await database.getById('message', id)) as MessageModel) ?? null;

	if (!message?.originalMessagePayload) {
		return null;
	}

	try {
		return JSON.parse(message.originalMessagePayload) as proto.IWebMessageInfo;
	} catch (error) {
		console.warn(`[MessageStore] Invalid original message payload for ${id}`, error);
		return null;
	}
};

type RecentChatMessagesArgs = {
	chatId: string;
	limit?: number;
	excludeMessageId?: string;
};

type MessageCountByContactArgs = {
	chatId: string;
	startTimestamp?: number;
};

type StatusMessagesArgs = {
	contactId: string;
	limit?: number;
};

export type RecentChatMessage = {
	id: string;
	timestamp: number;
	from: string;
	to: string;
	body: string;
	taggedConctactFriendlyBody: string;
	messageType: MessageReceived['messageType'];
	fromHostAccount: boolean;
	contact: {
		id: string;
		publicName: string;
		isHostAccount: boolean;
	} | null;
	hasMedia: boolean;
};

const normalizeLimit = (limit?: number) => {
	if (!Number.isFinite(limit)) {
		return 200;
	}

	return Math.max(1, Math.min(Math.floor(limit!), 1000));
};

const getChatMessageAliases = async (chatId: string) => {
	const resolvedAlias = chatId.endsWith('@lid')
		? await resolveJidFromLid(chatId)
		: chatId.endsWith('@s.whatsapp.net')
			? await resolveLidFromJid(chatId)
			: null;

	return [chatId, resolvedAlias].filter(
		(alias, index, aliases): alias is string =>
			!!alias && aliases.indexOf(alias) === index
	);
};

const buildChatMessageQuery = (aliases: string[], excludeMessageId?: string) => {
	const chatQuery = aliases.map((_, index) => `to == $${index}`).join(' OR ');
	const query = excludeMessageId
		? `(${chatQuery}) AND id != $${aliases.length}`
		: chatQuery;
	const queryArgs = excludeMessageId ? [...aliases, excludeMessageId] : aliases;

	return { query, queryArgs };
};

const HIDDEN_STRUCTURAL_MESSAGE_TYPES = new Set([
	'pinInChatMessage',
	'pollUpdateMessage',
]);

const getStoredRawMessageType = (message: MessageModel) => {
	try {
		const originalMessage = JSON.parse(message.originalMessagePayload || '{}');
		const content =
			originalMessage.message?.ephemeralMessage?.message ||
			originalMessage.message?.viewOnceMessageV2?.message ||
			originalMessage.message?.viewOnceMessageV2Extension?.message ||
			originalMessage.message?.documentWithCaptionMessage?.message ||
			originalMessage.message;

		if (!content) return null;

		return (
			Object.keys(content).find(key => key !== 'messageContextInfo') || null
		);
	} catch {
		return null;
	}
};

const isHiddenStructuralMessage = (message: MessageModel) => {
	const rawMessageType = getStoredRawMessageType(message);

	return (
		!!rawMessageType && HIDDEN_STRUCTURAL_MESSAGE_TYPES.has(rawMessageType)
	);
};

export const getRecentChatMessages = async ({
	chatId,
	limit,
	excludeMessageId,
}: RecentChatMessagesArgs): Promise<RecentChatMessage[]> => {
	const safeLimit = normalizeLimit(limit);
	const aliases = await getChatMessageAliases(chatId);
	const { query, queryArgs } = buildChatMessageQuery(aliases, excludeMessageId);

	const recentMessages = (
		database.getFilteredSorted(
			'message',
			query,
			queryArgs,
			'timestamp',
			'des',
			safeLimit
		) ?? []
	)
		.filter(message => !isHiddenStructuralMessage(message))
		.reverse();

	return Promise.all(
		recentMessages.map(async message => {
			const contact = message.contact ? await getContact(message.contact) : null;

			return {
				id: message.id,
				timestamp: message.timestamp ?? 0,
				from: message.from,
				to: message.to,
				body: message.body,
				taggedConctactFriendlyBody: message.taggedConctactFriendlyBody,
				messageType: message.messageType,
				fromHostAccount: message.fromHostAccount,
				contact: contact
					? {
							id: contact.id,
							publicName: contact.publicName,
							isHostAccount: contact.isHostAccount,
						}
					: null,
				hasMedia: !!message.media,
			};
		})
	);
};

const hydrateRecentMessageWithMedia = async (
	message: MessageModel
): Promise<MessageReceived | null> => {
	const contact = message.contact ? await getContact(message.contact) : null;

	if (!contact) {
		return null;
	}

	const media = message.media ? await getMedia(message.media) : undefined;

	return {
		...message,
		taggedContacts: JSON.parse(message.taggedContacts || '[]'),
		contact,
		quotedMessage: undefined,
		media,
	};
};

export const getRecentChatMessagesWithMedia = async ({
	chatId,
	limit,
	excludeMessageId,
}: RecentChatMessagesArgs): Promise<MessageReceived[]> => {
	const safeLimit = normalizeLimit(limit);
	const aliases = await getChatMessageAliases(chatId);
	const { query, queryArgs } = buildChatMessageQuery(aliases, excludeMessageId);

	const recentMessages = (
		database.getFilteredSorted(
			'message',
			query,
			queryArgs,
			'timestamp',
			'des',
			safeLimit
		) ?? []
	)
		.filter(message => !isHiddenStructuralMessage(message))
		.reverse();

	const messages = await Promise.all(
		recentMessages.map(message => hydrateRecentMessageWithMedia(message))
	);

	return messages.filter(Boolean) as MessageReceived[];
};

export type MessageCountByContact = {
	contactId: string;
	count: number;
	aliases: string[];
};

export type StatusContactSummary = {
	contactId: string;
	name: string;
	lastStatusPreview: string;
	lastStatusTimestamp: number | null;
	statusCount: number;
};

const normalizeStartTimestamp = (startTimestamp?: number) => {
	if (!Number.isFinite(startTimestamp)) {
		return 0;
	}

	return Math.max(0, Math.floor(startTimestamp!));
};

export const getMessageCountByContact = async ({
	chatId,
	startTimestamp,
}: MessageCountByContactArgs): Promise<MessageCountByContact[]> => {
	const safeStartTimestamp = normalizeStartTimestamp(startTimestamp);
	const messages =
		database.getFilteredSorted(
			'message',
			'to == $0 AND timestamp >= $1',
			[chatId, safeStartTimestamp],
			'timestamp',
			'asc'
		) ?? [];

	const counts = messages.reduce<Record<string, number>>((acc, message) => {
		if (!message.from) {
			return acc;
		}

		acc[message.from] = (acc[message.from] ?? 0) + 1;
		return acc;
	}, {});

	const mergedCounts: Record<string, MessageCountByContact> = {};

	for (const [contactId, count] of Object.entries(counts)) {
		const resolvedJid = contactId.endsWith('@lid')
			? await resolveJidFromLid(contactId)
			: null;
		const canonicalContactId = resolvedJid ?? contactId;
		const contact = await getContact(canonicalContactId);
		const aliases = [
			contactId,
			resolvedJid,
			contact?.id,
			contact?.lid,
		].filter(Boolean) as string[];

		mergedCounts[canonicalContactId] = {
			contactId: canonicalContactId,
			count: (mergedCounts[canonicalContactId]?.count ?? 0) + count,
			aliases: [
				...(mergedCounts[canonicalContactId]?.aliases ?? []),
				...aliases,
			].filter((alias, index, allAliases) => allAliases.indexOf(alias) === index),
		};
	}

	return Object.values(mergedCounts).sort((a, b) => b.count - a.count);
};

const getContactAliases = async (contactId: string) => {
	const resolvedAlias = contactId.endsWith('@lid')
		? await resolveJidFromLid(contactId)
		: contactId.endsWith('@s.whatsapp.net')
			? await resolveLidFromJid(contactId)
			: null;
	const contact = await getContact(resolvedAlias ?? contactId);

	return [contactId, resolvedAlias, contact?.id, contact?.lid].filter(
		(alias, index, aliases): alias is string =>
			!!alias && aliases.indexOf(alias) === index
	);
};

const getStatusContactName = async (contactId: string) => {
	const contact = await getContact(contactId);
	return (
		contact?.privateName ||
		contact?.publicName ||
		contactId.replace(/@(lid|s\.whatsapp\.net)$/, '')
	);
};

export const getStatusContactSummaries = async (
	limit?: number
): Promise<StatusContactSummary[]> => {
	const safeLimit = normalizeLimit(limit);
	const statusMessages =
		database.getFilteredSorted(
			'message',
			'to == $0',
			[STATUS_BROADCAST_JID],
			'timestamp',
			'des',
			safeLimit
		) ?? [];

	const summaries = new Map<string, StatusContactSummary>();

	for (const message of statusMessages) {
		if (isHiddenStructuralMessage(message)) {
			continue;
		}

		const aliases = await getContactAliases(message.from);
		const canonicalContactId = aliases.find(alias =>
			alias.endsWith('@s.whatsapp.net')
		) ?? aliases[0] ?? message.from;
		const currentSummary = summaries.get(canonicalContactId);

		summaries.set(canonicalContactId, {
			contactId: canonicalContactId,
			name: currentSummary?.name ?? (await getStatusContactName(canonicalContactId)),
			lastStatusPreview:
				currentSummary?.lastStatusPreview ||
				message.taggedConctactFriendlyBody ||
				message.body ||
				message.messageType,
			lastStatusTimestamp:
				currentSummary?.lastStatusTimestamp ?? message.timestamp ?? null,
			statusCount: (currentSummary?.statusCount ?? 0) + 1,
		});
	}

	return Array.from(summaries.values()).sort(
		(a, b) => (b.lastStatusTimestamp ?? 0) - (a.lastStatusTimestamp ?? 0)
	);
};

export const getRecentStatusMessagesWithMedia = async ({
	contactId,
	limit,
}: StatusMessagesArgs): Promise<MessageReceived[]> => {
	const safeLimit = normalizeLimit(limit);
	const aliases = await getContactAliases(contactId);
	const authorQuery = aliases
		.flatMap((_, index) => [`from == $${index + 1}`, `contact == $${index + 1}`])
		.join(' OR ');

	const recentMessages = (
		database.getFilteredSorted(
			'message',
			`to == $0 AND (${authorQuery})`,
			[STATUS_BROADCAST_JID, ...aliases],
			'timestamp',
			'des',
			safeLimit
		) ?? []
	)
		.filter(message => !isHiddenStructuralMessage(message))
		.reverse();

	const messages = await Promise.all(
		recentMessages.map(message => hydrateRecentMessageWithMedia(message))
	);

	return messages.filter(Boolean) as MessageReceived[];
};
