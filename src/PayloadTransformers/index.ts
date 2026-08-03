import { WAMessage, WASocket, proto } from 'baileys';
import { ContactPayload, GroupChat, MessageReceived } from 'kozz-types';
import Context from 'src/Context';
import {
	getContact,
	getContactByLid,
	resolveLidFromJid,
	resolveJidFromLid,
	saveLidMappings,
} from 'src/Store/ContactStore';
import { getMessage, saveMessage } from 'src/Store/MessageStore';
import { GroupChatModel } from 'src/Store/models';
import { downloadMediaFromMessage } from 'src/util/media';
import { isGroupLikeChatId } from 'src/util/chat';
import { clearContact, replaceTaggedName } from 'src/util/utility';
import { boundaryName } from 'src/InstanceConfig';

type LidAwareMessageKey = proto.IMessageKey & {
	senderLid?: string | null;
	senderPn?: string | null;
	participantLid?: string | null;
	participantPn?: string | null;
};

const WRAPPER_MESSAGE_KEYS = [
	'ephemeralMessage',
	'viewOnceMessage',
	'viewOnceMessageV2',
	'viewOnceMessageV2Extension',
	'documentWithCaptionMessage',
] as const;

const USER_MESSAGE_TYPES = [
	'conversation',
	'extendedTextMessage',
	'imageMessage',
	'videoMessage',
	'audioMessage',
	'stickerMessage',
] as const;

export type BaileysMessageEventKind =
	| 'user_message'
	| 'reaction'
	| 'poll_creation'
	| 'poll_update'
	| 'protocol_edit'
	| 'protocol_revoke'
	| 'protocol'
	| 'group_update'
	| 'system'
	| 'empty'
	| 'unsupported';

export type BaileysMessageEvent = {
	kind: BaileysMessageEventKind;
	content: proto.IMessage | null;
	contentType?: string;
	protocolType?: proto.Message.ProtocolMessage.Type | null;
	stubType?: proto.WebMessageInfo.StubType | null;
};

export const getMessageContent = (
	message?: WAMessage | proto.IMessage | null
): proto.IMessage | null => {
	const root = 'message' in (message ?? {}) ? (message as WAMessage).message : message;
	let content = root as proto.IMessage | null | undefined;

	for (let depth = 0; depth < 8 && content; depth++) {
		const wrapperKey = WRAPPER_MESSAGE_KEYS.find(
			key => (content as any)?.[key]?.message
		);

		if (!wrapperKey) {
			break;
		}

		content = (content as any)[wrapperKey].message;
	}

	return content ?? null;
};

const getContentType = (content?: proto.IMessage | null) => {
	if (!content) {
		return undefined;
	}

	return Object.keys(content).find(key => (content as any)[key] != null);
};

export const classifyBaileysMessage = (
	message: WAMessage
): BaileysMessageEvent => {
	if (message.messageStubType) {
		const stubTypeName =
			proto.WebMessageInfo.StubType[message.messageStubType] ?? 'UNKNOWN';

		return {
			kind: stubTypeName.startsWith('GROUP_') || stubTypeName.startsWith('COMMUNITY_')
				? 'group_update'
				: 'system',
			content: getMessageContent(message),
			stubType: message.messageStubType,
		};
	}

	const content = getMessageContent(message);
	const contentType = getContentType(content);

	if (!content || !contentType) {
		return { kind: 'empty', content };
	}

	if (content.reactionMessage) {
		return { kind: 'reaction', content, contentType };
	}

	if (content.pollUpdateMessage) {
		return { kind: 'poll_update', content, contentType };
	}

	if (
		content.pollCreationMessage ||
		content.pollCreationMessageV2 ||
		content.pollCreationMessageV3
	) {
		return { kind: 'poll_creation', content, contentType };
	}

	if (content.protocolMessage) {
		const protocolType = content.protocolMessage.type ?? null;

		if (protocolType === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) {
			return { kind: 'protocol_edit', content, contentType, protocolType };
		}

		if (protocolType === proto.Message.ProtocolMessage.Type.REVOKE) {
			return { kind: 'protocol_revoke', content, contentType, protocolType };
		}

		return { kind: 'protocol', content, contentType, protocolType };
	}

	if (USER_MESSAGE_TYPES.some(type => (content as any)[type])) {
		return { kind: 'user_message', content, contentType };
	}

	return { kind: 'unsupported', content, contentType };
};

