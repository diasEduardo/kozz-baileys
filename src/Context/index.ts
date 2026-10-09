import { initDatabase } from 'src/Store/DataManager.js';
import { getMyContactFromCredentials } from 'src/util/utility.js';
import {
	contactSchema,
	EntityMap,
	groupChatSchema,
	mediaSchema,
	messageSchema,
	privateChatSchema,
	chatMetadataModel,
	groupParticipantMetadataSchema,
	groupParticipantUpdateSchema,
	keysSchema,
	credsSchema,
	messageLeaseSchema
} from 'src/Store/models.js';

const databasePath = "I:/gitProject/my-kozz-bot/kozz-baileys";
const schemaVersion = 14;

const configCreds = {
	schema: [
		keysSchema,
		credsSchema
	],
	path: `${databasePath}/credential.realm`,
	schemaVersion: schemaVersion,
};

const config = {
	schema: [
		contactSchema,
		mediaSchema,
		messageSchema,
		groupChatSchema,
		chatMetadataModel
	],
	path: `${databasePath}/message.realm`,
	schemaVersion: schemaVersion,
};

const configMetadata = {
	schema: [
		groupParticipantMetadataSchema,
		groupParticipantUpdateSchema
	],
	path: `${databasePath}/metadata.realm`,
	schemaVersion: schemaVersion,
};

const configLease = {
	schema: [
		messageLeaseSchema
	],
	path: `${databasePath}/lease.realm`,
	schemaVersion: schemaVersion,
};

type ContextData = {
	blockedList: (string|undefined)[];
	ready: boolean;
	qr: string | null;
	hostData: {
		id: string;
		lid: string;
		pushName: string;
	};	
	database: ReturnType<typeof initDatabase>;
	databaseCreds: ReturnType<typeof initDatabase>;
	databaseMetadata: ReturnType<typeof initDatabase>;
	databaseLease: ReturnType<typeof initDatabase>;
};

export const setMeFromCreds = () => {
	let me = {
		id: '',
		lid: '',
		pushName: '',
	};
	try {
		const meCred = getMyContactFromCredentials();
		me.id = meCred.id;
		me.lid = meCred.lid;
		me.pushName = meCred.name;
	} catch (e) {}
	return me;
};

const AppContext = () => {
	// Initial context
	const me = setMeFromCreds();

	let contextData: ContextData = {
		blockedList: [],
		ready: false,
		qr: null,
		hostData: me,
		database: initDatabase(config),
		databaseCreds: initDatabase(configCreds),
		databaseLease: initDatabase(configLease),
		databaseMetadata: initDatabase(configMetadata),
	};

	const upsert = (data: Partial<ContextData>) => {
		contextData = {
			...contextData,
			...data,
		};
	};

	const get = <Key extends keyof ContextData>(key: Key): ContextData[Key] => {
		return contextData[key];
	};

	return {
		get,
		upsert,
	};
};

export default AppContext();
