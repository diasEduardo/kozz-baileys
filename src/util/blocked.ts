import { WaSocket } from 'src/Client';

export const fetchBlockedList = async (WaSocket: WaSocket) => {
	return WaSocket.fetchBlocklist();
};
