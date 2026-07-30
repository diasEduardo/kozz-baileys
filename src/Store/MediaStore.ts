import { Media } from 'kozz-types';
import { randomUUID } from 'crypto';
import Context from 'src/Context';
import fs from 'fs/promises';
import mime from 'mime-types';
import path from 'path';
import { appPaths } from 'src/InstanceConfig';

const database = Context.get('database');

export const saveMedia = async (media: Media): Promise<string> => {
	const mediaId = `${randomUUID()}.${mime.extension(media.mimeType)}`;
	const filePath = path.join(appPaths.mediaDir, mediaId);

	await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));

	await database.upsert('media', {
		id: mediaId,
		timestamp: new Date().getTime(),
		mimeType: media.mimeType,
		originalFileName: media.fileName ?? `NO_NAME.${mime.extension(media.mimeType)}`,
	});

	return mediaId;
};

export const getMedia = async (id: string): Promise<Media> => {
	const file = await fs.readFile(path.join(appPaths.mediaDir, id));
	const media = database.getById('media', id);

	return {
		data: file.toString('base64'),
		fileName: id,
		mimeType: media?.mimeType || mime.lookup(id.split('.').pop() || '') || 'octet/stream',
		sizeInBytes: file.byteLength,
		stickerTags: [],
		transportType: 'b64',
		duration: null,
	};
};
