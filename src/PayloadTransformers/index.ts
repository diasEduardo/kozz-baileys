import { WAMessage, WASocket, proto } from '@whiskeysockets/baileys';
import { ContactPayload, MessageReceived } from 'kozz-types';
import Context from 'src/Context';
import context from 'src/Context';
import { getContact } from 'src/Store/ContactStore';
import { getMessage } from 'src/Store/MessageStore';
import { downloadMediaFromMessage } from 'src/util/media';
import { clearContact, replaceTaggedName } from 'src/util/utility';

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

export const createContactPayload = async (
	message: WAMessage
): Promise<ContactPayload> => {
	const getContactId = (message: WAMessage) => {
		if(message.key.fromMe){
			return Context.get('hostData').id;
		}
		return message.key.participant || message.participant || message.key.remoteJid!;
	};
	
	const contactId = clearContact(getContactId(message));
	
	return {
		hostAdded: false,
		id: contactId,
		isHostAccount: !!message.key.fromMe,
		isBlocked: context.get('blockedList').includes(message.key.participant!),
		publicName: message.pushName || '',
		isGroup: message.key.participant ? true : false,
		privateName: '',
	};
};

export const createMessagePayload = async (
	message: WAMessage,
	waSocket: WASocket
): Promise<MessageReceived> => {
	const media = await downloadMediaFromMessage(message, waSocket);
	const contact = await createContactPayload(message);
	const taggedContact = await createtTaggedContactPayload(message);
	
	const messageBody =
		message.message?.conversation ||
		message.message?.extendedTextMessage?.text ||
		message?.message?.imageMessage?.caption ||
		message?.message?.videoMessage?.caption ||
		'';

	let taggedConctactFriendlyBody = messageBody;
	if (taggedContact.length){
		taggedConctactFriendlyBody = replaceTaggedName(messageBody,taggedContact);
	}
	const messageType = message.message?.extendedTextMessage
		? 'TEXT'
		: message.message?.audioMessage
		? 'AUDIO'
		: message.message?.stickerMessage
		? 'STICKER'
		: message.message?.videoMessage
		? 'VIDEO'
		: message.message?.imageMessage
		? 'IMAGE'
		: 'TEXT';

	const contextInfo = (
		message.message?.extendedTextMessage ||
		message.message?.audioMessage ||
		message.message?.stickerMessage ||
		message.message?.videoMessage ||
		message.message?.imageMessage
	)?.contextInfo!;

	const id = message.key.id!;
	const quotedMessageId = contextInfo?.stanzaId!;

	const quotedMessage = quotedMessageId
		? await getMessage(quotedMessageId)
		: undefined;
	//&& !quotedMessage
	if(quotedMessageId  ){
		const a = await waSocket.fetchMessageHistory(50,{
			remoteJid:message.key.remoteJid!,
			fromMe:clearContact(contextInfo?.participant||'') == clearContact(Context.get('hostData').id),
			id:quotedMessageId
		},0);

		console.log('tem quote e não tem salva');

		
		if(contact.isHostAccount){
			console.log(JSON.stringify(contextInfo))
		}


	}

	if(contact.isHostAccount){
		console.log(JSON.stringify(message))
	}
	
	if (messageBody.toLowerCase() === 'teste') {
		console.log({ id, quotedMessageId, quotedMessage });
	}

	return {
		body: messageBody,
		boundaryName: process.env.BOUNDARY_NAME ?? '',
		id,
		contact: await createContactPayload(message),
		from: contact.id,
		fromHostAccount: contact.isHostAccount,
		isViewOnce: false,
		to: message.key.remoteJid!,
		messageType: messageType,
		platform: 'Baileys',
		quotedMessage: quotedMessage || undefined,
		santizedBody: messageBody
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, ''),
		taggedContacts: taggedContact,
		timestamp: new Date().getTime(),
		taggedConctactFriendlyBody: taggedConctactFriendlyBody,
		media,
	};
};

export const createtTaggedContactPayload = async (
	message: WAMessage
): Promise<ContactPayload[]> => {
	let contacts:ContactPayload[] = [];
	if(message.message?.extendedTextMessage?.contextInfo?.mentionedJid){
		for (const contactId of message.message?.extendedTextMessage?.contextInfo?.mentionedJid){
			const contact = await getContact(contactId);
			if(contact){
				contacts.push(contact);
			}				
		}
	}	
	
	return contacts;
}

export const createGroupParticipantsUpdatePayload = async (
	payload: any
) =>{
	/*{
				'group-participants.update': {
				  id: '120363382913527538@g.us',
				  author: '555181953191@s.whatsapp.net',
				  participants: [ '555181953191@s.whatsapp.net' ],
				  action: 'remove' 
				}
			  }
				*/

	return {
		from: payload.author || payload.id,
		to: payload.id,
		action:payload.action
	}

}