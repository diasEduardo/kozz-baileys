import { initSession } from './Client';
import baileysFunctions, { inlineCommandMapFunctions } from './Client/BaileysFunctions';
import Context from './Context';
import { convertMP4ToWebp } from './MediaConverter';
import { createMessagePayload } from './PayloadTransformers';
import { getMessage, saveMessage } from './Store/MessageStore';
import createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility';
import { getGroupChat } from './Store/ChatStore';


const boundary = createBoundary({
	url: `${process.env.GATEWAY_URL}`,
	chatPlatform: 'Baileys',
	name: `${process.env.BOUNDARY_ID}`,
	inlineCommandMap:inlineCommandMapFunctions()
});

createFolderOnInit();

initSession('tramont').then((waSocket:any) => {
	const baileys = baileysFunctions(waSocket);

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

	boundary.handleReplyWithText((payload, companion, body) => {
		baileys.sendText(payload.chatId, body, payload.quoteId, companion.mentions);
	});

	boundary.handleReplyWithSticker(async (payload, companion, caption) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{
				caption,
				mentionedList: companion.mentions,
				asSticker: true,
				contact:payload.contact,
				emojis:payload.media?.emojis
			},
			payload.quoteId
		);
	});

	boundary.handleReplyWithMedia((payload, companion, caption) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{
				caption,
				mentionedList: companion.mentions,
			},
			payload.quoteId
		);
	});

	boundary.handleSendMessage((payload, companion, body) => {
		baileys.sendText(payload.chatId, body, undefined, companion.mentions);
	});

	boundary.handleReactMessage(async payload => {
		baileys.reactMessage(payload.messageId, payload.emote);
	});

	boundary.onAskResource('contact_profile_pic', async ({ id }) => {
		console.log('getting profile pic url from', id);
		let pic;
		if(id){
			pic = await baileys.getProfilePic(id);
			console.log({ pic });
		}
		return pic;
	});

	boundary.onAskResource('group_chat_info', async ({ id }) => {
		console.log('getting group chart info from', id);
		const chatInfo = await getGroupChat(id);
		return chatInfo;
	});

	boundary.hanldeDeleteMessage(payload => {
		baileys.deleteMessage(payload.messageId);
	});
});
