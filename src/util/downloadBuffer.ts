import axios from 'axios';
import { fromBuffer } from 'file-type';

export const downloadBuffer = (url: string): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		try {
			axios.get(url, { responseType: 'arraybuffer' }).then(async result => {
				resolve(Buffer?.from(result.data));
			});
		} catch (error) {
			reject(error);
		}
	});
};
