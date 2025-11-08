import { updateGroupData, WaSocket } from './index.js';
import { AnyMessageContent, proto } from 'baileys';
import { ContactPayload, Media, SendMessagePayload } from 'kozz-types';
import context from '../Context/index.js';
import { downloadBuffer } from 'src/util/downloadBuffer.js';
import { convertJpegToWebp, convertMP4ToWebp } from 'src/MediaConverter/index.js';
import { getMessage } from 'src/Store/MessageStore.js';
import { generateHash, getFormattedDateAndTime } from 'src/util/utility.js';
import {
	CompanionObject,
	InlineCommandMap,
	StyleVariant,
} from 'kozz-boundary-maker/dist/InlineCommand/index.js';
import { getGroupChat } from 'src/Store/ChatStore.js';
// @ts-ignore
import webp from 'node-webpmux'

const database = context.get('database');

const getOGQuotedMessagePayload = (messageId?: string) => {
	if (!messageId) {
		return undefined;
	}

	const originalMessagePayload = database.getById(
		'message',
		messageId
	)?.originalMessagePayload;

	const response = originalMessagePayload
		? JSON.parse(originalMessagePayload)
		: undefined;

	return response;
};

const baileysFunctions = (client: WaSocket) => {
	const checkNumber = async (id: string) => {
		const result = await client.onWhatsApp(`${id}`);
		return result?.[0].exists;
	};

	const sendText = async (
		receiverId: string,
		text: string,
		quotedMessageId?: string,
		tagged?: string[]
	) => {
		
		try {
			return await client.sendMessage(
				receiverId,
				{
					text,
					mentions: tagged,
				},
				{
					quoted: getOGQuotedMessagePayload(quotedMessageId),
				}
			);
		} catch (e) {
			return undefined;
		}
	};

	const sendMedia = async (
		contactId: string,
		media: Media,
		options: {
			viewOnce?: boolean;
			caption?: string;
			mentionedList?: string[];
			asSticker?: boolean;
			asVoiceNote?: boolean;
			contact?: ContactPayload;
			emojis?: string[];
		},
		quoteId?: string
	) => {
		//console.log({ media, options });

		const sendMediaOptions: Partial<AnyMessageContent> = {
			viewOnce: options?.viewOnce,
			mentions: options?.mentionedList ?? [],
			caption: options?.caption,
		};
		
		let mediaData =
			media.transportType === 'b64'
				? Buffer.from(media.data, 'base64url')
				: await downloadBuffer(media.data);

		if (options?.asSticker) {
			let isAnimated = false;
			if (media.mimeType === 'video/mp4') {
				isAnimated = true;
				mediaData =
					(await convertMP4ToWebp(mediaData.toString('base64url'))) ?? mediaData;
			} else {
				mediaData = (await convertJpegToWebp(media.data)) ?? mediaData;
			}
			const emoji = options?.emojis || [''];
			const metadata = {
				name: `Criado por ${
					options?.contact?.publicName
				}\n${getFormattedDateAndTime()}\n${emoji[0] || ''}`,
				author: '\nKozz-Bot\ndo Tramonta',
			};
			const img = new webp.Image();
			const stickerPackId = generateHash(32);
			const packname = metadata.name;
			const author = metadata.author;
			const emojis = emoji;
			const json = {
				'sticker-pack-id': stickerPackId,
				'sticker-pack-name': packname,
				'sticker-pack-publisher': author,
				emojis: emojis,
			};
			let exifAttr = Buffer.from([
				0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07,
				0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
			]);
			let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
			// @ts-ignore
			let exif = Buffer.concat([exifAttr, jsonBuffer]);
			exif.writeUIntLE(jsonBuffer.length, 14, 4);
			await img.load(Buffer.from(mediaData as any, 'base64'));
			img.exif = exif;
			mediaData = await img.save(null);

			try {
				return client.sendMessage(
					contactId,
					{
						...sendMediaOptions,
						sticker: mediaData,
						isAnimated: isAnimated,
					},
					{
						quoted: getOGQuotedMessagePayload(quoteId),
					}
				);
			} catch (e) {
				return undefined;
			}
		}

		if (media.mimeType.startsWith('audio')) {

			try {
				return await client.sendMessage(
					contactId,
					{
						...sendMediaOptions,
						audio: mediaData,
						ptt: options?.asVoiceNote,
						mimetype: 'audio/mp4',
					},
					{
						quoted: getOGQuotedMessagePayload(quoteId),
					}
				);
			} catch (e) {
				return undefined;
			}
		}

		if (media.mimeType.startsWith('image')) {
			try {
				return await client.sendMessage(
					contactId,
					{
						...sendMediaOptions,
						image: mediaData,
					},
					{
						quoted: getOGQuotedMessagePayload(quoteId),
					}
				);
			} catch (e) {
				console.log(e)
				return undefined;
			}
		}

		if (media.mimeType.startsWith('video')) {
			try {
				return await client.sendMessage(
					contactId,
					{
						...sendMediaOptions,
						video: mediaData,
					},
					{
						quoted: getOGQuotedMessagePayload(quoteId),
					}
				);
			} catch (e) {
				return undefined;
			}
		}
		try {
			return await client.sendMessage(
				contactId,
				{
					...sendMediaOptions,
					text: '',
					document: mediaData,
				},
				{
					quoted: getOGQuotedMessagePayload(quoteId),
				}
			);
		} catch (e) {
			return undefined;
		}
	};

	const reactMessage = async (messageId: string, emoji: string) => {
		const ogMessage = await getMessage(messageId);
		if (!ogMessage) {
			return;
		}

		const ogPayload = JSON.parse(
			ogMessage.originalMessagePayload
		) as proto.IWebMessageInfo;

		return client.sendMessage(ogPayload.key.remoteJid!, {
			react: {
				key: ogPayload.key,
				text: emoji,
			},
		});
	};

	const getProfilePic = async (contactId: string) => {
		try {
			const profilePic = await client.profilePictureUrl(contactId, 'image');
			return profilePic;
		} catch (e) {
			console.warn(e);
			return undefined;
		}
	};

	const deleteMessage = async (messageId: string) => {
		try {
			const ogMessage = await getMessage(messageId);
			if (!ogMessage) {
				return;
			}

			const ogPayload = JSON.parse(
				ogMessage.originalMessagePayload
			) as proto.IWebMessageInfo;

			const response = await client.sendMessage(ogPayload.key.remoteJid!, {
				delete: ogPayload.key,
			});
			return response;
		} catch (e) {
			console.warn(e);
			return undefined;
		}
	};

	return {
		checkNumber,
		sendMedia,
		sendText,
		reactMessage,
		getProfilePic,
		deleteMessage,
	};
};