export const stringifyMessageId = (messageKey: proto.IMessageKey): string => {
	const { fromMe, remoteJid, id, participant } = messageKey;
	if (participant) {
		return `${remoteJid}_${id}_${participant}`;
	} else {
		return `${remoteJid}_${id}`;
	}
};

export const serializeMessageId = (messageId: string): proto.IMessageKey => {
	const [remoteJid, id, participant] = messageId.split('_');
	return {
		id,
		participant,
		remoteJid,
	};
};

export const saveLidMappingsFromMessage = async (message: WAMessage) => {
	const key = message.key as LidAwareMessageKey;
	const mappings = [
		{
			lid: key.senderLid ?? undefined,
			pn: key.senderPn ?? undefined,
		},
		{
			lid: key.participantLid ?? undefined,
			pn: key.participantPn ?? undefined,
		},
		{
			lid: key.participant?.endsWith('@lid') ? key.participant : undefined,
			pn: key.participantPn ?? undefined,
		},
		{
			lid: key.remoteJid?.endsWith('@lid') ? key.remoteJid : undefined,
			pn: key.senderPn ?? undefined,
		},
	];

	await saveLidMappings(mappings);
};

const compact = <T>(items: Array<T | null | undefined>) =>
	items.filter(Boolean) as T[];

const normalizeContactId = (contactId?: string | null) =>
	contactId ? clearContact(contactId) : null;

const getHostAliases = async () => {
	const hostData = Context.get('hostData');
	const hostId = normalizeContactId(hostData.id);
	const hostLid = normalizeContactId(hostData.lid);
	const resolvedPn = hostId?.endsWith('@lid') ? await resolveJidFromLid(hostId) : null;
	const resolvedLid = hostId?.endsWith('@s.whatsapp.net')
		? await resolveLidFromJid(hostId)
		: null;

	return new Set(compact([hostId, hostLid, resolvedPn, resolvedLid]).map(clearContact));
};

const getMessageAuthorCandidates = (message: WAMessage) => {
	const key = message.key as LidAwareMessageKey;

	return compact([
		key.participant,
		message.participant,
		key.remoteJid,
		key.senderPn,
		key.senderLid,
		key.participantPn,
		key.participantLid,
	]).map(clearContact);
};

export const isMessageFromHostAccount = async (message: WAMessage) => {
	if (message.key.fromMe) {
		return true;
	}

	const hostAliases = await getHostAliases();
	const authorCandidates = getMessageAuthorCandidates(message);

	return authorCandidates.some(candidate => hostAliases.has(candidate));
};

export const createContactPayload = async (
	message: WAMessage,
	waSocket?: WASocket
): Promise<ContactPayload> => {
	const isHostAccount = await isMessageFromHostAccount(message);
	const getContactId = (message: WAMessage) => {
		if (isHostAccount) {
			return Context.get('hostData').id;
		}
		return message.key.participant || message.participant || message.key.remoteJid!;
	};

	let contactId = clearContact(getContactId(message));
	const isBlocked = Context.get('blockedList').includes(message.key.participant!);

	// If the JID is in LID format, resolve it to a phone-number JID via DB mapping
	if (contactId.endsWith('@lid')) {
		const resolvedPn = await resolveJidFromLid(contactId);
		if (resolvedPn) {
			contactId = resolvedPn;
		} else {
			console.warn(`[LID] Could not resolve LID ${contactId} to a phone-number JID (mapping not yet known)`);
		}
	}

	return {
		hostAdded: false,
		id: contactId,
		isHostAccount,
		isBlocked,
		publicName: message.pushName || '',
			isGroup: isGroupLikeChatId(message.key.remoteJid) || !!message.key.participant,
		privateName: '',
	};
};

export const createContactFromSync = async (contact: {
	id: string;
	name: string;
}) => {
	const hostData = Context.get('hostData');
	const isBlocked = Context.get('blockedList').includes(contact.id);

	return {
		hostAdded: false,
		id: contact.id,
		isHostAccount: hostData.id === contact.id,
		isBlocked,
		publicName: contact.name || 'no_name',
			isGroup: isGroupLikeChatId(contact.id),
		privateName: '',
	};
};

