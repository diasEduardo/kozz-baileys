import { initDatabase } from 'src/Store/DataManager';
import { getMyContactFromCredentials } from 'src/util/utility';

type ContextData = {
	blockedList: string[];
	ready: boolean;
	hostData: {
		id: string;
		pushName: string;
	};
	database: ReturnType<typeof initDatabase>;
};

const AppContext = () => {
	// Initial context
	const me = getMyContactFromCredentials();

	let contextData: ContextData = {
		blockedList: [],
		ready: false,
		hostData: {
			id: me.id,
			pushName: me.name,
		},
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
