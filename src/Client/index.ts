import dotenv from 'dotenv';

dotenv.config({
	path: '.env',
});

import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import log from '@whiskeysockets/baileys/lib/Utils/logger';
import { Boom } from '@hapi/boom';
import {
	getGroupChat,
	saveGroupChat,
	savePrivateChat,
	updateChatUnreadCount,
} from 'src/Store/ChatStore';
import Context, { setMeFromCreds } from 'src/Context';
import { saveMessage } from 'src/Store/MessageStore';
import {
	createContactFromSync,
	createGroupChatPayload,
	createMessagePayload,
	createGroupParticipantsUpdatePayload
} from 'src/PayloadTransformers';
import createBoundary from 'kozz-boundary-maker';
import { saveContact } from 'src/Store/ContactStore';
import { updateChatMetadata } from 'src/Store/MetadataStore';
import { getMessagePreview } from 'src/util/utility';
import { groupMemo } from 'src/util/groupMemo';

export type WaSocket = ReturnType<typeof makeWASocket>;

console.clear();
console.log('Initializing DB...');

export const initSession = (boundary: ReturnType<typeof createBoundary>) => {
	return startSocket(boundary);
};

const startSocket = async (boundary: ReturnType<typeof createBoundary>) => {
	const logger = log.child({});
	logger.level = 'error';

	console.log('Creating auth...');
	const { state, saveCreds } = await useMultiFileAuthState('./creds');
	console.log('Done');
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

	const waSocket = makeWASocket({
		version,
		printQRInTerminal: true,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		generateHighQualityLinkPreview: true,
		syncFullHistory: true,
		logger,
		browser: Browsers.ubuntu('Desktop'),
	});
	setMeFromCreds();
	sessionEvents(waSocket, saveCreds, boundary);

	return waSocket;
};

export const getGroupData = async (
	id: string,
	waSocket: ReturnType<typeof makeWASocket>
) => {
	const resp = await groupMemo
		.getData(id, () => waSocket.groupMetadata(id))
		.catch((err:any) => undefined);
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
				boundary.emitForwardableEvent('kozz-iwac', 'qr_code');
				Context.upsert({
					qr: update.qr,
				});
			}

			const { connection, lastDisconnect } = update;

			if (connection === 'open' || update.isOnline) {
				console.log('Connected');
				boundary.emitForwardableEvent('kozz-iwac', 'chat_ready');
				Context.upsert({
					ready: true,
					qr: null,
				});
			}

			const loggedOut =
				(lastDisconnect?.error as Boom)?.output?.statusCode ===
				DisconnectReason.loggedOut;

			if (connection === 'close' && !loggedOut) {
				Context.upsert({
					ready: false,
					qr: null,
				});

				boundary.emitForwardableEvent('kozz-iwac', 'reconnecting');
				startSocket(boundary);
			}
		} catch (e) {
			console.warn(e);
		}
	});

	waSocket.ev.on('messaging-history.set', (payload: any) => {
		try {
			payload.messages.forEach(async (msg: any) => {
				const payload = await createMessagePayload(msg, waSocket);
				await saveMessage(payload, msg);
			});

			payload.contacts.forEach(async (contact: any) => {
				const payload = await createContactFromSync(contact);
				await saveContact(payload);

				if (payload.isGroup) {
					const groupData = getGroupData(payload.id, waSocket);
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

	waSocket.ev.on('messages.upsert', async (upsert: any) => {
		for (const msg of upsert.messages) {
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage)
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message)
			console.log(`processando mensagem ${msg.key.id}`);
			if (msg.message?.stickerMessage) {
				msg.message.stickerMessage.url = `https://mmg.whatsapp.net${msg.message.stickerMessage.directPath}`;
			}

			try {
				const payload = await createMessagePayload(msg, waSocket);
				if (Context.get('blockedList').includes(payload.from)) {
					return;
				}

				await saveMessage(payload, msg);
				boundary.emitMessage(payload);

				updateChatMetadata({
					id: payload.chatId,
					lastMessagePreview: getMessagePreview(payload),
					lastMessageTimestamp: new Date().getTime(),
				});

				boundary.emitForwardableEvent('chat_order_move_to_top', payload.chatId);
			} catch (e) {
				console.warn(e);
			}
		}
	});

	waSocket.ev.on('chats.update', async (payload: any) => {
		try {
			console.log('CHAT UPDATED!!! => \n', JSON.stringify(payload, undefined, '  '));

			// [TODO]: create types for all of this
			payload.forEach((chat: any) => {
				const id = chat.id;
				const unreadCount = chat.unreadCount;
				updateChatMetadata({
					id,
					unreadCount,
				});
			});
		} catch (e) {
			console.warn(e);
		}
	});

	waSocket.ev.on('group-participants.update', async (payload:any) => {
		
		const newPayload = 	await createGroupParticipantsUpdatePayload(payload);
		if(payload.action == 'add'){
			// adicionado ao grupo
			boundary.emitUserJoinedGroup(newPayload as any);
			boundary.emitForwardableEvent('added_group_participants',newPayload);
		}else if(payload.action == 'remove'){
			//removido do grupo		
			boundary.emitUserLeftGroup(newPayload as any);
			boundary.emitForwardableEvent('removed_group_participants',newPayload);
		}else if(payload.action == 'promote'){
			//torna admin
			boundary.emitForwardableEvent('promoted_group_participants',newPayload);
		}else if(payload.action == 'demote'){
			//retira admin
			boundary.emitForwardableEvent('demoted_group_participants',newPayload);
		}				
		
		boundary.emitForwardableEvent('updated_group_participants',newPayload);

	});

	
}