export const createtTaggedContactPayload = async (
	message: WAMessage
): Promise<ContactPayload[]> => {
	let contacts: ContactPayload[] = [];
	const hostAliases = await getHostAliases();
	const messageContent = getMessageContent(message);
	if (messageContent?.extendedTextMessage?.contextInfo?.mentionedJid) {
		for (const contactId of messageContent.extendedTextMessage.contextInfo
			?.mentionedJid ?? []) {
			const normalizedContactId = clearContact(contactId);
			const contact =
				(await getContact(normalizedContactId)) ||
				(normalizedContactId.endsWith('@lid')
					? await getContactByLid(normalizedContactId)
					: null) ||
				(normalizedContactId.endsWith('@s.whatsapp.net')
					? await getContactByLid((await resolveLidFromJid(normalizedContactId)) ?? '')
					: null);
			if (contact) {
				contacts.push(contact);
			} else if (hostAliases.has(normalizedContactId)) {
				contacts.push({
					hostAdded: false,
					id: Context.get('hostData').id,
					isHostAccount: true,
					isBlocked: false,
					publicName: Context.get('hostData').pushName,
					isGroup: false,
					privateName: '',
				});
			}
		}
	}

	return contacts;
};

export const handleEditMessage = async (message: WAMessage) => {
	const messageContent = getMessageContent(message);
	if (messageContent?.protocolMessage?.type == proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) {
		const editedId = messageContent.protocolMessage.key?.id!;
		let editedMsg = await getMessage(editedId);

		if (editedMsg) {
			const editedMessageBody =
				messageContent.protocolMessage.editedMessage?.conversation ||
				messageContent.protocolMessage.editedMessage?.extendedTextMessage?.text ||
				messageContent.protocolMessage.editedMessage?.imageMessage?.caption ||
				messageContent.protocolMessage.editedMessage?.videoMessage?.caption ||
				'';
			editedMsg.body = editedMessageBody;

			editedMsg.santizedBody = editedMessageBody
				.toLowerCase()
				.normalize('NFKD')
				.replace(/[\u0300-\u036f]/g, '');

			const editedTaggedContact = await createtTaggedContactPayload(message);
			editedMsg.taggedContacts = editedTaggedContact;

			let editedTaggedConctactFriendlyBody = editedMessageBody;
			if (editedTaggedContact.length) {
				editedTaggedConctactFriendlyBody = replaceTaggedName(
					editedMessageBody,
					editedTaggedContact
				);
			}
			editedMsg.taggedConctactFriendlyBody = editedTaggedConctactFriendlyBody;
			editedMsg.id = `${editedMsg.id}_edited${new Date().getTime()}`;

			await saveMessage(editedMsg, message);
		}
	}
};

const normalizeMessageTimestamp = (messageTimestamp: WAMessage['messageTimestamp']) => {
	const numericTimestamp = Number(messageTimestamp);

	if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) {
		return new Date().getTime();
	}

	return numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp;
};

export const getPinInChatMessage = (message: WAMessage) =>
	getMessageContent(message)?.pinInChatMessage;

export const getPollUpdateMessage = (message: WAMessage) =>
	getMessageContent(message)?.pollUpdateMessage;

const getRawMessageType = (message: WAMessage) => {
	const content = getMessageContent(message);
	if (!content) return 'unknown';

	return (
		Object.keys(content).find(key => key !== 'messageContextInfo') ||
		'messageContextInfo'
	);
};

const getMessageBody = (message: WAMessage) => {
	const content = getMessageContent(message);
	const pollCreationMessage =
		content?.pollCreationMessage ||
		content?.pollCreationMessageV2 ||
		content?.pollCreationMessageV3;

	if (pollCreationMessage) {
		const options = pollCreationMessage.options
			?.map(option => option.optionName)
			.filter(Boolean)
			.map(optionName => `- ${optionName}`)
			.join('\n');

		return ['Enquete', pollCreationMessage.name, options].filter(Boolean).join('\n');
	}

	return (
		content?.conversation ||
		content?.extendedTextMessage?.text ||
		content?.imageMessage?.caption ||
		content?.videoMessage?.caption ||
		''
	);
};

const getPayloadMessageType = (
	message: WAMessage
): MessageReceived['messageType'] => {
	const content = getMessageContent(message);

	if (content?.conversation || content?.extendedTextMessage) return 'TEXT';
	if (content?.audioMessage) return 'AUDIO';
	if (content?.stickerMessage) return 'STICKER';
	if (content?.videoMessage) return 'VIDEO';
	if (content?.imageMessage) return 'IMAGE';
	if (
		content?.pollCreationMessage ||
		content?.pollCreationMessageV2 ||
		content?.pollCreationMessageV3
	) {
		return 'TEXT';
	}

	return 'OTHER';
};

