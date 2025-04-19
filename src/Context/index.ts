import { initDatabase } from 'src/Store/DataManager';
import { getMyContactFromCredentials } from 'src/util/utility';

type ContextData = {
	blockedList: string[];
	ready: boolean;
	qr: string | null;
	hostData: {
		id: string;
		pushName: string;
	};
	database: ReturnType<typeof initDatabase>;
};

export const setMeFromCreds = () => {
	let me = {
		id: '',
		pushName: '',
	};
	try {
		const meCred = getMyContactFromCredentials();
		me.id = meCred.id;
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
		database: initDatabase(),
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
