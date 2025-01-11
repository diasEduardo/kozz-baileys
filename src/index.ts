import { initSession } from './Client';
import baileysFunctions, { inlineCommandMapFunctions } from './Client/BaileysFunctions';
import Context from './Context';
import { convertMP4ToWebp } from './MediaConverter';
import { createMessagePayload } from './PayloadTransformers';
import { getMessage, saveMessage } from './Store/MessageStore';
import createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility';
import { getGroupChat } from './Store/ChatStore';


export const boundary = createBoundary({
	url: `${process.env.GATEWAY_URL}`,
	chatPlatform: 'Baileys',
	name: `${process.env.BOUNDARY_ID}`,
	inlineCommandMap:inlineCommandMapFunctions()
});

createFolderOnInit();

initSession('tramont').then((waSocket:any) => {
	const baileys = baileysFunctions(waSocket);

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
		if(id.includes('@g.us')){
			const chatInfo = await getGroupChat(id);
			return chatInfo;
		}
		console.log(`${id} is not a valid group`);
		return {};
		
		
	});

	boundary.onAskResource('group_admin_list', async ({ id }) => {
		console.log('getting group admin list from', id);
		if(id.includes('@g.us')){
			let chatInfo = await getGroupChat(id);
			return {'adminList':chatInfo?.participants.filter((member:any) => member.admin)};
		}
		console.log(`${id} is not a valid group`);
		return {};
		
	});

	boundary.hanldeDeleteMessage(payload => {
		baileys.deleteMessage(payload.messageId);
	});
});
