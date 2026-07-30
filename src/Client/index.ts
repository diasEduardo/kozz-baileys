import dotenv from 'dotenv';
import NodeCache from 'node-cache';

dotenv.config({
	path: '.env',
});

import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	proto,
} from 'baileys';
import log from 'baileys/lib/Utils/logger';
import { Boom } from '@hapi/boom';
import {
	getUnreadCount,
	saveGroupChat,
	savePrivateChat,
	updateChatUnreadCount,
} from 'src/Store/ChatStore';
import Context, { setMeFromCreds } from 'src/Context';
import { getMessage, getOriginalWaMessage, saveMessage } from 'src/Store/MessageStore';
import {
	createContactPayload,
	createContactFromSync,
	createGroupChatPayload,
	createMessagePayload,
	getPinInChatMessage,
	getPollUpdateMessage,
	saveLidMappingsFromMessage,
	stringifyMessageId,
} from 'src/PayloadTransformers';
import createBoundary from 'kozz-boundary-maker';
import { saveContact, saveLidMapping, saveLidMappings } from 'src/Store/ContactStore';
import { updateChatMetadata } from 'src/Store/MetadataStore';
import { getMessagePreview } from 'src/util/utility';
import { groupMemo } from 'src/util/groupMemo';
import { isGroupChatId, isGroupLikeChatId } from 'src/util/chat';
import { useSqliteAuthState } from './SqliteAuthState';

export type WaSocket = ReturnType<typeof makeWASocket>;

console.clear();
console.log('Initializing DB...');

