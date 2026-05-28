import Context from 'src/Context/index.js';
import { CredsModel } from './models.js';

const database = Context.get('database');

export const saveCreds = async (creds: CredsModel): Promise<string> => {
	await database.upsert('creds', {
		...creds,
	});

	return creds.id;
};

export const getCreds = async (): Promise<CredsModel | null> => {
	const creds = (await database.getValues('creds',  (data:CredsModel) => true)) as CredsModel[] | null;
	if (!creds) {
		return null;
	}

	return creds[0];
};
/*
export  async function useRealmDBAuthStore() {

	async function writeData(data, key) {
			const dataString = JSON.stringify(data, BufferJSON.replacer);

			if (key != 'creds') {
					await fs.writeFile(localFile(key), dataString)
					return;
			}
			await saveKey(sessionID, dataString)
			return;
	};

	async function readData(key) {
			try {

					let rawData;

					if (key != 'creds') {
							if (!(await fileExists(localFile(key)))) return null;
							rawData = await fs.readFile(localFile(key), { encoding: 'utf-8' })
					} else {
							rawData = (await getAuthKey(sessionID))
					}

					const parsedData = JSON.parse(rawData, BufferJSON.reviver);
					return parsedData;
			} catch (error) {
					return null;
			}
	}

	async function removeData(key) {
			try {
					if (key != 'creds') {
							await fs.unlink(localFile(key))
					} else {
							await deleteAuthKey(sessionID)
					}
			} catch (error) {
					return;
			}
	}

	let creds = await readData('creds');
	if (!creds) {
			creds = initAuthCreds();
			await writeData(creds, 'creds');
	}

	return {
		state: {
			creds,
			keys: {
				get: async (type:string, ids:number[]) => {
					const data:any = {};
					await Promise.all(ids.map(async (id) => {
						let value = await readData(`${type}-${id}`);
						if (type === 'app-state-sync-key' && value) {
							value = 1//proto.Message.AppStateSyncKeyData.fromObject(value);
						}

						data[id] = value;
					}));
					return data;
				},
				set: async (data:any) => {
						const tasks = [];
						for (const category in data) {

								for (const id in data[category]) {

										const value = data[category][id];
										const key = `${category}-${id}`;

										tasks.push(value ? writeData(value, key) : removeData(key));
								}
						}
						await Promise.all(tasks);
				}
			}
		},
		saveCreds: saveCreds
		}
};


export const deleteFromChatMetadataDb = async () => {
	const dayOffset = process.env.DATABASE_STORED_DAYS || 7;
	const pugeDate = new Date();
	pugeDate.setDate(pugeDate.getDate() - (dayOffset as any));

	database.deleteValues('chatMetadata', (metadata:any) => metadata.lastMessageTimestamp < pugeDate.getTime());
	
}
*/