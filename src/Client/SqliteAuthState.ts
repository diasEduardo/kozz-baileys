import fs from 'fs/promises';
import syncFs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { appPaths } from 'src/InstanceConfig';
import {
	AuthenticationCreds,
	AuthenticationState,
	BufferJSON,
	initAuthCreds,
	proto,
	SignalDataTypeMap,
} from 'baileys';

type AuthRow = {
	value: string;
};

type SqliteDatabase = sqlite3.Database;

const fixFileName = (file: string) => file.replace(/\//g, '__').replace(/:/g, '-');

const createDatabase = (dbPath: string) => {
	syncFs.mkdirSync(path.dirname(dbPath), { recursive: true });
	return new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
};

const run = (db: SqliteDatabase, sql: string, params: unknown[] = []) =>
	new Promise<void>((resolve, reject) => {
		db.run(sql, params, err => {
			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	});

const close = (db: SqliteDatabase) =>
	new Promise<void>((resolve, reject) => {
		db.close(err => {
			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	});

const get = <T>(db: SqliteDatabase, sql: string, params: unknown[] = []) =>
	new Promise<T | undefined>((resolve, reject) => {
		db.get(sql, params, (err, row) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(row as T | undefined);
		});
	});

const all = <T>(db: SqliteDatabase, sql: string, params: unknown[] = []) =>
	new Promise<T[]>((resolve, reject) => {
		db.all(sql, params, (err, rows) => {
			if (err) {
				reject(err);
				return;
			}

			resolve(rows as T[]);
		});
	});

const initAuthDatabase = async (db: SqliteDatabase) => {
	await run(db, 'PRAGMA journal_mode = WAL');
	await run(db, 'PRAGMA busy_timeout = 5000');
	await run(
		db,
		`CREATE TABLE IF NOT EXISTS baileys_auth_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	);
};

const makeStorage = (db: SqliteDatabase) => {
	const storageKey = (file: string) => fixFileName(file);
	let writeQueue = Promise.resolve();

	const enqueueWrite = <T>(operation: () => Promise<T>) => {
		const pending = writeQueue.catch(() => undefined).then(operation);
		writeQueue = pending.then(
			() => undefined,
			() => undefined
		);
		return pending;
	};

	const normalizeLegacySenderKey = (file: string, value: unknown) => {
		if (!file.startsWith('sender-key-') || !value) {
			return value;
		}

		const raw = Buffer.isBuffer(value) ? value.toString('utf-8') : value;

		if (typeof raw !== 'string') {
			return value;
		}

		try {
			const parsed = JSON.parse(raw, BufferJSON.reviver);
			return Array.isArray(parsed) ? parsed : value;
		} catch {
			return value;
		}
	};

	const writeData = async (data: unknown, file: string) => {
		const key = storageKey(file);
		const serialized = JSON.stringify(data, BufferJSON.replacer);
		const updatedAt = Date.now();

		await enqueueWrite(() =>
			run(
				db,
				`INSERT INTO baileys_auth_state (key, value, updated_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(key) DO UPDATE SET
					value = excluded.value,
					updated_at = excluded.updated_at`,
				[key, serialized, updatedAt]
			)
		);
	};

	const readData = async <T>(file: string): Promise<T | null> => {
		const row = await get<AuthRow>(
			db,
			'SELECT value FROM baileys_auth_state WHERE key = ?',
			[storageKey(file)]
		);

		if (!row) {
			return null;
		}

		const value = JSON.parse(row.value, BufferJSON.reviver);

		return normalizeLegacySenderKey(file, value) as T;
	};

	const removeData = async (file: string) => {
		const key = storageKey(file);
		await enqueueWrite(() =>
			run(db, 'DELETE FROM baileys_auth_state WHERE key = ?', [key])
		);
	};

	const hasData = async (file: string) => {
		const row = await get<{ key: string }>(
			db,
			'SELECT key FROM baileys_auth_state WHERE key = ?',
			[storageKey(file)]
		);

		return Boolean(row);
	};

	return {
		writeData,
		readData,
		removeData,
		hasData,
	};
};

const migrateMultiFileAuthState = async (
	authDir: string,
	storage: ReturnType<typeof makeStorage>
) => {
	const files = await fs.readdir(authDir).catch(() => []);
	const jsonFiles = files.filter(file => file.endsWith('.json'));

	if (jsonFiles.length === 0) {
		return;
	}

	let migrated = 0;

	for (const file of jsonFiles) {
		if (await storage.hasData(file)) {
			continue;
		}

		const filePath = path.join(authDir, file);
		const raw = await fs.readFile(filePath, 'utf-8').catch(() => undefined);

		if (!raw) {
			continue;
		}

		await storage.writeData(JSON.parse(raw, BufferJSON.reviver), file);
		migrated += 1;
	}

	if (migrated > 0) {
		console.log(`Migrated ${migrated} Baileys auth files into SQLite`);
	}
};

export const resetSqliteAuthState = async (
	dbPath = appPaths.authDbPath,
	multiFileAuthDir = appPaths.credsDir
) => {
	const db = createDatabase(dbPath);
	try {
		await initAuthDatabase(db);
		const rows = await all<{ key: string }>(
			db,
			'SELECT key FROM baileys_auth_state'
		);
		await run(db, 'DELETE FROM baileys_auth_state');

		const legacyFiles = await fs.readdir(multiFileAuthDir).catch(() => []);
		const deletedLegacyFiles = await Promise.all(
			legacyFiles
				.filter(file => file.endsWith('.json'))
				.map(async file => {
					await fs.unlink(path.join(multiFileAuthDir, file)).catch(() => undefined);
					return file;
				})
		);

		return {
			sqliteKeysDeleted: rows.length,
			legacyFilesDeleted: deletedLegacyFiles.length,
		};
	} finally {
		await close(db);
	}
};

export const useSqliteAuthState = async (
	dbPath = appPaths.authDbPath,
	multiFileAuthDir = appPaths.credsDir
): Promise<{
	state: AuthenticationState;
	saveCreds: (update?: Partial<AuthenticationCreds>) => Promise<void>;
}> => {
	const db = createDatabase(dbPath);
	await initAuthDatabase(db);

	const storage = makeStorage(db);
	await migrateMultiFileAuthState(multiFileAuthDir, storage);

	const storedCreds = await storage.readData<AuthenticationState['creds']>(
		'creds.json'
	);
	const creds = storedCreds || initAuthCreds();

	if (!storedCreds) {
		await storage.writeData(creds, 'creds.json');
	}

	return {
		state: {
			creds,
			keys: {
				get: async <T extends keyof SignalDataTypeMap>(
					type: T,
					ids: string[]
				) => {
					const data: { [id: string]: SignalDataTypeMap[T] } = {};

					await Promise.all(
						ids.map(async id => {
							let value = await storage.readData<SignalDataTypeMap[T]>(
								`${type}-${id}.json`
							);

							if (type === 'app-state-sync-key' && value) {
								value = proto.Message.AppStateSyncKeyData.fromObject(
									value
								) as unknown as SignalDataTypeMap[T];
							}

							if (value) {
								data[id] = value;
							}
						})
					);

					return data;
				},
				set: async data => {
					const tasks: Promise<void>[] = [];

					for (const category in data) {
						const typedCategory = category as keyof SignalDataTypeMap;
						const categoryValues = data[typedCategory];

						if (!categoryValues) {
							continue;
						}

						for (const id in categoryValues) {
							const value = categoryValues[id];
							const file = `${typedCategory}-${id}.json`;

							tasks.push(
								value
									? storage.writeData(value, file)
									: storage.removeData(file)
							);
						}
					}

					await Promise.all(tasks);
				},
				clear: async () => {
					await run(db, 'DELETE FROM baileys_auth_state');
				},
			},
		},
		saveCreds: async update => {
			if (update) {
				Object.assign(creds, update);
			}

			const snapshot = JSON.parse(
				JSON.stringify(creds, BufferJSON.replacer),
				BufferJSON.reviver
			);
			await storage.writeData(snapshot, 'creds.json');
		},
	};
};