const getMessageContextInfo = (message: WAMessage) => {
	const content = getMessageContent(message);

	return (
		content?.extendedTextMessage ||
		content?.audioMessage ||
		content?.stickerMessage ||
		content?.videoMessage ||
		content?.imageMessage
	)?.contextInfo;
};

export const createMessagePayload = async (
	message: WAMessage,
	waSocket: WASocket
): Promise<MessageReceived> => {
	await saveLidMappingsFromMessage(message);

	const media = await downloadMediaFromMessage(message, waSocket);
	const contact = await createContactPayload(message, waSocket);
	const taggedContact = await createtTaggedContactPayload(message);
	const rawMessageType = getRawMessageType(message);
	const messageType = getPayloadMessageType(message);

	const messageBody =
		getMessageBody(message) ||
		(messageType === 'OTHER' ? `Mensagem sem renderizador: ${rawMessageType}` : '');

	let taggedConctactFriendlyBody = messageBody;
	if (taggedContact.length) {
		taggedConctactFriendlyBody = replaceTaggedName(messageBody, taggedContact);
	}
	const contextInfo = getMessageContextInfo(message);

	const id = message.key.id!;
	const quotedMessageId = contextInfo?.stanzaId!;

	const quotedMessage = quotedMessageId
		? await getMessage(quotedMessageId)
		: undefined;

	if (quotedMessageId && quotedMessage) {
		const quoteMessage = {
			key: {
				remoteJid: message?.key?.remoteJid,
				fromMe: message?.key?.fromMe,
				id: quotedMessageId,
				participant: message?.key?.participant,
			},
			message: contextInfo?.quotedMessage,
		};
		const mediaQuote = await downloadMediaFromMessage(quoteMessage, waSocket);

		if (mediaQuote) {
			quotedMessage.media = mediaQuote;
			quotedMessage.messageType = contextInfo?.quotedMessage?.extendedTextMessage
				|| contextInfo?.quotedMessage?.conversation
				? 'TEXT'
				: contextInfo?.quotedMessage?.audioMessage
					? 'AUDIO'
					: contextInfo?.quotedMessage?.stickerMessage
						? 'STICKER'
						: contextInfo?.quotedMessage?.videoMessage
							? 'VIDEO'
							: contextInfo?.quotedMessage?.imageMessage
								? 'IMAGE'
								: 'OTHER';

			quotedMessage.isViewOnce =
				(
					contextInfo?.quotedMessage?.audioMessage ||
					contextInfo?.quotedMessage?.videoMessage ||
					contextInfo?.quotedMessage?.imageMessage
				)?.viewOnce || false;

			quotedMessage.taggedConctactFriendlyBody =
				(
					contextInfo?.quotedMessage?.videoMessage ||
					contextInfo?.quotedMessage?.imageMessage
				)?.caption || '';

			await saveMessage(quotedMessage, quotedMessage.originalMessagePayload as any);
		}
	}

	return {
		body: messageBody,
		boundaryName,
		id,
		contact: await createContactPayload(message, waSocket),
		from: contact.id,
		fromHostAccount: contact.isHostAccount,
		isViewOnce: false,
		to: message.key.remoteJid!,
		chatId: message.key.remoteJid!,
		messageType: messageType,
		platform: 'Baileys',
		quotedMessage: quotedMessage || undefined,
		santizedBody: messageBody
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, ''),
		taggedContacts: taggedContact,
		timestamp: normalizeMessageTimestamp(message.messageTimestamp),
		taggedConctactFriendlyBody: taggedConctactFriendlyBody,
		media,
	};
};

export const createGroupChatPayload = (
	ogChatPayload: any
): GroupChat & {
	lastMessageTimestamp: number;
} => {
	return {
		id: ogChatPayload.id,
		community: ogChatPayload.linkedParent ?? null,
		description: ogChatPayload.desc ?? '',
		memberCount: ogChatPayload.size ?? 0,
		name: ogChatPayload.subject ?? 'Status',
		owner:
			ogChatPayload.owner ??
			ogChatPayload.participants?.find(
				(participant: any) => participant.admin === 'superadmin'
			)?.id ??
			'NOT_FOUND',
		participants: ogChatPayload.participants?.map((participant: any) => ({
			admin: !!participant.admin,
			id: participant.id,
		})),
		unreadCount: ogChatPayload.unreadCount ?? 0,
		lastMessageTimestamp: ogChatPayload.lastMessageTimestamp ?? 0,
	};
};
