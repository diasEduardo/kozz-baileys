import { proto, WAMessage } from 'baileys';
import { MessageReceived } from 'kozz-types';
import { waSocket } from 'src/Client/index.js';
import Context from 'src/Context/index.js';
import { boundary } from 'src/index.js';
import { createMessagePayload } from 'src/PayloadTransformers/index.js';
import { timestampToHour, getMessagePreview } from 'src/util/utility.js';
import { saveMessage } from './MessageStore.js';
import { updateChatMetadata } from './MetadataStore.js';
import { MessageLeaseModel } from './models.js';
import PQueue from 'p-queue';


const database = Context.get('databaseLease');

export const saveMessageLease = async (
  message: WAMessage
): Promise<string> => {
  const id = message.key.id as string;
 
  database.upsert('messageLeaseLow', {
    id: id,
    timestamp: Date.now(),
    data: JSON.stringify(message),
    isProcessing: false  
  });
  
  return id;
};

export const saveManyMessageLease = async (
  messageList: (Partial<MessageLeaseModel> & {  id: string;})[]
): Promise<boolean> => {
  database.upsertMany('messageLeaseLow', messageList);
  return true;
};

const GetMessageLease = async () => {
  let currentMessage =  database.getNext('messageLeaseLow');

  if(currentMessage){
    processMessageLease(currentMessage.id,JSON.parse(currentMessage.data));
  }
}

const deleteMessageLease = async (
  id: string
) => {
    database.deleteValues('messageLeaseLow',(data: MessageLeaseModel) => data.id === id);
}

export const processMessageLease  = async (
  id: string,
  msg: any
) => {
    
  //console.log(JSON.stringify(msg))
  //console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage)
  //console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message)
  console.log(`processando mensagem ${id} em ${timestampToHour(msg.messageTimestamp*1000)}`);
  if (msg.message?.stickerMessage) {
    msg.message.stickerMessage.url = `https://mmg.whatsapp.net${msg.message.stickerMessage.directPath}`;
  }

  try {
    const payload = await createMessagePayload(msg, waSocket);
    if (Context.get('blockedList').includes(payload.from)) {
      return;
    }
    
    boundary.emitMessage(payload);

    await saveMessage(payload, msg);
    deleteMessageLease(id);

    updateChatMetadata({
      id: payload.chatId,
      lastMessagePreview: getMessagePreview(payload),
      lastMessageTimestamp: new Date().getTime(),
    });

    boundary.emitForwardableEvent('chat_order_move_to_top', payload.chatId);

  } catch (e) {

    database.upsert('messageLeaseLow', {
      id: id,
      isProcessing: false  
    });

    console.warn(e);
  }
}