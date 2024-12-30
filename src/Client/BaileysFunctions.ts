import { WaSocket } from '.';
import { AnyMessageContent, proto } from '@whiskeysockets/baileys';
import { ContactPayload, Media } from 'kozz-types';
import context from '../Context';
import { downloadBuffer } from 'src/util/downloadBuffer';
import { convertJpegToWebp, convertMP4ToWebp } from 'src/MediaConverter';
import { getMessage } from 'src/Store/MessageStore';
import { getFormattedDateAndTime } from 'src/util/utility';
const webp = require('node-webpmux'); // import has type error.

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
		const [result] = await client.onWhatsApp(`${id}`);
		return result.exists;
	};

	const sendText = async (
		receiverId: string,
		text: string,
		quotedMessageId?: string,
		tagged?: string[]
	) => {
		return client.sendMessage(
			receiverId,
			{
				text,
				mentions: tagged,
			},
			{
				quoted: getOGQuotedMessagePayload(quotedMessageId),
			}
		);
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
			contact?:ContactPayload;
			emojis?:string[];
		},
		quoteId?: string
	) => {
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
				name :`Criado por ${options?.contact?.publicName}\n${getFormattedDateAndTime()}\n${emoji[0]}\n`,
				author:'\nKozz-Bot\ndo Tramonta'
			}
			if (metadata.name || metadata.author) {
				const img = new webp.Image();
				const stickerPackId = 'EduTramontaBot';
				const packname = metadata.name;
				const author = metadata.author;
				const emojis = emoji;
				const json = { 
					'sticker-pack-id': stickerPackId, 
					'sticker-pack-name': packname, 
					'sticker-pack-publisher': author, 
					'emojis': emojis
				 };
				let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
				let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
				let exif = Buffer.concat([exifAttr, jsonBuffer]);
				exif.writeUIntLE(jsonBuffer.length, 14, 4);
				await img.load(Buffer.from(mediaData as any, 'base64'));
				img.exif = exif;
				mediaData = (await img.save(null));
			}

			return client.sendMessage(
				contactId,
				{
					...sendMediaOptions,
					sticker: mediaData,
					isAnimated: isAnimated
				},
				{
					quoted: getOGQuotedMessagePayload(quoteId),
				}
			);
		}

		if (media.mimeType.startsWith('audio')) {
			return client.sendMessage(
				contactId,
				{
					...sendMediaOptions,
					audio: mediaData,
					ptt: options?.asVoiceNote,
				},
				{
					quoted: getOGQuotedMessagePayload(quoteId),
				}
			);
		}

		if (media.mimeType.startsWith('image')) {
			console.log(mediaData)
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
		}

		if (media.mimeType.startsWith('video')) {
			return client.sendMessage(
				contactId,
				{
					...sendMediaOptions,
					video: mediaData,
				},
				{
					quoted: getOGQuotedMessagePayload(quoteId),
				}
			);
		}

		return client.sendMessage(
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
			console.log(contactId)
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

export default baileysFunctions;
