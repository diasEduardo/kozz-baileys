import { initDatabase } from 'src/Store/DataManager';

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
	let contextData: ContextData = {
		blockedList: [],
		ready: false,
		hostData: {
			id: '',
			pushName: '',
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