export const inlineCommandMapFunctions = (): InlineCommandMap => {
	const mention = async (
		companion: CompanionObject,
		data: { id: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions, data.id],
			},
			stringValue: '@' + data.id.replace('@s.whatsapp.net', ''),
		};
	};

	const invisiblemention = async (
		companion: CompanionObject,
		data: { id: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions, data.id],
			},
			stringValue: '',
		};
	};
	const tageveryone = async (
		companion: CompanionObject,
		data: { except: string[] },
		payload: any
	) => {
		let mentions: string[] = [];

		let chatInfo = await getGroupChat(payload.chatId);
		const oneHour = 3600000;// 60 * 60 * 1000;
		if (!chatInfo || chatInfo?.lastFetched! < (new Date().getTime() + oneHour)) {
			await updateGroupData(payload.chatId);
			chatInfo = await getGroupChat(payload.chatId);
			if (!chatInfo) {
				console.warn('Unable to fetch admin list from group ID:', payload.chatId);
			}
			
		}

		if (chatInfo) {
			mentions = chatInfo.participants
				.map((member:any) => member.id)
				.filter((member:any) => !data.except.includes(member));
		}

		return {
			companion: {
				mentions: [...companion.mentions, ...mentions],
			},
			stringValue: '',
		};
	};
	const bold = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const italic = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const underscore = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const stroke = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const paragraph = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const listitem = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};
	const monospace = async (
		companion: CompanionObject,
		data: { content: string },
		payload: any
	) => {
		return {
			companion: {
				mentions: [...companion.mentions],
			},
			stringValue: data.content,
		};
	};

	return {
	mention,
	invisiblemention,
	tageveryone,
	begin_style: function (companion: CompanionObject, data: { variant: StyleVariant; }, payload: SendMessagePayload): Promise<{ companion: CompanionObject; stringValue: string; }> {
		throw new Error('Function not implemented.');
	},
	end_style: function (companion: CompanionObject, data: { variant: StyleVariant; }, payload: SendMessagePayload): Promise<{ companion: CompanionObject; stringValue: string; }> {
		throw new Error('Function not implemented.');
	}
};
};

export default baileysFunctions;
