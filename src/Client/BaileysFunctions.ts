import { WaSocket } from '.';
import { AnyMessageContent, proto } from '@whiskeysockets/baileys';
import { Media } from 'kozz-types';
import context from '../Context';
import { downloadBuffer } from 'src/util/downloadBuffer';
import { convertJpegToWebp, convertMP4ToWebp } from 'src/MediaConverter';
import { getMessage } from 'src/Store/MessageStore';

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
			console.log(media.mimeType);

			if (media.mimeType === 'video/mp4') {
				mediaData =
					(await convertMP4ToWebp(mediaData.toString('base64url'))) ?? mediaData;
			} else {
				mediaData = (await convertJpegToWebp(media.data)) ?? mediaData;
			}

			return client.sendMessage(
				contactId,
				{
					...sendMediaOptions,
					sticker: mediaData,
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
			return client.sendMessage(
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
