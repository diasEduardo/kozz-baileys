import initBoundary from 'kozz-boundary-maker';
import { updateGroupData } from 'src/Client/index.js';
import baileysFunctions from 'src/Client/BaileysFunctions.js';
import Context from 'src/Context/index.js';
import { getChatDetails, getGroupChat, getUnreadCount } from 'src/Store/ChatStore.js';
import { getChatOrder } from 'src/Store/MetadataStore.js';



export const createResourceGatheres = (
	boundary: ReturnType<typeof initBoundary.default>,
	baileys: ReturnType<(typeof baileysFunctions)>
) => {
	const _getProfilePicUrl = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch profile pic but no ID was provided!');
		}

		const picUrl = await baileys.getProfilePic(id);
		return picUrl;
	};

	const _getGroupChatInfo = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch group chat info but no ID was provided');
		}
		if (!id.includes('@g.us')) {
			return console.warn(
				'Tried to fetch group chat info but got an invalid ID:',
				id
			);
		}
		const groupData = await getGroupChat(id);
		if (!groupData) {
			return console.warn('Unable to fetch group chat info for ID:', id);
		}

		return groupData;
	};

	const _groupAdminList = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch group chat info but no ID was provided');
		}
		if (!id.includes('@g.us')) {
			return console.warn(
				'Tried to fetch group chat info but got an invalid ID:',
				id
			);
		}
		let groupData = await getGroupChat(id);
		
		const oneHour = 1;//3600000;// 60 * 60 * 1000;
		if (!groupData || groupData?.lastFetched! < (new Date().getTime() + oneHour)) {
			await updateGroupData(id);
			groupData = await getGroupChat(id);
			if (!groupData) {
				return console.warn('Unable to fetch admin list from group ID:', id);
			}
			
		}
		
		return {
			adminList: groupData.participants.filter((member:any) => member.admin),
		};
	};

	const _getUnreadCount = async ({ id }: { id: string }) => {
		const unreadCount = await getUnreadCount(id);
		return unreadCount;
	};

	const _getChatDetails = async ({ id }: { id: string }) => {
		const chatDetails = getChatDetails(id);
		return chatDetails;
	};

	const fetchChatStatus = () => {
		return {
			qr: Context.get('qr'),
			ready: Context.get('ready'),
		};
	};

	boundary.onAskResource('contact_profile_pic', _getProfilePicUrl);
	boundary.onAskResource('group_chat_info', _getGroupChatInfo);
	boundary.onAskResource('group_admin_list', _groupAdminList);
	boundary.onAskResource('unread_count', _getUnreadCount);
	boundary.onAskResource('chat_details', _getChatDetails);

	boundary.onAskResource('chat_order', getChatOrder);

	boundary.onAskResource('chat_status', fetchChatStatus);
};
