import initBoundary from 'kozz-boundary-maker';
import baileysFunctions from 'src/Client/BaileysFunctions';
import { getGroupChat, getUnreadCount } from 'src/Store/ChatStore';
import { getChatOrder, recalculateChatOrder } from 'src/Store/MetadataStore';

export const createResourceGatheres = (
	boundary: ReturnType<typeof initBoundary>,
	baileys: ReturnType<typeof baileysFunctions>
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
		const groupData = await getGroupChat(id);
		if (!groupData) {
			return console.warn('Unable to fetch admin list from group ID:', id);
		}

		return {
			adminList: groupData.participants.filter(member => member.admin),
		};
	};

	const _getUnreadCount = async ({ id }: { id: string }) => {
		const unreadCount = await getUnreadCount(id);
		return unreadCount;
	};

	boundary.onAskResource('contact_profile_pic', _getProfilePicUrl);
	boundary.onAskResource('group_chat_info', _getGroupChatInfo);
	boundary.onAskResource('group_admin_list', _groupAdminList);
	boundary.onAskResource('get_unread_count', _getUnreadCount);

	boundary.onAskResource('get_chat_order', getChatOrder);
	boundary.onAskResource('recalculate_chat_order', recalculateChatOrder);
};
