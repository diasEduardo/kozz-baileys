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
import NodeCache from 'node-cache'
import BaileysBottle from 'baileys-bottle';
import log from '@whiskeysockets/baileys/lib/Utils/logger';
import { Boom } from '@hapi/boom';
import { getGroupChat, saveGroupChat } from 'src/Store/ChatStore';
import Context, { setMeFromCreds } from 'src/Context';
import { boundary } from '..';
import { saveMessage } from 'src/Store/MessageStore';
import { createGroupParticipantsUpdatePayload, createMessagePayload } from 'src/PayloadTransformers';

export type WaSocket = ReturnType<typeof makeWASocket>;

console.clear();
console.log('Initializing DB...');

export const initSession = (sessionName: string) =>
	BaileysBottle.init({
		type: 'sqlite',
		database: 'db.sqlite',
	}).then(async (bottle:any) => {
		console.log('DB initialized');
		console.log(`Starting client "${sessionName}"`);

		return startSocket();
	});


const startSocket = async () => {
	const logger = log.child({});
	logger.level = 'info';

	console.log('Creating auth...');
	const msgRetryCounterCache = new NodeCache()
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
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		logger,
		browser: Browsers.ubuntu('Desktop'),
	});
	setMeFromCreds();
	sessionEvents(waSocket,saveCreds);
	

	// waSocket.ev.on('contacts.update', payload => {
	// 	console.log('[CONTACTS UPDATE]', { payload });
	// });

	// waSocket.ev.on('contacts.upsert', payload => {
	// 	console.log('[CONTACTS, UPSERT]', { payload });
	// });

	return waSocket;
};

const sessionEvents = (waSocket:any,saveCreds:any) =>{

	waSocket.ev.process(async (events:any) => {
		// credentials updated -- save them
		if (events['creds.update']) await saveCreds();
		if(events['messaging-history.set']?.progress){
			console.log(`CHAT SYNC ${events['messaging-history.set']?.progress}%`)
		}
		if (events['connection.update']) {
			const update = events['connection.update'];
			console.log('CONNECTION UPDATED =>', update);
			const { connection, lastDisconnect } = update;
			connection === 'open'
				? console.log('Connected')
				: connection === 'close'
				? (lastDisconnect?.error as Boom)?.output?.statusCode !==
					DisconnectReason.loggedOut
					? startSocket()
					: (async () => {
							startSocket();
						})()
				: null;
		}
	});

	waSocket.ev.on('messages.upsert', async (upsert:any) => {
		
		for (const msg of upsert.messages) {
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage)
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message)
			console.log(`processando mensagem ${msg.key.id}`)
			if(msg.message?.stickerMessage){
				msg.message.stickerMessage.url = `https://mmg.whatsapp.net${msg.message.stickerMessage.directPath}`
			}
			
			try {
				const payload = await createMessagePayload(msg, waSocket);
				if (Context.get('blockedList').includes(payload.from)) {
					return;
				}

				await saveMessage(payload, msg);
				// console.log(
				// 	JSON.stringify(
				// 		{
				// 			body: payload.body,
				// 			author: payload.contact.id,
				// 			msg,
				// 		},
				// 		undefined,
				// 		'  '
				// 	)
				// );
				boundary.emitMessage(payload);
			} catch (e) {
				console.warn(e);
			}
		}
	});

	waSocket.ev.on('chats.update', async (payload:any) => {
		if (payload[0].id?.includes('@g.us')) {
			const groupChatInfo = await getGroupChat(payload[0].id);
			const oneHour = 60 * 60 * 1000;
			
			if (
				groupChatInfo?.lastFetched! <= new Date().getTime() + oneHour
			) {
				return;
			}

			waSocket.groupMetadata(payload[0].id).then((resp:any) =>
				saveGroupChat({
					id: resp.id,
					community: resp.linkedParent ?? null,
					description: resp.desc ?? '',
					memberCount: resp.size!,
					name: resp.subject,
					owner:
						resp.owner ??
						resp.participants.find(
							(participant:any) => participant.admin === 'superadmin'
						)?.id ??
						'NOT_FOUND',
					participants: resp.participants.map((participant:any) => ({
						admin: !!participant.admin,
						id: participant.id,
					})),
				})
			);
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