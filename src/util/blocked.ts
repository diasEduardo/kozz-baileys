import { WaSocket } from 'src/Client/index.js';

export const fetchBlockedList = async (WaSocket: WaSocket) => {
	return WaSocket.fetchBlocklist();
};