let activeSocket: WaSocket | null = null;
let reconnecting = false;
const msgRetryCounterCache = new NodeCache({
	stdTTL: 60 * 60,
	useClones: false,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const initSession = (boundary: ReturnType<typeof createBoundary>) => {
	return startSocket(boundary);
};

const startSocket = async (boundary: ReturnType<typeof createBoundary>) => {
	if (activeSocket) {
		return activeSocket;
	}

	const logger = log.child({});
	logger.level = process.env.BAILEYS_LOG_LEVEL || 'fatal';

	console.log('Creating auth...');
	const { state, saveCreds } = await useSqliteAuthState();
	console.log('Done');
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

	const waSocket = makeWASocket({
		version,
		// This option is deprecated!
		// printQRInTerminal: true,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		generateHighQualityLinkPreview: true,
		msgRetryCounterCache,
		maxMsgRetryCount: 5,
		retryRequestDelayMs: 1000,
		getMessage: getRetryMessage,
		// syncFullHistory: true,
		logger,
		browser: Browsers.ubuntu('Desktop'),
	});
	Context.upsert({
		hostData: setMeFromCreds(state.creds),
	});
	activeSocket = waSocket;
	sessionEvents(waSocket, saveCreds, boundary);

	return waSocket;
};

const clearActiveSocket = (waSocket: WaSocket) => {
	if (activeSocket !== waSocket) {
		return;
	}

	waSocket.ev.removeAllListeners('creds.update');
	waSocket.ev.removeAllListeners('connection.update');
	waSocket.ev.removeAllListeners('messaging-history.set');
	waSocket.ev.removeAllListeners('messages.upsert');
	(waSocket.ev as any).removeAllListeners('lid-mapping.update');
	(waSocket.ev as any).removeAllListeners('chats.phoneNumberShare');
	activeSocket = null;
};

const reconnectSocket = async (
	waSocket: WaSocket,
	boundary: ReturnType<typeof createBoundary>
) => {
	if (reconnecting || activeSocket !== waSocket) {
		return;
	}

	reconnecting = true;
	clearActiveSocket(waSocket);

	try {
		await wait(1500);
		await startSocket(boundary);
	} finally {
		reconnecting = false;
	}
};

const isUndecryptableMessage = (message: any) =>
	!message.message ||
	message.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT;

const getRetryMessage = async (key: proto.IMessageKey) => {
	const candidateIds = [stringifyMessageId(key), key.id].filter(
		(id): id is string => !!id
	);

	for (const messageId of candidateIds) {
		const storedMessage = await getOriginalWaMessage(messageId);
		if (storedMessage?.message) {
			return storedMessage.message;
		}
	}

	return undefined;
};

const getReactionMessage = (message: any) =>
	message.message?.reactionMessage ||
	message.message?.ephemeralMessage?.message?.reactionMessage;

export const getGroupData = async (
	id: string,
	waSocket: ReturnType<typeof makeWASocket>
) => {
	const resp = await groupMemo
		.getData(id, () => waSocket.groupMetadata(id))
		.catch(err => undefined);
	return resp?.data;
};

const sessionEvents = (
	waSocket: ReturnType<typeof makeWASocket>,
	saveCreds: any,
	boundary: ReturnType<typeof createBoundary>
) => {
	waSocket.ev.on('creds.update', () => {
		saveCreds();
	});

	waSocket.ev.on('connection.update', (update: any) => {
		try {
			console.log('CONNECTION UPDATED =>', update);

			if (update.qr) {
				boundary.emitForwardableEvent('qr_code', update.qr);
				Context.upsert({
					qr: update.qr,
				});
			}

			const { connection, lastDisconnect } = update;

			if (connection === 'open' || update.isOnline) {
				console.log('Connected');
				reconnecting = false;
				boundary.emitForwardableEvent('chat_ready', undefined);
				Context.upsert({
					ready: true,
					qr: null,
				});
			}

			const loggedOut =
				(lastDisconnect?.error as Boom)?.output?.statusCode ===
				DisconnectReason.loggedOut;

			if (connection === 'close' && loggedOut) {
				clearActiveSocket(waSocket);
				return;
			}

			if (connection === 'close' && !loggedOut) {
				Context.upsert({
					ready: false,
					qr: null,
				});

				boundary.emitForwardableEvent('reconnecting', undefined);
				reconnectSocket(waSocket, boundary);
			}
		} catch (e) {
			console.warn(e);
		}
	});

	waSocket.ev.on('messaging-history.set', async (payload: any) => {
		try {
			if (Array.isArray(payload.lidPnMappings)) {
				await saveLidMappings(payload.lidPnMappings);
			}

			payload.messages.forEach(async (msg: any) => {
				if (isUndecryptableMessage(msg)) {
					return;
				}

				await saveLidMappingsFromMessage(msg);
				const payload = await createMessagePayload(msg, waSocket);
				await saveMessage(payload, msg);
			});

			payload.contacts.forEach(async (contact: any) => {
				const payload = await createContactFromSync(contact);
				await saveContact(payload);

				if (payload.isGroup) {
					if (!isGroupChatId(payload.id)) {
						await saveGroupChat(createGroupChatPayload({ id: payload.id }));
						return;
					}

					const groupData = await getGroupData(payload.id, waSocket);
					if (!groupData) {
						return;
					}

					await saveGroupChat(createGroupChatPayload(groupData));
				}
			});

			payload.chats.forEach(async (chat: any) => {
				updateChatUnreadCount(chat.id, chat.unreadCount);
			});

		} catch (e) {
			console.warn(e);
		}
	});

	// Persist incremental LID ↔ PN mappings pushed by WhatsApp at runtime.
	// Cast to `any` because the installed baileys version doesn't declare this
	// event in its BaileysEventMap yet, but it is emitted at runtime.
	(waSocket.ev as any).on('lid-mapping.update', async (mapping: any) => {
		try {
			const { pn, lid } = mapping;
			if (pn && lid) {
				await saveLidMapping(pn, lid);
				console.log(`[LID] Mapped lid=${lid} → pn=${pn}`);
			}
		} catch (e) {
			console.warn('[LID] lid-mapping.update error:', e);
		}
	});

	// WhatsApp pushes LID→PN mapping when a user shares their phone number
	// (e.g. after a group message from a LID-only contact).
	// This is the primary real-time source of LID↔PN resolution.
	waSocket.ev.on('chats.phoneNumberShare' as any, async ({ lid, jid }: { lid: string; jid: string }) => {
		try {
			if (lid && jid) {
				await saveLidMapping(jid, lid);
				console.log(`[LID] chats.phoneNumberShare: lid=${lid} → pn=${jid}`);
			}
		} catch (e) {
			console.warn('[LID] chats.phoneNumberShare error:', e);
		}
	});

	waSocket.ev.on('messages.upsert', async (upsert: any) => {
		for (const msg of upsert.messages) {
			if (isUndecryptableMessage(msg)) {
				continue;
			}

			console.log(`processando mensagem ${msg.key.id}`);
			await saveLidMappingsFromMessage(msg);
			if (msg.message?.stickerMessage) {
				msg.message.stickerMessage.url = `https://mmg.whatsapp.net${msg.message.stickerMessage.directPath}`;
			}

			try {
				const pinInChatMessage = getPinInChatMessage(msg);
				if (pinInChatMessage) {
					const chatId = pinInChatMessage.key?.remoteJid || msg.key.remoteJid;
					const pinnedMessageId = pinInChatMessage.key?.id ?? null;
					const isUnpin =
						pinInChatMessage.type ===
						proto.Message.PinInChatMessage.Type.UNPIN_FOR_ALL;
					const pinnedMessage =
						!isUnpin && pinnedMessageId
							? await getMessage(pinnedMessageId)
							: null;

					if (chatId) {
						updateChatMetadata({
							id: chatId,
							pinnedMessageId: isUnpin ? null : pinnedMessageId,
						});

						boundary.emitForwardableEvent('chat_pinned_message', {
							chatId,
							messageId: isUnpin ? null : pinnedMessageId,
							message: pinnedMessage,
						});
					}

					continue;
				}

				const pollUpdateMessage = getPollUpdateMessage(msg);
				if (pollUpdateMessage) {
					continue;
				}

				const reactionMessage = getReactionMessage(msg);
				if (reactionMessage) {
					const contact = await createContactPayload(msg, waSocket);
					boundary.emitForwardableEvent('chat_message_reaction', {
						chatId: reactionMessage.key?.remoteJid || msg.key.remoteJid,
						messageId: reactionMessage.key?.id,
						emoji: reactionMessage.text || '',
						from: contact.id,
						fromHostAccount: contact.isHostAccount,
						timestamp: Date.now(),
						contact,
					});
					continue;
				}

				const payload = await createMessagePayload(msg, waSocket);

				if (payload.contact.isBlocked) {
					return;
				}

				if (isGroupLikeChatId(payload.chatId)) {
					if (!isGroupChatId(payload.chatId)) {
						await saveGroupChat(createGroupChatPayload({ id: payload.chatId }));
					}
				}

					if (isGroupChatId(payload.chatId)) {
						const chatMetadata = await getGroupData(payload.chatId, waSocket);
						if (chatMetadata) {
							await saveGroupChat(createGroupChatPayload(chatMetadata));
						}
					} else if (!isGroupLikeChatId(payload.chatId)) {
						savePrivateChat({ id: payload.chatId });
					}

				await saveMessage(payload, msg);
				boundary.emitMessage(payload);
				boundary.emitForwardableEvent('chat_message_received', payload);

				const lastMessagePreview = getMessagePreview(payload);
				const lastMessageTimestamp = new Date().getTime();

				updateChatMetadata({
					id: payload.chatId,
					lastMessagePreview,
					lastMessageTimestamp,
				});

				boundary.emitForwardableEvent('chat_order_move_to_top', payload.chatId);
				if (!payload.fromHostAccount) {
					const unreadCount = (await getUnreadCount(payload.chatId)) + 1;
					await updateChatUnreadCount(payload.chatId, unreadCount);
					boundary.emitForwardableEvent('chat_unread_increment', {
						chatId: payload.chatId,
						unreadCount,
						lastMessagePreview,
						lastMessageTimestamp,
					});
				}
			} catch (e) {
				console.warn(e);
			}
		}
	});

	// waSocket.ev.on('chats.update', async (payload: any) => {
	// 	try {
	// 		console.log('CHAT UPDATED!!! => \n', JSON.stringify(payload, undefined, '  '));

	// 		// [TODO]: create types for all of this
	// 		payload.forEach((chat: any) => {
	// 			const id = chat.id;
	// 			const unreadCount = chat.unreadCount;
	// 			updateChatMetadata({
	// 				id,
	// 				unreadCount,
	// 			});
	// 		});
	// 	} catch (e) {
	// 		console.warn(e);
	// 	}
	// });
};
