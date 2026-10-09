import {
	initAuthCreds,
	BufferJSON,
	makeCacheableSignalKeyStore,
} from 'baileys';

import Context from 'src/Context/index.js';
import { CredsModel, KeysModel } from './models.js';

const database = Context.get('databaseCreds');

const SESSION_ID = 'kozz-baileys';

/**
 * Credentials
 */

export const saveCreds = async (creds: CredsModel): Promise<string> => {
	await database.upsert('creds', {
    id: creds.id,
    data: JSON.stringify(creds, BufferJSON.replacer),
  });

	return SESSION_ID;
};

export const getCreds = async (): Promise<CredsModel | null> => {
	const creds = database.getValues(
		'creds',
		(data: CredsModel) => data.id === SESSION_ID
	) as CredsModel | null;

	if (!creds?.length) {
		return null;
	}

	return JSON.parse(
		creds[0].data,
		BufferJSON.reviver
	);
};

/**
 * Signal keys
 */

const getKey = (
	type: string,
	id: string,
) => `${SESSION_ID}:${type}:${id}`;


const getKeys = async (
	type: string,
	ids: string[],
) => {
	const result: Record<string, any> = {};

	const keys = database.getValues(
		'keys',
		(data: KeysModel) => data.sessionId === SESSION_ID &&
			data.type === type &&
			ids.includes(data.keyId)
	) as KeysModel[] | null;

	for (const id of ids) {
		const key = keys?.find(
			(item) => item.keyId === id
		);

		if (key) {
			result[id] = JSON.parse(
				key.value,
				BufferJSON.reviver
			);
		} else {
			result[id] = null;
		}
	}

	return result;
};


const setKeys = async (
	data: Record<string, Record<string, any>>,
) => {
	for (const [type, entries] of Object.entries(data)) {
		for (const [id, value] of Object.entries(entries)) {

			const key = getKey(type, id);

			if (value === null || value === undefined) {
				database.deleteValues(
					'keys',
					(item: KeysModel) => item.id === key
				);

				continue;
			}

			await database.upsert('keys', {
				id: key,
				sessionId: SESSION_ID,
				type,
				keyId: id,
				value: JSON.stringify(
					value,
					BufferJSON.replacer
				),
			});
		}
	}
};

export const useRealmDBAuthStore = async () => {

	let creds = await getCreds();

	if (!creds) {
		creds = {
			...initAuthCreds(),
			id: SESSION_ID,
		} as CredsModel;

		await saveCreds(creds);
	}

	const keys = {
		get: getKeys,

		set: setKeys,
	};

	return {
		state: {
			creds,
			keys,
		},

		saveCreds: () => saveCreds(creds!),
	};
};