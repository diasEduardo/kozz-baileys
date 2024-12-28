import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { resolve } from 'path';

const inTempMediaPath = './medias/tempFile';
const outTempMediaPath = './medias/tempFile';

export const getTransparentBackground = async (width: number, height: number) => {
	try {
		const background = await sharp({
			create: {
				width: 512,
				height: 512,
				channels: 4,
				background: {
					r: 0,
					g: 0,
					b: 0,
					alpha: 0,
				},
			},
		})
			.toFormat('webp')
			.toBuffer();

		return background;
	} catch (e) {
		console.warn(e);
		console.trace();
	}
};

export const convertJpegToWebp = async (base64: string) => {
	try {
		const buffer = Buffer.from(base64, 'base64url');
		const background = await getTransparentBackground(512, 512);
		const image = await sharp(buffer)
			.toFormat('webp')
			.resize({ width: 512, height: 512, fit: 'inside' })
			.toBuffer();

		const composed = await sharp(background)
			.composite([
				{
					input: image,
				},
			])
			.toFormat('webp')
			.toBuffer();

		return composed;
	} catch (e) {
		console.warn(e);
		console.trace();
	}
};

export const convertMP4ToWebp = async (
	base64: string
): Promise<Buffer | undefined> => {
	try {
		const inFilePath = `${inTempMediaPath}.mp4`;
		const outFilePath = `${outTempMediaPath}.webp`;

		await fs.writeFile(inFilePath, base64, {
			encoding: 'base64url',
		});

		return new Promise(resolve => {
			ffmpeg(inFilePath)
				.saveToFile(outFilePath)
				.addOutputOptions([
					'-vcodec',
					'libwebp',
					'-vf',
					"scale='iw*min(300/iw,300/ih)':'ih*min(300/iw,300/ih)',format=rgba,pad=300:300:'(300-iw)/2':'(300-ih)/2':'#00000000',setsar=1,fps=10",
					'-loop',
					'0',
					'-preset',
					'default',
					'-an',
					'-s',
					'512:512',
					'-fs',
					'900K',
				])
				.on('end', async () => {
					const out = await fs.readFile(outFilePath);
					resolve(out);
				})
				.on('error', () => resolve(undefined));
		});
	} catch (e) {
		console.warn(e);
		console.trace();
	}
};
